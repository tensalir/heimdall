import { NextResponse } from 'next/server'
import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { matchDocumentChatChunks } from '@/lib/document-chat/retrieval'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
  collection_slug: z.string().min(1).max(200).optional(),
  collection_id: z.string().uuid().optional(),
  match_count: z.number().int().min(1).max(20).optional(),
})

/**
 * POST /api/gpt-actions/answer
 * Retrieves chunks, then asks Claude to answer only from context (citations required).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`gpt-actions-answer:${ip}`, 40, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfterMs: rl.retryAfterMs },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    )
  }

  let parsed: z.infer<typeof bodySchema>
  try {
    parsed = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (parsed.collection_id && parsed.collection_slug) {
    return NextResponse.json(
      { error: 'Provide only one of collection_id or collection_slug' },
      { status: 400 },
    )
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured; use search endpoint only' },
      { status: 503 },
    )
  }

  const matches = await matchDocumentChatChunks({
    query: parsed.query,
    collectionId: parsed.collection_id ?? null,
    collectionSlug: parsed.collection_slug ?? null,
    matchCount: parsed.match_count ?? 10,
    similarityThreshold: 0.2,
  })

  if (matches.length === 0) {
    return NextResponse.json({
      answer:
        'No relevant passages were found in the uploaded document corpus for this question. Try rephrasing or confirm documents are ingested and indexed.',
      citations: [],
      retrieval_count: 0,
    })
  }

  const contextBlocks = matches.map((m, i) => {
    return `[#${i + 1}] file="${m.filename}" collection="${m.collection_slug}" similarity=${m.similarity.toFixed(3)}\n${m.content}`
  })

  const system = `You are a careful assistant for Loop Earplugs internal documents.
Answer ONLY using the CONTEXT blocks. If CONTEXT does not contain enough information, say so clearly.
Every factual claim must cite one or more [#n] reference numbers from CONTEXT.
Do not invent policies, numbers, or product claims not present in CONTEXT.
Keep answers concise unless the user asks for detail.`

  const userContent = `CONTEXT:\n\n${contextBlocks.join('\n\n---\n\n')}\n\nQUESTION:\n${parsed.query}`

  const client = new Anthropic({ apiKey })
  let text = ''
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content: userContent }],
    })
    const block = msg.content.find((b) => b.type === 'text')
    text = block && block.type === 'text' ? block.text : ''
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `LLM error: ${msg}` }, { status: 502 })
  }

  return NextResponse.json({
    answer: text,
    retrieval_count: matches.length,
    citations: matches.map((m, i) => ({
      ref: i + 1,
      filename: m.filename,
      collection_slug: m.collection_slug,
      chunk_id: m.id,
      similarity: m.similarity,
    })),
  })
}
