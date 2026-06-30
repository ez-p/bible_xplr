# Bible Explorer — Build Prompt

## Project Overview

Build a **Bible verse explorer web application** using **Next.js (App Router)** deployable on **Vercel**. The app lets a user enter a Bible passage reference (single verse like `John 3:16` or a range like `John 3:10-22`), fetches the ESV text, identifies major theological theme keywords using Claude AI, and lets the user click any highlighted keyword to open a side drawer with a summary exposition. A "Read more" button closes the drawer and displays the full scholarly exposition in the main window below the passage.

The subtitle shown to the user is: **"Enter a passage reference to expound its meaning through the original Greek and Hebrew"**

The app is **stateless and read-only** — no user accounts, no database, no persistence beyond the current session.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Styling | Tailwind CSS + shadcn/ui |
| AI | Anthropic Claude API (claude-sonnet-4-6 or latest) |
| Bible text | ESV API (`https://api.esv.org/v3/passage/text/`) |
| Deployment | Vercel |

---

## Environment Variables

```
ESV_API_TOKEN=       # ESV API token
ANTHROPIC_API_KEY=   # Anthropic API key
```

Both are server-side only — never expose to the client.

---

## ESV API Integration

Read **both** ESV API documentation pages before implementing:
- `https://api.esv.org/docs/passage-text/` — plain text endpoint
- `https://api.esv.org/docs/passage-html/` — HTML endpoint

The ESV API exposes two relevant endpoints:

**`/v3/passage/text/`** — returns plain text. Use this when sending the passage to Claude (for keyword detection and exposition), since LLMs work better with clean text than HTML.

**`/v3/passage/html/`** — returns pre-formatted HTML with semantic markup (verse numbers, paragraph breaks, poetry indentation, section headings). Use this for **rendering the passage to the user**, as it preserves the ESV's intended typographic structure (e.g., Psalms render as verse lines, not prose). Sanitize the returned HTML before injecting it into the DOM.

Recommended query parameters for the HTML endpoint:
- `include-headings=true` — preserve section headings for multi-verse ranges
- `include-footnotes=false`
- `include-verse-numbers=true`
- `include-short-copyright=false`
- `include-passage-references=false`
- `include-css-link=false` — handle all styling via Tailwind

Recommended query parameters for the text endpoint (Claude input):
- `include-headings=false`
- `include-footnotes=false`
- `include-verse-numbers=false` — cleaner for LLM processing
- `include-short-copyright=false`
- `include-passage-references=false`

The ESV API supports both single verses and verse ranges via the `q` parameter (e.g., `q=John+3:10-22`). Parse the user's free-text input into a valid ESV API `q` value.

Call both endpoints in parallel from the `/api/passage` Route Handler — there is no reason to wait for one before starting the other.

---

## Core User Flow

1. User lands on the home page and sees a single text input field with a placeholder like `John 3:16` or `Romans 8:28-39`.
2. User types a passage reference and submits (Enter key or button).
3. The app calls the ESV API (server-side Route Handler) to fetch the passage text.
4. The passage text is sent to Claude (server-side) to identify major theological theme keywords and return them in a structured format alongside the parsed passage.
5. The passage is displayed with theme keywords **highlighted** (distinct color, clickable).
6. When a user clicks a highlighted word, a **right-side drawer panel** slides open.
7. The drawer makes a second Claude call (streaming) to generate exposition for that word in context of the passage.
8. A concise **summary** streams into the drawer immediately.
9. Once the `===FULL===` delimiter is received in the stream, a **"Read more"** button appears in the drawer.
10. Clicking "Read more" **closes the drawer** and displays the full scholarly exposition in the **main window**, directly below the passage, aligned to the same width. The stream continues running after the drawer closes, pushing new chunks to the main window until complete.

---

## Claude API Usage

### Step 1 — Keyword Identification

After fetching the ESV text, make a server-side call to Claude to:
- Identify 3–16 major theological theme words in the passage (words central to meaning, doctrine, or interpretive significance — not just common words).
- Each keyword word/phrase must be **unique** — do not return the same word or phrase more than once.
- Return a structured JSON response listing each keyword.

Use a system prompt that frames Claude as a biblical scholar and theologian. Ask for JSON output. Example response shape:

```json
{
  "keywords": [
    { "word": "loved", "theme": "Divine Love", "originalLanguage": "Greek" },
    { "word": "perish", "theme": "Eternal Judgment", "originalLanguage": "Greek" },
    { "word": "eternal life", "theme": "Salvation", "originalLanguage": "Greek" }
  ]
}
```

### Step 2 — Exposition Generation (streaming)

When a user clicks a keyword, call Claude via a streaming Route Handler. Provide:
- The full passage text and reference
- The clicked keyword and its theme label
- The original language (Greek for NT, Hebrew for OT — infer from the passage book)

Ask Claude to generate exposition in **two clearly delimited sections**:

1. **Summary** (2–3 sentences): The original word, transliteration, and its core meaning — how it deepens this specific verse.
2. **Full exposition** (3–5 paragraphs): Etymology, usage across Scripture, theological significance, and how knowledge of the original language opens up the passage.

Parse the streaming response to separate summary from full exposition. The summary streams into the drawer immediately. When the `===FULL===` delimiter arrives, a "Read more" button appears in the drawer. Clicking it closes the drawer and the remaining stream chunks are forwarded to the main window exposition panel via a callback — the stream is **not** aborted on drawer close.

---

## UI & Component Architecture

