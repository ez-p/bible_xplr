# Architecture

## Project Overview

Bible Explorer is a stateless, read-only Next.js (App Router) web application. A user enters a Bible passage reference (e.g. `John 3:16` or `Romans 8:28-39`), the app fetches the ESV text, uses Claude AI to identify major theological theme keywords, renders the passage with those keywords highlighted, and on keyword click streams a scholarly original-language exposition via a right-side drawer panel.

There is no database, no authentication, no user accounts, and no persistence beyond in-memory React state for the current session. All external API calls (ESV API, Anthropic Claude) happen server-side only; API keys never reach the client.

---

## Data Flow

```
User types reference → submits form
        │
        ▼
BibleExplorer.handleSubmit()
        │
        ▼  POST /api/passage  { reference }
        │
        ├──► ESV /v3/passage/text/   ─┐  (parallel)
        └──► ESV /v3/passage/html/   ─┘
                        │
                        ▼
              Claude keyword detection
              (claude-sonnet-4-6, JSON)
                        │
                        ▼
          injectKeywordHighlights(html, keywords)
          → <span class="keyword-highlight"
                  data-keyword="..."
                  data-theme="..."
                  data-lang="...">word</span>
                        │
                        ▼
        Response: { passageText, passageHtml, reference, keywords }
                        │
                        ▼
              PassageDisplay renders passageHtml
              (dangerouslySetInnerHTML)
                        │
                User clicks highlighted word
                        │
                        ▼
        PassageDisplay onClick (event delegation)
        → extracts data-keyword attr → finds Keyword object
        → calls onKeywordClick(kw)
                        │
                        ▼
        BibleExplorer.setSelectedKeyword({ ...kw })
                        │
                        ▼
        ExpositionDrawer opens (Sheet)
        useEffect fires → POST /api/exposition (streaming)
                        │
                        ▼
        Claude streams ===SUMMARY=== ... ===FULL=== ...
                        │
                        ▼
        parseBuffer() splits stream into summary / full
        Summary shown immediately; "Read more" on ===FULL===
        Full exposition revealed on button click
```

---

## Component Tree

```
app/page.tsx  (Server Component)
└── BibleExplorer  ["use client"] — state owner & orchestrator
    ├── PassageInput  ["use client"] — controlled form
    ├── PassageDisplay  ["use client"] — ESV HTML + highlight clicks
    └── ExpositionDrawer  ["use client"] — Sheet + streaming state machine
```

---

## Server vs Client Component Breakdown

| File | Type | Reason |
|---|---|---|
| `app/page.tsx` | Server | No state; just renders BibleExplorer |
| `app/layout.tsx` | Server | Font setup, metadata |
| `components/BibleExplorer.tsx` | Client (`"use client"`) | Owns all UI state with `useState` |
| `components/PassageInput.tsx` | Client (`"use client"`) | Form event handlers |
| `components/PassageDisplay.tsx` | Client (`"use client"`) | onClick event delegation |
| `components/ExpositionDrawer.tsx` | Client (`"use client"`) | `useEffect`, streaming state |
| `app/api/passage/route.ts` | Server (Route Handler) | Calls ESV API + Claude |
| `app/api/exposition/route.ts` | Server (Route Handler) | Streams Claude response |
| `lib/highlight.ts` | Server utility | Called inside Route Handler |
| `lib/types.ts` | Shared types | Used by both |

---

## State Ownership Map

All application state lives in `BibleExplorer`. Child components receive what they need via props.

| State variable | Type | Purpose |
|---|---|---|
| `reference` | `string` | Controlled input value |
| `isLoading` | `boolean` | True while `/api/passage` is in-flight |
| `error` | `string \| undefined` | Passage fetch error shown below input |
| `result` | `PassageResult \| null` | The fetched passage data (cleared on new search) |
| `selectedKeyword` | `Keyword \| null` | The keyword whose drawer is open; null = drawer closed |

`ExpositionDrawer` owns its own internal streaming state (`summary`, `fullExposition`, `phase`, `showFull`, `isStreaming`, `streamError`) because it is entirely self-contained once given a keyword to explain.

---

## Key Design Decisions

### Server-side keyword highlight injection

Keyword spans are injected into the ESV HTML inside the `/api/passage` Route Handler (via `lib/highlight.ts`) before the response is sent to the client. This means `passageHtml` in the API response already contains `<span class="keyword-highlight" data-*="...">` elements.

**Alternative considered:** Inject highlights client-side in `PassageDisplay` by walking DOM text nodes after `dangerouslySetInnerHTML` renders. This was rejected because manipulating the DOM after React renders breaks React's reconciliation model and is fragile.

**Tradeoff:** The API response is slightly larger (extra span tags), but the client stays simple: render the HTML string as-is and attach a single click listener.

### Event delegation for keyword clicks

`PassageDisplay` attaches a single `onClick` to the wrapper `<div>` rather than adding individual React event listeners to each `<span>`. When a click fires, it calls `e.target.closest('[data-keyword]')` to find the nearest highlighted ancestor.

**Why:** The highlighted spans are inside `dangerouslySetInnerHTML` content — React does not manage those DOM nodes, so React `onClick` props cannot be placed on them. A single delegated listener on the React-managed parent is the correct pattern.

### `{ ...kw }` spread for same-keyword re-click

When the user clicks a keyword, `BibleExplorer` calls:

```ts
setSelectedKeyword({ ...kw })
```

rather than `setSelectedKeyword(kw)` directly.

**Why:** `ExpositionDrawer` triggers a new stream via `useEffect([keyword, ...])`. React's `useEffect` dependency comparison is referential (`Object.is`). If the same `Keyword` object reference were passed a second time (user closes drawer, clicks same word again), the effect would not re-run and no new stream would start. Spreading creates a new object reference on every click, guaranteeing the effect always fires.

### AbortController for stream cancellation

`ExpositionDrawer` holds an `abortRef = useRef<AbortController | null>(null)`. Each time the `useEffect` fires (new keyword selected):

1. `abortRef.current?.abort()` cancels any in-flight stream.
2. A new `AbortController` is created and stored.
3. The fetch is started with `signal: controller.signal`.
4. The effect cleanup function calls `controller.abort()` (handles component unmount or fast keyword switching).

**Why:** Without this, clicking a new keyword while a previous stream is active would leave an orphaned async loop writing stale state. The `AbortError` is caught and silently ignored; all other errors surface as `streamError`.
