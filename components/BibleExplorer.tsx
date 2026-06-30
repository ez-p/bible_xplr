"use client"

import { useState } from "react"
import { PassageInput } from "@/components/PassageInput"
import { PassageDisplay } from "@/components/PassageDisplay"
import { ExpositionDrawer } from "@/components/ExpositionDrawer"
import type { Keyword, PassageResult } from "@/lib/types"

function md(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={i} className="font-semibold text-stone-800">{part.slice(2, -2)}</strong>
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2)
      return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export function BibleExplorer() {
  const [reference, setReference] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<PassageResult | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null)
  const [expositionPanel, setExpositionPanel] = useState<{ keyword: Keyword; text: string } | null>(null)

  async function handleSubmit() {
    if (!reference.trim()) return
    setIsLoading(true)
    setError(undefined)
    setSelectedKeyword(null)
    setResult(null)
    setExpositionPanel(null)

    try {
      const res = await fetch("/api/passage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Could not fetch passage. Please try again.")
        return
      }
      setResult(data as PassageResult)
    } catch {
      setError("Could not fetch passage. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeywordClick(kw: Keyword) {
    setSelectedKeyword({ ...kw })
  }

  function handleReadMore(kw: Keyword) {
    setExpositionPanel({ keyword: kw, text: "" })
  }

  function handleExpositionUpdate(text: string) {
    setExpositionPanel(prev => prev ? { ...prev, text } : null)
  }

  return (
    <>
      <div className="flex flex-col items-center gap-8 py-16 px-4 w-full max-w-3xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-stone-800 tracking-tight">
            Bible Explorer
          </h1>
          <p className="mt-2 text-stone-500">
            Enter a passage reference to expound its meaning through the original Greek and Hebrew
          </p>
        </div>

        <PassageInput
          value={reference}
          onChange={setReference}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={error}
        />

        {isLoading && (
          <div className="w-full max-w-2xl animate-pulse space-y-3">
            <div className="h-5 w-24 rounded bg-stone-200" />
            <div className="h-3 w-52 rounded bg-stone-100" />
            <div className="mt-4 space-y-2">
              <div className="h-5 w-full rounded bg-stone-200" />
              <div className="h-5 w-11/12 rounded bg-stone-200" />
              <div className="h-5 w-4/6 rounded bg-stone-100" />
            </div>
          </div>
        )}

        {result && (
          <PassageDisplay
            passageHtml={result.passageHtml}
            reference={result.reference}
            keywords={result.keywords ?? []}
            onKeywordClick={handleKeywordClick}
            notice={result.notice}
          />
        )}

        {expositionPanel && (
          <div className="w-full max-w-2xl border-t border-stone-200 pt-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-stone-700">
                {expositionPanel.keyword.word}
              </h3>
              <p className="text-xs text-stone-400 mt-0.5">
                {expositionPanel.keyword.theme} &middot; {expositionPanel.keyword.originalLanguage}
              </p>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-stone-600">
              {expositionPanel.text.split("\n\n").filter(Boolean).map((para, i) => (
                <p key={i}>{md(para)}</p>
              ))}
            </div>
          </div>
        )}
      </div>

      {result && (
        <ExpositionDrawer
          keyword={selectedKeyword}
          passageText={result.passageText}
          reference={result.reference}
          onClose={() => setSelectedKeyword(null)}
          onReadMore={handleReadMore}
          onExpositionUpdate={handleExpositionUpdate}
        />
      )}
    </>
  )
}
