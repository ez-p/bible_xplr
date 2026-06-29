# Keyword Highlighting

Keyword highlighting is the bridge between Claude's textual analysis and the interactive UI. The full lifecycle spans the server (injection), the network (HTML with spans), and the client (rendering + click handling).

---

## Full Lifecycle

```
1. Claude returns keywords (in /api/passage Route Handler)
   [ { word: "eternal life", theme: "Eschatological Salvation", originalLanguage: "Greek" }, ... ]

2. Server calls injectKeywordHighlights(rawHtml, keywords)  [lib/highlight.ts]
   → returns HTML with <span class="keyword-highlight"
                               data-keyword="eternal life"
                               data-theme="Eschatological Salvation"
                               data-lang="Greek">eternal life</span>
                        injected around every match

3. passageHtml (with spans) is returned in API response JSON

4. BibleExplorer stores result in state, passes passageHtml to PassageDisplay

5. PassageDisplay renders:
   <div
     className="esv-passage ..."
     dangerouslySetInnerHTML={{ __html: passageHtml }}
     onClick={handleClick}
   />

6. User clicks a highlighted word
   → handleClick fires on the wrapper div (event delegation)
   → e.target.closest('[data-keyword]') finds the span
   → span.dataset.keyword gives the word string
   → keywords.find(...) retrieves the full Keyword object
   → onKeywordClick(kw) is called

7. BibleExplorer.handleKeywordClick sets selectedKeyword({ ...kw })
   → ExpositionDrawer opens, useEffect fires, stream begins
```

---

## Why Injection Is Server-Side

The highlight spans are injected in the Route Handler, not in the browser.

**Alternative rejected:** Inject client-side by walking DOM text nodes after `dangerouslySetInnerHTML` renders. This approach requires a `useEffect`, a `MutationObserver` or direct DOM traversal, and manual insertion of DOM nodes — all outside React's rendering model. It is fragile, hard to test, and can cause hydration mismatches.

**Server-side advantage:** The Route Handler produces a complete HTML string with spans already in place. The client simply renders it once and attaches a single event listener. React's reconciliation never touches the ESV HTML content — it is opaque to React (a black-box string handed to the browser).

The tradeoff is a slightly larger API response payload (the span tags add a few hundred bytes per passage), which is negligible.

---

## `injectKeywordHighlights` — Implementation

**File:** `lib/highlight.ts`

```ts
export function injectKeywordHighlights(html: string, keywords: Keyword[]): string {
  // Sort longest first so "eternal life" matches before "life"
  const sorted = [...keywords].sort((a, b) => b.word.length - a.word.length)

  let result = html
  for (const kw of sorted) {
    const escaped = kw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = kw.word.includes(' ') ? '' : '\\b'
    const pattern = new RegExp(`(<[^>]*>)|${boundary}(${escaped})${boundary}`, 'gi')
    const theme = kw.theme.replace(/"/g, '&quot;')
    result = result.replace(pattern, (_match, tag, word) => {
      if (tag) return tag
      return `<span class="keyword-highlight" data-keyword="${kw.word}" data-theme="${theme}" data-lang="${kw.originalLanguage}">${word}</span>`
    })
  }
  return result
}
```

### Step-by-step

1. **Sort by length descending.** Keywords are processed longest-first. This ensures a multi-word phrase like `"eternal life"` is matched and wrapped before a single-word pass for `"life"` would alter the same text. Without this, `"eternal life"` could be split across two separate spans.

2. **Escape the keyword for regex.** `kw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` escapes any regex metacharacters in the keyword string (e.g. if a keyword contained a `.` it should match a literal dot, not any character).

3. **Word boundary selection.**
   - Single-word keywords (no space): `\b` on both sides ensures `"faith"` does not match inside `"faithful"`.
   - Multi-word keywords (contains space): no `\b` is added. `\b` cannot straddle a space boundary in a useful way for phrases — the phrase itself defines its own boundaries within text content.

4. **The skip-tags regex pattern.**

   ```
   (<[^>]*>)|(keyword)
   ```

   The alternation has two capture groups:
   - `(<[^>]*>)` — matches any HTML tag (opening, closing, or self-closing). The `[^>]*` matches everything except `>`, so the entire tag from `<` to `>` is captured.
   - `(keyword)` — matches the keyword in text content.

   In the replacement function:
   ```ts
   (_match, tag, word) => {
     if (tag) return tag     // preserve the HTML tag unchanged
     return `<span ...>${word}</span>`
   }
   ```

   Because the tag group is tested first (`if (tag) return tag`), HTML tags are always returned verbatim. Only the second alternation branch (plain text keyword) reaches the span-wrapping code.

   This pattern correctly handles keywords that appear:
   - Inside paragraphs: `<p>For God so <keyword/> the world</p>`
   - Inside verse-number spans: `<b class="verse-num">16 </b><span class="woc">...keyword...`
   - In section headings: `<h3>For God So Loved the World</h3>`

5. **Data attributes on the span.**

   ```html
   <span
     class="keyword-highlight"
     data-keyword="eternal life"
     data-theme="Eschatological Salvation"
     data-lang="Greek"
   >eternal life</span>
   ```

   - `data-keyword` — the verbatim keyword string, used by `PassageDisplay.handleClick` to look up the `Keyword` object.
   - `data-theme` — HTML-escaped theme label (quotes replaced with `&quot;`).
   - `data-lang` — `"Greek"` or `"Hebrew"`.

   The `data-theme` and `data-lang` attributes are stored for potential direct access but the click handler actually looks up the full `Keyword` from the `keywords` prop array to ensure type-safe access.

---

## Click Handling — Event Delegation

**Location:** `components/PassageDisplay.tsx`

```ts
function handleClick(e: React.MouseEvent<HTMLDivElement>) {
  const span = (e.target as HTMLElement).closest<HTMLElement>('[data-keyword]')
  if (!span) return
  const word = span.dataset.keyword!
  const kw = keywords.find(k => k.word.toLowerCase() === word.toLowerCase())
  if (kw) onKeywordClick(kw)
}
```

**Why delegation:** React manages the wrapper `<div>` (a real React element). The content inside `dangerouslySetInnerHTML` consists of raw DOM nodes that React does not track. React `onClick` props cannot be attached to those nodes. A single delegated listener on the React-managed parent is the correct pattern and is also more efficient than many individual listeners.

**`closest('[data-keyword]')`:** The click target might be a text node's parent (the span itself) or, for nested markup (e.g. `<span class="woc"><span class="keyword-highlight">...`), a child of the span. `closest` traverses up the DOM to find the nearest ancestor with a `data-keyword` attribute, handling both cases.

**Case-insensitive lookup:** `k.word.toLowerCase() === word.toLowerCase()` handles the fact that the ESV section heading may be all-caps (e.g. `LOVED` in `FOR GOD SO LOVED THE WORLD`). The injected `data-keyword` preserves the original casing from Claude's keyword list; the lookup normalizes both sides.

---

## What Gets Highlighted

- Keywords appear in both the section heading HTML (`<h3>`) and the passage body — all occurrences are highlighted. This is intentional: it reinforces the keyword's presence throughout the passage.
- The `flags: 'gi'` on the regex makes matching case-insensitive (so `"loved"` matches `"Loved"` and `"LOVED"`) and global (all occurrences).
- Each keyword is processed in a separate pass over the full HTML. Earlier-injected spans are already in the string when later keywords are processed; the skip-tags pattern ensures the already-injected spans are not re-processed because their tag content is preserved verbatim.
