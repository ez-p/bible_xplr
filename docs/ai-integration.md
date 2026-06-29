# AI Integration

The app uses the Anthropic Claude API at two points in the user flow: keyword detection (non-streaming, JSON output) and exposition generation (streaming, structured text). Both calls are server-side only via Next.js Route Handlers. The Anthropic SDK (`@anthropic-ai/sdk`) is used directly — no wrapper like LangChain or Vercel AI SDK.

---

## Model

**`claude-sonnet-4-6`** is used for both calls. This is the current Sonnet generation — capable enough for nuanced biblical scholarship while fast enough for a synchronous keyword detection step and a streaming exposition.

The Anthropic client is instantiated once at module level in each route file:

```ts
import Anthropic from '@anthropic-ai/sdk'
const anthropic = new Anthropic()  // reads ANTHROPIC_API_KEY from process.env
```

---

## Keyword Detection

**Called in:** `app/api/passage/route.ts`, function `detectKeywords(passageText, reference)`

**SDK call:** `anthropic.messages.create()` (non-streaming)

### System prompt

```
You are a biblical scholar and theologian specializing in original language word studies.
```

### User prompt template

```
Identify 3–8 major theological theme keywords in this Bible passage. Choose words central to
meaning, doctrine, or interpretive significance — not generic words.

Passage (${reference}):
"${passageText}"

Return ONLY a valid JSON object:
{
  "keywords": [
    { "word": "loved", "theme": "Divine Love", "originalLanguage": "Greek" }
  ]
}

Rules:
- "word" must appear verbatim in the passage text above (exact spelling, may be a short phrase)
- "originalLanguage": "Greek" for New Testament; "Hebrew" for Old Testament (Genesis–Malachi)
- "theme": short label, 2–4 words
```

### Response shape

```json
{
  "keywords": [
    { "word": "loved",        "theme": "Divine Love",              "originalLanguage": "Greek" },
    { "word": "world",        "theme": "Universal Scope",          "originalLanguage": "Greek" },
    { "word": "only Son",     "theme": "Christological Identity",  "originalLanguage": "Greek" },
    { "word": "believes",     "theme": "Saving Faith",             "originalLanguage": "Greek" },
    { "word": "perish",       "theme": "Divine Judgment",          "originalLanguage": "Greek" },
    { "word": "eternal life", "theme": "Eschatological Salvation", "originalLanguage": "Greek" }
  ]
}
```

### JSON extraction

Claude is instructed to return only JSON, but in practice it sometimes wraps the response in markdown code fences (` ```json ... ``` `). The extraction uses a regex to find the first `{...}` block regardless:

```ts
const match = raw.match(/\{[\s\S]*\}/)
if (!match) return []
try {
  const data = JSON.parse(match[0])
  return Array.isArray(data.keywords) ? data.keywords : []
} catch {
  return []
}
```

### Graceful degradation

`detectKeywords` is wrapped in a try/catch inside the route handler:

```ts
let keywords: Keyword[] = []
let keywordError = false
try {
  keywords = await detectKeywords(passageText, canonical)
} catch {
  keywordError = true
}
```

If Claude fails (network error, quota exceeded, malformed response), the passage is still returned without highlights. A `notice` field is added to the response, which `PassageDisplay` renders as a soft amber banner. The app remains fully usable.

---

## Exposition Generation (Streaming)

**Called in:** `app/api/exposition/route.ts`

**SDK call:** `anthropic.messages.stream()` (streaming)

### System prompt

```
You are a biblical scholar specializing in ${originalLanguage} original language word studies
and their theological significance.
```

The `originalLanguage` parameter (Greek or Hebrew) is inserted so the system prompt primes Claude for the correct linguistic tradition.

### User prompt template

```
Generate an original-language exposition for the keyword "${keyword}" in this Bible passage.

Passage: ${reference}
"${passageText}"

Keyword: "${keyword}" | Theme: ${theme} | Language: ${originalLanguage}

Structure your response EXACTLY as follows, using these exact markers on their own lines:

===SUMMARY===
[2–3 sentences: state the original ${originalLanguage} word and its transliteration, then
explain its core meaning and how it specifically deepens understanding of this verse]

===FULL===
[3–5 paragraphs: (1) etymology and root meaning, (2) usage across key Scripture passages,
(3) theological significance, (4) how this original-language knowledge expands the reader's
understanding of this specific passage]
```

### Delimiter protocol

Claude is instructed to use `===SUMMARY===` and `===FULL===` as section markers. These markers appear on their own lines in the streamed output, allowing the client to split the stream into two independently displayable sections without waiting for the full response.

This delimiter approach was chosen over JSON streaming (which would require a complete parse before display) and SSE events (which would require a custom event protocol). Plain text with markers is the simplest solution that enables progressive disclosure.

---

## Client-side Stream Parsing

**Location:** `components/ExpositionDrawer.tsx`, function `parseBuffer(buf)`

The client reads the `ReadableStream` body in a `while(true)` loop:

```ts
const reader = res.body!.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break
  buffer += decoder.decode(value, { stream: true })
  const parsed = parseBuffer(buffer)
  setSummary(parsed.summary)
  setFullExposition(parsed.full)
  setPhase(parsed.phase)
}
```

Each chunk extends `buffer`, then `parseBuffer` is called on the full accumulated string. This stateless re-parse approach is simpler and more correct than an incremental state machine — it naturally handles cases where a delimiter arrives split across two chunks.

### parseBuffer logic

```ts
function parseBuffer(buf: string): { summary: string; full: string; phase: Phase } {
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

### Phase state machine

```
phase = "pre"     → neither marker seen yet; show bouncing dots loader
phase = "summary" → past ===SUMMARY===, before ===FULL===; summary streaming in
phase = "full"    → past ===FULL===; summary complete, full exposition streaming in
```

The "Read more" button becomes visible when `phase === "full"`. At that point, summary is complete (fully captured between the two markers), and full is actively streaming. Clicking "Read more" reveals the full exposition even while it is still arriving.

---

## Inline Markdown Renderer (`md()`)

**Location:** `components/ExpositionDrawer.tsx`

Claude consistently uses markdown formatting in its exposition responses:
- `**GreekWord**` for original language terms (e.g. `**ἀγαπάω**`)
- `*transliteration*` for romanized forms (e.g. `*agapaō*`)

Since the exposition text is rendered as plain React text nodes (not HTML), these asterisks would appear literally without a renderer. A full markdown library (react-markdown, marked) would be overkill for this use case. Instead a minimal inline renderer handles just bold and italic:

```ts
function md(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4)
      return <strong key={i} className="font-semibold text-stone-800">{part.slice(2, -2)}</strong>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}
```

**Regex breakdown:** `(\*\*[^*\n]+\*\*|\*[^*\n]+\*)` — alternation between double-asterisk and single-asterisk spans, anchored so they cannot span newlines (`[^*\n]`). `String.split` with a capturing group keeps the matched tokens in the result array, which are then mapped to `<strong>`, `<em>`, or plain string.

**Streaming safety:** While summary is still streaming, incomplete sequences like `**ζωὴ` will not match the regex (no closing `**`) and render as plain text. Once the full token arrives in a later chunk, the next render cycle will match and apply the formatting. This is imperceptible to the user.

`md()` is applied to the `summary` paragraph and to each paragraph of `fullExposition` (paragraphs split on `\n\n`).
