import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { expositionLimit } from '@/lib/ratelimit'

const anthropic = new Anthropic()

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'anonymous'
  const { success } = await expositionLimit.limit(ip)
  if (!success) {
    return Response.json(
      { error: 'Too many requests — please wait a moment before trying again.' },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { keyword, theme, originalLanguage, passageText, reference } = body

  if (!keyword || !passageText || !reference) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (
    typeof keyword !== 'string' || keyword.length > 100 ||
    typeof reference !== 'string' || reference.length > 100 ||
    typeof passageText !== 'string' || passageText.length > 10_000 ||
    typeof theme !== 'string' || theme.length > 100 ||
    !['Greek', 'Hebrew'].includes(originalLanguage)
  ) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const claudeStream = anthropic.messages.stream({
          model: 'claude-sonnet-5',
          max_tokens: 2048,
          system: `You are a biblical scholar specializing in ${originalLanguage} original language word studies and their theological significance.`,
          messages: [
            {
              role: 'user',
              content: `Generate an original-language exposition for the keyword "${keyword}" in this Bible passage.

Passage: ${reference}
"${passageText}"

Keyword: "${keyword}" | Theme: ${theme} | Language: ${originalLanguage}

Structure your response EXACTLY as follows, using these exact markers on their own lines:

===SUMMARY===
[2–3 sentences: state the original ${originalLanguage} word and its transliteration, then explain its core meaning and how it specifically deepens understanding of this verse]

===FULL===
[3–5 paragraphs: (1) etymology and root meaning, (2) usage across key Scripture passages, (3) theological significance, (4) how this original-language knowledge expands the reader's understanding of this specific passage]`,
            },
          ],
        })

        for await (const event of claudeStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err) {
        controller.error(err)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
