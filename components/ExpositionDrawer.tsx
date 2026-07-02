"use client"

import { useEffect, useRef, useState } from "react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Keyword } from "@/lib/types"

interface ExpositionEntry {
  summary: string
  full: string
}

interface ExpositionDrawerProps {
  keyword: Keyword | null
  passageText: string
  reference: string
  cachedEntry?: ExpositionEntry
  onClose: () => void
  onReadMore: (keyword: Keyword, initialText: string) => void
  onExpositionUpdate: (text: string) => void
  onStreamComplete: (keyword: Keyword, entry: ExpositionEntry) => void
}

type Phase = "pre" | "summary" | "full"

interface LiveSnapshot {
  summary: string
  full: string
  phase: Phase
}

function wordKey(word: string, reference: string): string {
  return `${reference}::${word.toLowerCase()}`
}

function parseBuffer(buf: string): { summary: string; full: string; phase: Phase } {
  const SUMMARY = "===SUMMARY==="
  const FULL = "===FULL==="

  const summaryIdx = buf.indexOf(SUMMARY)
  if (summaryIdx === -1) return { summary: "", full: "", phase: "pre" }

  const afterSummary = buf.slice(summaryIdx + SUMMARY.length).replace(/^\n/, "")
  const fullIdx = afterSummary.indexOf(FULL)

  if (fullIdx === -1) return { summary: afterSummary, full: "", phase: "summary" }

  return {
    summary: afterSummary.slice(0, fullIdx).trim(),
    full: afterSummary.slice(fullIdx + FULL.length).replace(/^\n/, ""),
    phase: "full",
  }
}

// Render **bold** and *italic* markdown inline without a library dependency
function md(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i} className="font-semibold text-heading">{part.slice(2, -2)}</strong>
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function StreamCursor() {
  return (
    <span className="inline-block w-0.5 h-[1em] bg-muted-foreground ml-0.5 animate-pulse align-text-bottom" />
  )
}

