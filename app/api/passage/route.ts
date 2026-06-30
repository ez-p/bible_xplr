import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Keyword } from '@/lib/types'
import { injectKeywordHighlights } from '@/lib/highlight'

const ESV_BASE = 'https://api.esv.org/v3/passage'
const anthropic = new Anthropic()

async function detectKeywords(passageText: string, reference: string): Promise<Keyword[]> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: 'You are a biblical scholar and theologian specializing in original language word studies.',
    messages: [
      {
        role: 'user',
        content: `Identify 3–16 major theological theme keywords in this Bible passage. Choose words central to meaning, doctrine, or interpretive significance — not generic words.

Passage (${reference}):
"${passageText}"

Return ONLY a valid JSON object:
{
  "keywords": [
    { "word": "loved", "theme": "Divine Love", "originalLanguage": "Greek" }
  ]
}

Rules:
- "word" must appear verbatim in the passage text above (exact spelling, may be a short phrase)
- Each "word" must be unique — do not repeat the same word or phrase more than once
- "originalLanguage": "Greek" for New Testament; "Hebrew" for Old Testament (Genesis–Malachi)
- "theme": short label, 2–4 words`,
      },
    ],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return []

  try {
    const data = JSON.parse(match[0])
    if (!Array.isArray(data.keywords)) return []
    const seen = new Set<string>()
    return (data.keywords as Keyword[]).filter(kw => {
      const key = kw.word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  } catch {
    return []
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const reference: string = body?.reference?.trim() ?? ''

  if (!reference) {
    return Response.json({ error: 'Reference is required' }, { status: 400 })
  }

  const q = encodeURIComponent(reference)
  const auth = `Token ${process.env.ESV_API_TOKEN}`

  const [textRes, htmlRes] = await Promise.all([
    fetch(
      `${ESV_BASE}/text/?q=${q}&include-headings=false&include-footnotes=false&include-verse-numbers=false&include-short-copyright=false&include-passage-references=false`,
      { headers: { Authorization: auth } }
    ),
    fetch(
      `${ESV_BASE}/html/?q=${q}&include-headings=true&include-footnotes=false&include-verse-numbers=true&include-short-copyright=false&include-passage-references=false&include-css-link=false`,
      { headers: { Authorization: auth } }
    ),
  ])

  if (!textRes.ok) {
    const err = await textRes.json().catch(() => ({}))
    return Response.json(
      { error: err.detail ?? 'Passage not found — check your reference format.' },
      { status: 400 }
    )
  }

  const [textData, htmlData] = await Promise.all([textRes.json(), htmlRes.json()])

  if (!textData.passages?.length) {
    return Response.json(
      { error: 'Passage not found — check your reference format.' },
      { status: 400 }
    )
  }

  const passageText = (textData.passages[0] as string).trim()
  const canonical = textData.canonical as string
  const rawHtml = (htmlData.passages?.[0] as string) ?? passageText

  // Keyword detection — if Claude fails, return passage without highlights
  let keywords: Keyword[] = []
  let keywordError = false
  try {
    keywords = await detectKeywords(passageText, canonical)
  } catch {
    keywordError = true
  }

  const passageHtml = keywords.length
    ? injectKeywordHighlights(rawHtml, keywords)
    : rawHtml

  return Response.json({
    passageText,
    passageHtml,
    reference: canonical,
    keywords,
    ...(keywordError && { notice: 'Keyword detection unavailable — passage shown without highlights.' }),
  })
}
