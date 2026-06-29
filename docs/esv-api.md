# ESV API Integration

The English Standard Version (ESV) Bible text is fetched from the ESV API (`api.esv.org`). The API requires a token passed as `Authorization: Token <ESV_API_TOKEN>` in the request header. The token is stored in `.env.local` and read server-side only.

---

## Two Endpoints, Two Purposes

The app calls two ESV API endpoints for every passage fetch. They serve different consumers:

| Endpoint | Consumer | Why |
|---|---|---|
| `/v3/passage/text/` | Claude | LLMs work better with clean plain text; verse numbers and markup add noise |
| `/v3/passage/html/` | Browser (PassageDisplay) | Pre-formatted HTML preserves ESV typographic structure: poetry indentation, paragraph breaks, section headings, verse numbers |

Both are called in a single `Promise.all` from `/api/passage` so they run in parallel.

---

## Query Parameters

### Text endpoint (`/v3/passage/text/`)

Used as input to Claude for keyword detection and exposition.

| Parameter | Value | Reason |
|---|---|---|
| `q` | URL-encoded reference | The passage query |
| `include-headings` | `false` | Section headings add structure irrelevant to LLM analysis |
| `include-footnotes` | `false` | Footnote markers disrupt the text flow |
| `include-verse-numbers` | `false` | Verse numbers in plain text confuse LLM tokenization |
| `include-short-copyright` | `false` | Copyright notice not needed for LLM input |
| `include-passage-references` | `false` | Reference header at top is redundant |

### HTML endpoint (`/v3/passage/html/`)

Used for display in `PassageDisplay` via `dangerouslySetInnerHTML`.

| Parameter | Value | Reason |
|---|---|---|
| `q` | URL-encoded reference | The passage query |
| `include-headings` | `true` | Section headings (e.g. "For God So Loved the World") aid navigation in longer passages |
| `include-footnotes` | `false` | Footnotes would require styling the footnote section |
| `include-verse-numbers` | `true` | Verse numbers displayed as superscripts for reference |
| `include-short-copyright` | `false` | Copyright notice omitted from display HTML |
| `include-passage-references` | `false` | Reference shown separately as the `<h2>` heading |
| `include-css-link` | `false` | ESV's default CSS is not used; all styling via Tailwind/globals.css |

---

## Parallel Fetch Pattern

```ts
const q = encodeURIComponent(reference)
const auth = `Token ${process.env.ESV_API_TOKEN}`

const [textRes, htmlRes] = await Promise.all([
  fetch(`${ESV_BASE}/text/?q=${q}&include-headings=false&...`, { headers: { Authorization: auth } }),
  fetch(`${ESV_BASE}/html/?q=${q}&include-headings=true&...`,  { headers: { Authorization: auth } }),
])
```

Error handling: only `textRes.ok` is checked. If the text fetch fails, the error is extracted from the text response body and returned to the client. The HTML response is discarded. The reasoning: if the reference is invalid the text endpoint will fail, and the HTML endpoint will fail the same way — checking one is sufficient.

After checking `textRes.ok`, both response bodies are parsed in parallel:

```ts
const [textData, htmlData] = await Promise.all([textRes.json(), htmlRes.json()])
```

---

## The `canonical` Field

The ESV API response includes a `canonical` field with the normalized reference string:

```json
{ "canonical": "John 3:16", "passages": ["..."] }
```

For ranges, the ESV API uses an en-dash: `"John 3:10–22"`. This canonical value is returned as `reference` in the API response and displayed as the passage heading in `PassageDisplay`. Using the canonical form rather than the raw user input ensures consistent, properly formatted references.

---

## ESV HTML Structure

The HTML endpoint returns markup with ESV-specific CSS classes. Since `include-css-link=false` is set, these classes have no default styles — they must be styled by the application.

### Classes used

| Class | Element | Meaning |
|---|---|---|
| `.verse-num` | `<b>` | Verse number (e.g. `16`) |
| `.chapter-num` | `<b>` | Chapter number at start of a book section (large drop-cap style) |
| `.woc` | `<span>` | Words of Christ (traditionally rendered in red) |
| `h3` | `<h3>` | Section heading (e.g. "For God So Loved the World") |

Poetry passages use `<blockquote>` with nested `.line` spans for indentation. The app styles `blockquote` with left padding.

### Styling in `globals.css`

```css
.esv-passage p           { @apply mb-4; }
.esv-passage h3          { @apply text-sm font-semibold text-stone-500 uppercase tracking-wide mt-6 mb-2 font-sans; }
.esv-passage .verse-num  { @apply text-xs font-bold text-stone-400 align-super mr-0.5 not-italic font-sans; }
.esv-passage .chapter-num{ @apply text-5xl font-bold text-stone-700 float-left mr-2 mt-1 leading-none font-sans; }
.esv-passage .woc        { @apply text-red-700; }
.esv-passage blockquote  { @apply pl-6 my-2; }
.esv-passage blockquote p{ @apply mb-1; }
```

The `esv-passage` class is applied to the wrapper `<div>` in `PassageDisplay`. All child selectors are scoped under it to avoid polluting other page styles.

The passage text itself uses `font-serif` (Lora, loaded via `next/font/google`), while verse numbers, headings, and the `chapter-num` drop-cap use `font-sans` (Geist) for contrast.

---

## Keyword Highlight Injection

After the ESV HTML is fetched, `injectKeywordHighlights(rawHtml, keywords)` from `lib/highlight.ts` is called to inject `<span class="keyword-highlight">` tags before the HTML is returned to the client.

See [`keyword-highlighting.md`](keyword-highlighting.md) for the full implementation detail.

The resulting spans receive CSS from `globals.css`:

```css
.keyword-highlight {
  background-color: rgb(251 191 36 / 0.25);  /* amber-400 at 25% opacity */
  border-bottom: 2px solid rgb(245 158 11);  /* amber-500 solid underline */
  border-radius: 2px;
  padding: 0 1px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.keyword-highlight:hover {
  background-color: rgb(251 191 36 / 0.5);
}
```

Amber tones were chosen deliberately: warm enough to be clearly visible against the cream/stone background, but not so bright as to make the passage difficult to read.
