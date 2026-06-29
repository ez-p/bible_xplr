# Components

All interactive components are Client Components (`"use client"`). `app/page.tsx` and `app/layout.tsx` are Server Components. The component tree is intentionally shallow: one stateful orchestrator (`BibleExplorer`) with three focused children.

---

## Shared Types (`lib/types.ts`)

```ts
export interface Keyword {
  word: string            // verbatim word/phrase as it appears in passage text
  theme: string           // short label, e.g. "Divine Love"
  originalLanguage: string // "Greek" or "Hebrew"
}

export interface PassageResult {
  passageText: string     // clean plain text (Claude input)
  passageHtml: string     // ESV HTML with keyword spans injected
  reference: string       // canonical reference, e.g. "John 3:16"
  keywords?: Keyword[]    // may be empty if Claude detection failed
  notice?: string         // soft warning shown if keywords unavailable
}
```

---

## BibleExplorer

**File:** `components/BibleExplorer.tsx`  
**Type:** Client Component (`"use client"`)

### Purpose

Top-level orchestrator for the entire interactive experience. Owns all application state. `app/page.tsx` renders nothing but this component inside a `<main>`.

### Props

None. Self-contained.

### State

| Variable | Type | Description |
|---|---|---|
| `reference` | `string` | Controlled value of the text input |
| `isLoading` | `boolean` | True while `POST /api/passage` is in-flight |
| `error` | `string \| undefined` | Passage fetch error message |
| `result` | `PassageResult \| null` | Null before first search and during loading |
| `selectedKeyword` | `Keyword \| null` | Currently active keyword; drives drawer open/close |

### Key behaviors

- `handleSubmit()` clears `result` to `null` before fetching so the loading skeleton is shown immediately.
- `handleKeywordClick(kw)` spreads `{ ...kw }` to ensure `ExpositionDrawer`'s `useEffect` re-fires even when the same keyword is clicked twice (see [architecture.md — same-keyword re-click](architecture.md)).
- `ExpositionDrawer` is rendered outside the scrollable content div so it sits at the document root level for the Sheet portal.
- The loading skeleton (`animate-pulse` shimmer bars) is shown when `isLoading` is true; it disappears and `PassageDisplay` appears when `result` is set.

### Layout

```
<>
  <div centered column>         ← scroll container
    <header />
    <PassageInput />
    {isLoading && <Skeleton />}
    {result && <PassageDisplay />}
  </div>
  {result && <ExpositionDrawer />}  ← outside scroll container
</>
```

---

## PassageInput

**File:** `components/PassageInput.tsx`  
**Type:** Client Component (`"use client"`)

### Purpose

Controlled text input form. Fires a callback on submit. Displays inline error messages.

### Props

```ts
interface PassageInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  isLoading: boolean
  error?: string
}
```

### Key behaviors

- Wraps input and button in a `<form>` with `onSubmit` → `e.preventDefault()` → calls `onSubmit` prop. This supports both Enter-key and button-click submission.
- Button is disabled when `isLoading` or `value.trim()` is empty.
- During loading: button shows a `Loader2` (Lucide) spinning icon alongside "Exploring…".
- `error` prop renders as a red `<p>` below the input row.
- Input uses Tailwind focus ring in amber (`focus:ring-amber-500`) to match the keyword highlight color palette.

---

## PassageDisplay

**File:** `components/PassageDisplay.tsx`  
**Type:** Client Component (`"use client"`)

### Purpose

Renders the ESV passage HTML (with keyword spans already injected) and handles keyword click events via event delegation.

### Props

```ts
interface PassageDisplayProps {
  passageHtml: string         // HTML string with .keyword-highlight spans
  reference: string           // shown as heading above passage
  keywords: Keyword[]         // used to look up full Keyword object on click
  onKeywordClick: (kw: Keyword) => void
  notice?: string             // optional soft warning banner
}
```

### Key behaviors

**Rendering:** The passage is injected via:

```tsx
<div
  className="esv-passage font-serif text-lg leading-relaxed text-stone-800"
  dangerouslySetInnerHTML={{ __html: passageHtml }}
  onClick={handleClick}
/>
```

The `esv-passage` class activates CSS rules in `globals.css` that style ESV-specific HTML classes (`.verse-num`, `.chapter-num`, `.woc`, `h3`).

