"use client"

import { useState } from "react"
import { PassageInput } from "@/components/PassageInput"
import { PassageDisplay } from "@/components/PassageDisplay"
import { ExpositionDrawer } from "@/components/ExpositionDrawer"
import type { Keyword, PassageResult } from "@/lib/types"

export function BibleExplorer() {
  const [reference, setReference] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [result, setResult] = useState<PassageResult | null>(null)
  const [selectedKeyword, setSelectedKeyword] = useState<Keyword | null>(null)

  async function handleSubmit() {
    if (!reference.trim()) return
    setIsLoading(true)
    setError(undefined)
    setSelectedKeyword(null)
    setResult(null)

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
    // Spread to create a new object reference each time so the drawer's
    // useEffect re-triggers even if the same keyword is clicked twice.
    setSelectedKeyword({ ...kw })
  }

  return (
    <>
      <div className="flex flex-col items-center gap-8 py-16 px-4 w-full max-w-3xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-semibold text-stone-800 tracking-tight">
            Bible Explorer
          </h1>
          <p className="mt-2 text-stone-500">
            Enter a passage reference to explore its original language depth
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
      </div>

      {result && (
        <ExpositionDrawer
          keyword={selectedKeyword}
          passageText={result.passageText}
          reference={result.reference}
          onClose={() => setSelectedKeyword(null)}
        />
      )}
    </>
  )
}
