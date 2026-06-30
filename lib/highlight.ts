import type { Keyword } from './types'

// Inject <span class="keyword-highlight"> tags into ESV HTML without breaking tags.
// Sort longest phrases first so "eternal life" matches before "life".
export function injectKeywordHighlights(html: string, keywords: Keyword[]): string {
  const sorted = [...keywords].sort((a, b) => b.word.length - a.word.length)

  let result = html
  for (const kw of sorted) {
    const escaped = kw.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const boundary = kw.word.includes(' ') ? '' : '\\b'
    // Skip HTML tags; replace keyword occurrences in text content only
    const pattern = new RegExp(`(<[^>]*>)|${boundary}(${escaped})${boundary}`, 'gi')
    const theme = kw.theme.replace(/"/g, '&quot;')
    let highlighted = false
    result = result.replace(pattern, (_match, tag, word) => {
      if (tag) return tag
      if (highlighted) return word
      highlighted = true
      return `<span class="keyword-highlight" data-keyword="${kw.word}" data-theme="${theme}" data-lang="${kw.originalLanguage}">${word}</span>`
    })
  }
  return result
}