**Click handling (event delegation):**

```ts
function handleClick(e: React.MouseEvent<HTMLDivElement>) {
  const span = (e.target as HTMLElement).closest<HTMLElement>('[data-keyword]')
  if (!span) return
  const word = span.dataset.keyword!
  const kw = keywords.find(k => k.word.toLowerCase() === word.toLowerCase())
  if (kw) onKeywordClick(kw)
}
```

A single listener on the wrapper div catches all clicks, traverses up to the nearest `[data-keyword]` ancestor, looks up the matching `Keyword` from props, and fires the callback. This is necessary because the spans live inside `dangerouslySetInnerHTML` content that React does not manage directly.

**Notice banner:** If `notice` is set (Claude keyword detection failed), a soft amber banner is shown above the passage.

**Hint text:** When `keywords.length > 0`, a small helper text appears: "Click a highlighted word to explore its original language meaning."

---

## ExpositionDrawer

**File:** `components/ExpositionDrawer.tsx`  
**Type:** Client Component (`"use client"`)

### Purpose

Right-side drawer (shadcn/ui `Sheet`, backed by `@base-ui/react/dialog`) that streams and displays a scholarly original-language exposition for a clicked keyword.

### Props

```ts
interface ExpositionDrawerProps {
  keyword: Keyword | null   // null = drawer closed
  passageText: string       // sent to /api/exposition for context
  reference: string         // sent to /api/exposition for context
  onClose: () => void       // called when Sheet closes (clears selectedKeyword in BibleExplorer)
}
```

### Internal state

| Variable | Type | Description |
|---|---|---|
| `summary` | `string` | Accumulated text from `===SUMMARY===` section |
| `fullExposition` | `string` | Accumulated text from `===FULL===` section |
| `phase` | `"pre" \| "summary" \| "full"` | Stream parsing phase |
| `showFull` | `boolean` | Whether user has clicked "Read more" |
| `isStreaming` | `boolean` | True while fetch is active |
| `streamError` | `string \| null` | Error message if stream fails |

### Stream phase state machine

```
"pre"     → waiting for ===SUMMARY=== marker
"summary" → between ===SUMMARY=== and ===FULL===; summary is streaming in
"full"    → past ===FULL=== marker; summary is complete, full is streaming in
```

The `parseBuffer(buf)` function re-parses the entire accumulated buffer on each chunk — no incremental state needed:

```ts
function parseBuffer(buf: string): { summary, full, phase } {
  const summaryIdx = buf.indexOf('===SUMMARY===')
  if (summaryIdx === -1) return { summary: '', full: '', phase: 'pre' }

  const afterSummary = buf.slice(summaryIdx + 13).replace(/^\n/, '')
  const fullIdx = afterSummary.indexOf('===FULL===')

  if (fullIdx === -1) return { summary: afterSummary, full: '', phase: 'summary' }

  return {
    summary: afterSummary.slice(0, fullIdx).trim(),
    full: afterSummary.slice(fullIdx + 10).replace(/^\n/, ''),
    phase: 'full',
  }
}
```

### Progressive disclosure UX

1. Drawer opens immediately on keyword click.
2. Three bouncing dots shown while `phase === "pre"` (waiting for first text).
3. Summary streams in as text arrives; a blinking cursor (`StreamCursor`) follows the last character.
4. When `phase` transitions to `"full"`, summary is complete → "Read more" button appears.
5. User clicks "Read more" → full exposition reveals (may still be streaming).
6. Inline cursor follows the last paragraph of full exposition while streaming.

### Drawer open/close

```tsx
<Sheet
  open={keyword !== null}
  onOpenChange={(open) => { if (!open) onClose() }}
>
```

`open` is derived from `keyword !== null`. When the Sheet's close button or backdrop is clicked, Base UI fires `onOpenChange(false)`, which calls `onClose()`, which sets `selectedKeyword(null)` in `BibleExplorer`, which sets `open` to `false`. No separate open state is needed.

### Markdown rendering

The `md()` helper renders `**bold**` and `*italic*` inline without a library:

```ts
function md(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}
```

Applied to both `summary` and each paragraph of `fullExposition`. Claude regularly uses `**GreekWord**` for original language terms and `*transliteration*` for romanized forms.
