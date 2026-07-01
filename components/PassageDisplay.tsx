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
      <h2 className="text-xl font-semibold text-heading mb-4">{reference}</h2>
      {notice && (
        <p className="mb-3 text-sm text-olive bg-gold/10 border border-gold/30 rounded px-3 py-2">
          {notice}
        </p>
      )}
      {keywords.length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground font-sans">
          Click a highlighted word to explore its original language meaning
        </p>
      )}
      <div
        className="esv-passage font-serif text-lg leading-relaxed text-foreground bg-white rounded-lg shadow-sm p-6 border border-border"
        dangerouslySetInnerHTML={{ __html: passageHtml }}
        onClick={handleClick}
      />
    </div>
  )
}
