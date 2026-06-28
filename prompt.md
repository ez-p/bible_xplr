# Bible Explorer — Build Prompt

## Project Overview

Build a **Bible verse explorer web application** using **Next.js (App Router)** deployable on **Vercel**. The app lets a user enter a Bible passage reference (single verse like `John 3:16` or a range like `John 3:10-22`), fetches the ESV text, identifies major theological theme keywords using Claude AI, and lets the user click any highlighted keyword to open a side panel with a layered original-language exposition.

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
8. Exposition is **layered**: a concise summary is shown first, with a "Read more" toggle that reveals full scholarly depth.

---

## Claude API Usage

### Step 1 — Keyword Identification

After fetching the ESV text, make a server-side call to Claude to:
- Identify 3–8 major theological theme words in the passage (words central to meaning, doctrine, or interpretive significance — not just common words).
- Return a structured JSON response listing each keyword along with its position/occurrence in the text (enough to highlight the correct word in the rendered passage).

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

Parse the streaming response to separate summary from full exposition so the UI can show the summary immediately and reveal the rest on "Read more" click.

---

## UI & Component Architecture

### Layout
- Single-page app — no routing needed beyond the home page.
- Main content area takes up the full width; the exposition drawer overlays from the right (fixed position, ~40% width on desktop, full-width sheet on mobile).

### Components to build

**`PassageInput`** — controlled text field. On submit, triggers the fetch + keyword detection pipeline. Show a loading state during the two-step API calls.

**`PassageDisplay`** — renders the passage text with inline verse numbers. Splits the ESV text into tokens and wraps keyword matches in a `<HighlightedWord>` component. Handle multi-word keywords (e.g., "eternal life") by matching the full phrase.

**`HighlightedWord`** — a `<span>` styled with a warm underline or background highlight. On click, triggers the drawer open + starts the exposition streaming call. Show a subtle hover state.

**`ExpositionDrawer`** — shadcn/ui `Sheet` component anchored to the right. Contains:
  - Keyword and theme label as a header
  - Original language label (Greek / Hebrew)
  - Summary text (streams in immediately)
  - "Read more" toggle button (appears after summary loads)
  - Full exposition text (hidden until toggled, streams in)
  - Close button

**`LoadingStates`** — skeleton loaders for the passage display and streaming dots/shimmer inside the drawer while Claude streams.

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
- Calls ESV API to fetch passage text
- Calls Claude to identify keywords
- Returns `{ passageText: string, reference: string, keywords: Keyword[] }`

### `POST /api/exposition` (streaming)
- Accepts `{ keyword: string, theme: string, originalLanguage: string, passageText: string, reference: string }`
- Calls Claude with streaming enabled
- Returns a streaming text response
- Use `StreamingTextResponse` from the Vercel AI SDK or Next.js native `ReadableStream`

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
3. Add Claude keyword detection to the Route Handler — render passage with highlights
4. Build `ExpositionDrawer` (static, no streaming yet) — open on keyword click
5. Add `POST /api/exposition` streaming Route Handler — wire up streaming exposition
6. Implement layered "Read more" exposition display
7. Polish: loading states, error handling, typography, mobile layout

---

## Key Constraints

- No database, no auth, no user state beyond in-memory React state.
- All LLM calls server-side only (protect API keys).
- ESV API token and Anthropic API key via `.env.local`, excluded from source control.
- The app must work on Vercel's free tier — keep Claude calls efficient (avoid unnecessary round trips).
- Use the Anthropic SDK (`@anthropic-ai/sdk`) directly, not a wrapper like LangChain.
