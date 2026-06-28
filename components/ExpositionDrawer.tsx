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

interface ExpositionDrawerProps {
  keyword: Keyword | null
  passageText: string
  reference: string
  onClose: () => void
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
      return <strong key={i} className="font-semibold text-stone-800">{part.slice(2, -2)}</strong>
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

function StreamCursor() {
  return (
    <span className="inline-block w-0.5 h-[1em] bg-stone-400 ml-0.5 animate-pulse align-text-bottom" />
  )
}

export function ExpositionDrawer({
  keyword,
  passageText,
  reference,
  onClose,
}: ExpositionDrawerProps) {
  const [summary, setSummary] = useState("")
  const [fullExposition, setFullExposition] = useState("")
  const [phase, setPhase] = useState<Phase>("pre")
  const [showFull, setShowFull] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!keyword) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setSummary("")
    setFullExposition("")
    setPhase("pre")
    setShowFull(false)
    setIsStreaming(true)
    setStreamError(null)

    ;(async () => {
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
          const parsed = parseBuffer(buffer)
          setSummary(parsed.summary)
          setFullExposition(parsed.full)
          setPhase(parsed.phase)
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setStreamError("Could not load exposition. Please try again.")
        }
      } finally {
        setIsStreaming(false)
      }
    })()

    return () => controller.abort()
  }, [keyword, passageText, reference])

  const fullParas = fullExposition.split("\n\n").filter(Boolean)

  return (
    <Sheet open={keyword !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        {keyword && (
          <>
            <SheetHeader className="border-b border-stone-100 pb-4">
              <SheetTitle className="text-xl font-semibold text-stone-800">
                {keyword.word}
              </SheetTitle>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <Badge variant="secondary">{keyword.theme}</Badge>
                <Badge variant="outline">{keyword.originalLanguage}</Badge>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-4 p-4">
              {streamError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                  {streamError}
                </p>
              )}

              {isStreaming && phase === "pre" && !streamError && (
                <div className="flex gap-1.5 py-6 justify-center">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-stone-300" />
                </div>
              )}

              {summary && (
                <p className="text-base leading-relaxed text-stone-700">
                  {md(summary)}
                  {isStreaming && phase === "summary" && <StreamCursor />}
                </p>
              )}

              {phase === "full" && !showFull && (
                <Button variant="outline" size="sm" onClick={() => setShowFull(true)}>
                  Read more
                </Button>
              )}

              {showFull && (
                <div className="space-y-3 text-sm leading-relaxed text-stone-600">
                  {fullParas.map((para, i) => (
                    <p key={i}>
                      {md(para)}
                      {isStreaming && i === fullParas.length - 1 && <StreamCursor />}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
