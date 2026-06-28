"use client"

import type { Keyword } from "@/lib/types"

interface PassageDisplayProps {
  passageHtml: string
  reference: string
  keywords: Keyword[]
  onKeywordClick: (keyword: Keyword) => void
  notice?: string
}

export function PassageDisplay({
  passageHtml,
  reference,
  keywords,
  onKeywordClick,
  notice,
}: PassageDisplayProps) {
  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const span = (e.target as HTMLElement).closest<HTMLElement>("[data-keyword]")
    if (!span) return
    const word = span.dataset.keyword!
    const kw = keywords.find((k) => k.word.toLowerCase() === word.toLowerCase())
    if (kw) onKeywordClick(kw)
  }

  return (
    <div className="w-full max-w-2xl">
      <h2 className="text-xl font-semibold text-stone-600 mb-4">{reference}</h2>
      {notice && (
        <p className="mb-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          {notice}
        </p>
      )}
      {keywords.length > 0 && (
        <p className="mb-4 text-xs text-stone-400 font-sans">
          Click a highlighted word to explore its original language meaning
        </p>
      )}
      <div
        className="esv-passage font-serif text-lg leading-relaxed text-stone-800"
        dangerouslySetInnerHTML={{ __html: passageHtml }}
        onClick={handleClick}
      />
    </div>
  )
}