### Layout
- Single-page app — no routing needed beyond the home page.
- Main content area takes up the full width; the exposition drawer overlays from the right (fixed position, ~40% width on desktop, full-width sheet on mobile).

### Components to build

**`PassageInput`** — controlled text field. On submit, triggers the fetch + keyword detection pipeline. Show a loading state during the two-step API calls.

**`PassageDisplay`** — renders the ESV HTML with inline verse numbers. Keyword highlights are injected server-side (in the Route Handler) before the HTML is sent to the client. Each keyword is highlighted only on its **first occurrence** in the passage to avoid visual repetition. Multi-word keywords (e.g., "eternal life") are sorted longest-first during injection so they match before shorter overlapping words.

**`HighlightedWord`** — a `<span>` styled with a warm underline or background highlight. On click, triggers the drawer open + starts the exposition streaming call. Show a subtle hover state.

**`ExpositionDrawer`** — shadcn/ui `Sheet` component anchored to the right. Contains:
  - Keyword and theme label as a header
  - Original language label (Greek / Hebrew)
  - Summary text (streams in immediately)
  - "Read more" button (appears once the `===FULL===` delimiter is seen in the stream)
  - Clicking "Read more" sets a `readMoreModeRef` flag, fires `onReadMore(keyword)` to initialize the main window panel, fires `onClose()` to close the drawer, but does **not** abort the fetch — subsequent chunks are forwarded to the parent via `onExpositionUpdate(text)`
  - Close button

**`LoadingStates`** — skeleton loaders for the passage display and streaming dots/shimmer inside the drawer while Claude streams.

**Exposition panel (inline in `BibleExplorer`)** — rendered below `PassageDisplay` in the main window when "Read more" has been clicked. Constrained to `max-w-2xl` to match the passage width. Shows the keyword name, theme · language line, and the full exposition paragraphs with inline `**bold**` / `*italic*` markdown rendered. Updates live as the stream continues after the drawer closes.

### Styling Notes
- Use shadcn/ui `Sheet` for the drawer, `Badge` for the original language label, `Button` for the "Read more" toggle and submit.
- Highlight color: amber/yellow tones work well for theological highlighting (warm, readable).
- Font: use a readable serif for the passage text itself (e.g., `font-serif` via Tailwind + a Google Font like `Lora` or `Playfair Display`). Use sans-serif for all UI chrome.
- Support light mode only for the initial build (no dark mode required for prototype).

---

## Server-Side Route Handlers

All API calls to ESV and Anthropic must go through Next.js Route Handlers (`app/api/`), never from client-side code.

### `POST /api/passage`
- Accepts `{ reference: string }`
- Calls ESV text and HTML endpoints **in parallel**
- Calls Claude to identify 3–16 unique keywords; deduplicates by lowercased word server-side as a safety net
- Injects keyword highlight `<span>` tags into the ESV HTML (first occurrence only per keyword)
- Returns `{ passageText: string, passageHtml: string, reference: string, keywords: Keyword[], notice?: string }`

### `POST /api/exposition` (streaming)
- Accepts `{ keyword: string, theme: string, originalLanguage: string, passageText: string, reference: string }`
- Calls Claude with streaming enabled using `@anthropic-ai/sdk` directly (`anthropic.messages.stream()`)
- Returns a `ReadableStream` with `Content-Type: text/plain`
- Response format: `===SUMMARY===\n<2–3 sentences>\n===FULL===\n<3–5 paragraphs>`

---

## Passage Parsing

The free-text input must be parsed into a valid ESV API `q` value before the API call. Handle common input formats:
- `John 3:16` → `John+3:16`
- `John 3:10-22` → `John+3:10-22`
- `Romans 8:28-39` → `Romans+8:28-39`
- `Genesis 1:1` → `Genesis+1:1`

Do not build a full Bible reference parser — pass the user's input (URL-encoded) directly to the ESV API and let the ESV API return an error if the reference is invalid. Surface ESV API errors to the user clearly (e.g., "Passage not found — check your reference format").

---

## Error Handling

- Invalid reference → show inline error below the input field, keep the previous passage visible.
- ESV API failure → show a banner: "Could not fetch passage. Please try again."
- Claude keyword detection failure → still display the passage text without highlights; show a soft notice.
- Claude exposition streaming failure → show an error state inside the drawer.

---

## Implementation Order

1. Scaffold Next.js app with TypeScript, Tailwind, shadcn/ui
2. Build `PassageInput` + `POST /api/passage` Route Handler (ESV fetch only, no Claude yet) — render raw text
3. Add Claude keyword detection to the Route Handler — inject highlights server-side into ESV HTML; render with highlights (first occurrence only per keyword)
4. Build `ExpositionDrawer` (static, no streaming yet) — open on keyword click
5. Add `POST /api/exposition` streaming Route Handler — wire up streaming exposition with `===SUMMARY===` / `===FULL===` delimiters
6. Summary streams into drawer; "Read more" closes drawer and displays full exposition in main window below the passage; stream continues after close via `onExpositionUpdate` callback
7. Polish: loading states, error handling, typography, mobile layout, `autoComplete="off"` on input to prevent browser form restoration on reload

---

## Key Constraints

- No database, no auth, no user state beyond in-memory React state.
- All LLM calls server-side only (protect API keys).
- ESV API token and Anthropic API key via `.env.local`, excluded from source control.
- The app must work on Vercel's free tier — keep Claude calls efficient (avoid unnecessary round trips).
- Use the Anthropic SDK (`@anthropic-ai/sdk`) directly, not a wrapper like LangChain.
