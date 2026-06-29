# API Routes

Both routes live under `app/api/` and are Next.js Route Handlers (App Router). They use the standard Web `Request` / `Response` APIs. All external secrets (`ESV_API_TOKEN`, `ANTHROPIC_API_KEY`) are read from `process.env` and never reach the client.

---

## POST /api/passage

**File:** `app/api/passage/route.ts`

### Purpose

Fetches a Bible passage from the ESV API (both plain-text and HTML variants), sends the plain text to Claude for keyword detection, injects keyword highlight spans into the HTML, and returns everything the client needs to render the passage.

### Request

```json
{ "reference": "John 3:16" }
```

`reference` is the raw user input string. It is URL-encoded and passed directly as the ESV API `q` parameter. No custom parsing is performed; invalid references are surfaced as errors from the ESV API.

### Response (success, 200)

```json
{
  "passageText": "For God so loved the world...",
  "passageHtml": "<p><b class=\"verse-num\">16 </b><span class=\"woc\">...<span class=\"keyword-highlight\" data-keyword=\"loved\" data-theme=\"Divine Love\" data-lang=\"Greek\">loved</span>...</span></p>",
  "reference": "John 3:16",
  "keywords": [
    { "word": "loved",        "theme": "Divine Love",             "originalLanguage": "Greek" },
    { "word": "world",        "theme": "Universal Scope",         "originalLanguage": "Greek" },
    { "word": "eternal life", "theme": "Eschatological Salvation","originalLanguage": "Greek" }
  ]
}
```

- `passageText` — clean ESV plain text, no verse numbers or headings, trimmed. Used as Claude input for exposition.
- `passageHtml` — ESV HTML with `<span class="keyword-highlight">` injected for each keyword. Rendered via `dangerouslySetInnerHTML` in `PassageDisplay`.
- `reference` — the canonical reference string as returned by the ESV API (e.g. `"John 3:16"` or `"John 3:10–22"`).
- `keywords` — Claude's keyword list; may be empty if detection failed.

Optional field when Claude fails:

```json
{ "notice": "Keyword detection unavailable — passage shown without highlights." }
```

### Response (error, 400)

```json
{ "error": "Passage not found — check your reference format." }
```

or

```json
{ "error": "Reference is required" }
```

### Parallel fetch pattern

Both ESV endpoints are called in a single `Promise.all`:

```ts
const [textRes, htmlRes] = await Promise.all([
  fetch(`${ESV_BASE}/text/?q=${q}&...`, { headers: { Authorization: auth } }),
  fetch(`${ESV_BASE}/html/?q=${q}&...`, { headers: { Authorization: auth } }),
])
```

This halves the network latency compared to sequential fetches. The text result is checked for errors first; if the text fetch fails the HTML result is discarded.

### Claude keyword detection flow

After ESV fetches succeed, `detectKeywords(passageText, canonical)` is called:

1. Creates an `Anthropic` client (module-level singleton).
2. Calls `anthropic.messages.create()` with `max_tokens: 1024`.
3. System prompt frames Claude as a biblical scholar.
4. User prompt provides the passage text and asks for 3–8 theological theme keywords in a specific JSON format.
5. The raw text response is searched for the first `{...}` block via regex (`/\{[\s\S]*\}/`) to tolerate any markdown wrapping Claude adds.
6. The JSON is parsed; `data.keywords` is returned, or `[]` on any failure.

If `detectKeywords` throws (network error, quota, etc.), the route catches the error, sets `keywordError = true`, and still returns a successful response — just with `keywords: []` and no highlights. The client shows a soft notice banner.

### Highlight injection

After keywords are returned:

```ts
const passageHtml = keywords.length
  ? injectKeywordHighlights(rawHtml, keywords)
  : rawHtml
```

See [`keyword-highlighting.md`](keyword-highlighting.md) for how `injectKeywordHighlights` works.

---

## POST /api/exposition

**File:** `app/api/exposition/route.ts`

### Purpose

Streams a scholarly original-language exposition for a clicked keyword from Claude, using a two-section delimiter protocol that lets the client display summary and full content progressively.

### Request

```json
{
  "keyword": "eternal life",
  "theme": "Eschatological Salvation",
  "originalLanguage": "Greek",
  "passageText": "For God so loved the world...",
  "reference": "John 3:16"
}
```

All fields are required. Returns `400` if any are missing.

### Response (success)

- HTTP 200
- `Content-Type: text/plain; charset=utf-8`
- Chunked streaming body

The body is a raw text stream. No SSE envelope, no JSON — just UTF-8 text chunks. The client accumulates them into a buffer and parses the delimiter protocol.

**Delimiter protocol:**

```
===SUMMARY===
[2–3 sentence summary with original language word, transliteration, and core meaning]

===FULL===
[3–5 paragraph deep-dive: etymology, cross-Scripture usage, theological significance, application to this passage]
```

Both markers appear on their own lines. The client's `parseBuffer()` function detects them to split the stream into two independently displayable sections.

### Streaming implementation

```ts
const stream = new ReadableStream({
  async start(controller) {
    const claudeStream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `...`,
      messages: [{ role: 'user', content: `...` }],
    })

    for await (const event of claudeStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        controller.enqueue(encoder.encode(event.delta.text))
      }
    }

    controller.close()
  },
})

return new Response(stream, {
  headers: { 'Content-Type': 'text/plain; charset=utf-8' },
})
```

`anthropic.messages.stream()` returns an async iterable of SDK stream events. Only `content_block_delta` events with `text_delta` deltas carry text; all other event types (message start/stop, ping, etc.) are ignored. Each text chunk is encoded to `Uint8Array` and enqueued into the `ReadableStream`.

The `Response` constructor accepts a `ReadableStream` as its body directly; Next.js 16 App Router handles the chunked transfer to the browser.

### Error response

```json
{ "error": "Missing required fields" }
```

Runtime errors inside the `ReadableStream.start` function call `controller.error(err)`, which terminates the stream. The client detects a non-ok HTTP response before reading the body and shows a drawer error state.