export function ExpositionDrawer({
  keyword,
  passageText,
  reference,
  cachedEntry,
  onClose,
  onReadMore,
  onExpositionUpdate,
  onStreamComplete,
}: ExpositionDrawerProps) {
  const [summary, setSummary] = useState("")
  const [fullExposition, setFullExposition] = useState("")
  const [phase, setPhase] = useState<Phase>("pre")
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  // Always mirrors which word is currently selected. A background fetch for a
  // word the user has since moved away from checks this before touching the
  // visible UI state — and if the user reopens that same word later while its
  // fetch is still running, this naturally starts matching it again, so the
  // fetch resumes driving the UI without needing a second request.
  const activeWordKeyRef = useRef<string | null>(null)
  activeWordKeyRef.current = keyword ? wordKey(keyword.word, reference) : null
  // Latest known partial/complete state per word, so reopening a word whose
  // fetch is still running in the background can resume instantly instead of
  // flashing back to a blank loading state.
  const liveSnapshotsRef = useRef<Map<string, LiveSnapshot>>(new Map())
  // Word keys with a fetch currently in flight, so reopening the same word
  // while it's still streaming in the background doesn't start a duplicate.
  const inFlightRef = useRef<Set<string>>(new Set())
  // Word keys for which "Read more" was clicked, so their background stream
  // is still allowed to push live updates to the main-page panel.
  const readMoreWordsRef = useRef<Set<string>>(new Set())
  // Always holds the latest onExpositionUpdate so the async IIFE never goes stale.
  const onExpositionUpdateRef = useRef(onExpositionUpdate)
  onExpositionUpdateRef.current = onExpositionUpdate
  // Read fresh at effect-start time only, so a cache write after this keyword's
  // own stream finishes doesn't retrigger the effect (it's not in the deps array).
  const cachedEntryRef = useRef(cachedEntry)
  cachedEntryRef.current = cachedEntry
  const onStreamCompleteRef = useRef(onStreamComplete)
  onStreamCompleteRef.current = onStreamComplete

  useEffect(() => {
    if (!keyword) return

    setStreamError(null)
    const myWordKey = wordKey(keyword.word, reference)
    const isCurrent = () => activeWordKeyRef.current === myWordKey

    // Already fetched this exact word for this passage — render it, no refetch.
    const cached = cachedEntryRef.current
    if (cached) {
      setSummary(cached.summary)
      setFullExposition(cached.full)
      setPhase(cached.full ? "full" : "summary")
      setIsStreaming(false)
      return
    }

    // A fetch for this exact word is already running in the background (it
    // reached "full" phase, the drawer was closed, and the user reopened it
    // before that fetch finished). Don't start a duplicate — the running
    // fetch's own loop will resume driving the UI now that isCurrent() is
    // true again. Just seed the view with whatever it's produced so far.
    if (inFlightRef.current.has(myWordKey)) {
      const snapshot = liveSnapshotsRef.current.get(myWordKey)
      setSummary(snapshot?.summary ?? "")
      setFullExposition(snapshot?.full ?? "")
      setPhase(snapshot?.phase ?? "pre")
      setIsStreaming(true)
      return
    }

    const controller = new AbortController()
    // Local to this effect run only — each fetch tracks its own phase, so an
    // older fetch's cleanup can't be confused by a newer one for a different word.
    let localPhase: Phase = "pre"
    inFlightRef.current.add(myWordKey)

    setSummary("")
    setFullExposition("")
    setPhase("pre")
    setIsStreaming(true)

    ;(async () => {
      let parsed = { summary: "", full: "", phase: "pre" as Phase }
      try {
        const res = await fetch("/api/exposition", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            keyword: keyword.word,
            theme: keyword.theme,
            originalLanguage: keyword.originalLanguage,
            passageText,
            reference,
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          if (isCurrent()) setStreamError(err.error ?? "Could not load exposition. Please try again.")
          return
        }

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          parsed = parseBuffer(buffer)
          localPhase = parsed.phase
          liveSnapshotsRef.current.set(myWordKey, parsed)
          if (isCurrent()) {
            setSummary(parsed.summary)
            setFullExposition(parsed.full)
            setPhase(parsed.phase)
          }
          if (readMoreWordsRef.current.has(myWordKey) && parsed.full) {
            onExpositionUpdateRef.current(parsed.full)
          }
        }

        if (parsed.summary) {
          onStreamCompleteRef.current(keyword, { summary: parsed.summary, full: parsed.full })
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError" && isCurrent()) {
          setStreamError("Could not load exposition. Please try again.")
        }
      } finally {
        if (isCurrent()) setIsStreaming(false)
        inFlightRef.current.delete(myWordKey)
        liveSnapshotsRef.current.delete(myWordKey)
        readMoreWordsRef.current.delete(myWordKey)
      }
    })()

    return () => {
      // Let the fetch finish in the background (for caching) once the full
      // exposition has started arriving — whether closed via Read more or the
      // X button. Only abort if it's still mid-summary/pre, since that content
      // isn't complete enough to cache and a refetch will be needed anyway.
      if (!readMoreWordsRef.current.has(myWordKey) && localPhase !== "full") {
        controller.abort()
        inFlightRef.current.delete(myWordKey)
        liveSnapshotsRef.current.delete(myWordKey)
      }
    }
  }, [keyword, passageText, reference])

  return (
    <Sheet open={keyword !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        {keyword && (
          <>
            <SheetHeader className="border-b border-border pb-4">
              <SheetTitle className="text-xl font-semibold text-heading">
                {keyword.word}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary">{keyword.theme}</Badge>
                <Badge variant="outline">{keyword.originalLanguage}</Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4 p-4">
              {streamError && (
                <p className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {streamError}
                </p>
              )}

              {isStreaming && phase === "pre" && !streamError && (
                <div className="flex gap-1.5 py-6 justify-center">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gold-muted [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gold-muted [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gold-muted" />
                </div>
              )}

              {summary && (
                <p className="text-base leading-relaxed text-foreground">
                  {md(summary)}
                  {isStreaming && phase === "summary" && <StreamCursor />}
                </p>
              )}

              {phase === "full" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    readMoreWordsRef.current.add(wordKey(keyword.word, reference))
                    onReadMore(keyword, fullExposition)
                    onClose()
                  }}
                >
                  Read more
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
