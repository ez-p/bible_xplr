# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Bible verse explorer web app built with Next.js (App Router, TypeScript), Tailwind CSS, shadcn/ui, deployed on Vercel. Stateless and read-only — no database, no auth, no persistence beyond React state. All API keys are server-side only.

## Commands

```bash
npm run dev      # local dev server
npm run build    # production build
npm run lint     # ESLint
```

## Architecture

### Data flow

1. User submits a passage reference → `POST /api/passage` (Route Handler)
2. Route Handler calls **both** ESV endpoints in parallel:
   - `/v3/passage/text/` — clean text for Claude (no verse numbers, no headings)
   - `/v3/passage/html/` — formatted HTML for rendering to the user
3. Route Handler calls Claude for keyword detection → returns `{ passageHtml, passageText, reference, keywords[] }`
4. User clicks a highlighted keyword → `POST /api/exposition` (streaming Route Handler)
5. Claude streams exposition in two delimited sections: Summary (shown immediately) + Full exposition (revealed on "Read more")

### Route Handlers (`app/api/`)

- **`POST /api/passage`** — parallel ESV fetch + Claude keyword detection. Returns `{ passageHtml, passageText, reference, keywords }`.
- **`POST /api/exposition`** — streaming Claude call. Returns a `ReadableStream`. Use the Anthropic SDK directly (`@anthropic-ai/sdk`), not LangChain or the Vercel AI SDK wrapper.

### Key components

- **`PassageInput`** — controlled input, triggers the passage fetch pipeline on submit.
- **`PassageDisplay`** — renders ESV HTML (sanitized before injection), with keyword phrases wrapped in `<HighlightedWord>`.
- **`HighlightedWord`** — `<span>` with amber highlight; on click opens the drawer and starts the exposition stream.
- **`ExpositionDrawer`** — shadcn/ui `Sheet` anchored right. Streams summary first, then reveals full exposition after "Read more".

### Styling

- Passage text: serif font (Lora or Playfair Display via Google Fonts, `font-serif` Tailwind class).
- UI chrome: sans-serif.
- Keyword highlights: amber/yellow tones.
- Light mode only (no dark mode for initial build).
- shadcn/ui components: `Sheet` (drawer), `Badge` (language label), `Button`.

## ESV API

Two endpoints, called in parallel from `/api/passage`:

| Endpoint | Use | Key params |
|---|---|---|
| `/v3/passage/text/` | Claude input | `include-verse-numbers=false`, `include-headings=false`, `include-footnotes=false` |
| `/v3/passage/html/` | User display | `include-headings=true`, `include-verse-numbers=true`, `include-footnotes=false`, `include-css-link=false` |

Pass the user's input URL-encoded directly as the `q` parameter — do not build a custom reference parser. Let the ESV API reject invalid references and surface that error to the user.

## Claude API

- **Keyword detection**: structured JSON response, 3–8 theological theme keywords per passage. Shape: `{ keywords: [{ word, theme, originalLanguage }] }`.
- **Exposition**: streaming, two delimited sections in the response — Summary (2–3 sentences with original word + transliteration) and Full exposition (3–5 paragraphs: etymology, cross-Scripture usage, theological significance).
- Infer original language from the book: Greek for NT, Hebrew for OT.
- Use `@anthropic-ai/sdk` directly. Model: `claude-sonnet-4-6` (or latest).

## Environment Variables

```
ESV_API_TOKEN=        # ESV API token
ANTHROPIC_API_KEY=    # Anthropic API key
```

Both are server-side only — `.env.local`, never committed (`.gitignore` already excludes `.env*`).
