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
  const abortRef = useRef<AbortController | null>(null)
  // True while the stream is "handed off" to the main window via Read more.
  // Prevents the cleanup function from aborting the still-running fetch.
  const readMoreModeRef = useRef(false)
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
    // A new real keyword: abort any lingering read-more stream and start fresh.
    if (keyword) {
      abortRef.current?.abort()
      readMoreModeRef.current = false
    } else {
      return
    }

    setStreamError(null)

    // Already fetched this exact word for this passage — render it, no refetch.
    const cached = cachedEntryRef.current
    if (cached) {
      setSummary(cached.summary)
      setFullExposition(cached.full)
      setPhase(cached.full ? "full" : "summary")
      setIsStreaming(false)
      return
    }

    const controller = new AbortController()
    abortRef.current = controller

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
          setStreamError(err.error ?? "Could not load exposition. Please try again.")
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
          setSummary(parsed.summary)
          setFullExposition(parsed.full)
          setPhase(parsed.phase)
          if (readMoreModeRef.current && parsed.full) {
            onExpositionUpdateRef.current(parsed.full)
          }
        }

        if (parsed.summary) {
          onStreamCompleteRef.current(keyword, { summary: parsed.summary, full: parsed.full })
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreamError("Could not load exposition. Please try again.")
        }
      } finally {
        setIsStreaming(false)
      }
    })()

    return () => {
      // Only abort if the stream wasn't handed off to the main window.
      if (!readMoreModeRef.current) controller.abort()
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
                    readMoreModeRef.current = true
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
