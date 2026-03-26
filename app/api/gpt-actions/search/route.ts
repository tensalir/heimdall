import { NextResponse } from 'next/server'
import { z } from 'zod'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { matchDocumentChatChunks, searchDocumentChatGraph } from '@/lib/document-chat/retrieval'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  query: z.string().min(1).max(8000),
  collection_slug: z.string().min(1).max(200).optional(),
  collection_id: z.string().uuid().optional(),
  match_count: z.number().int().min(1).max(25).optional(),
  similarity_threshold: z.number().min(0).max(1).optional(),
  include_graph: z.boolean().optional(),
})

/**
 * POST /api/gpt-actions/search
 * Auth: middleware (X-Heimdall-Gpt-Actions-Secret or Bearer).
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const rl = checkRateLimit(`gpt-actions-search:${ip}`, 120, 60_000)
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

  const [matches, graphRows] = await Promise.all([
    matchDocumentChatChunks({
      query: parsed.query,
      collectionId: parsed.collection_id ?? null,
      collectionSlug: parsed.collection_slug ?? null,
      matchCount: parsed.match_count,
      similarityThreshold: parsed.similarity_threshold,
    }),
    parsed.include_graph
      ? searchDocumentChatGraph({
          query: parsed.query,
          collectionId: parsed.collection_id ?? null,
          collectionSlug: parsed.collection_slug ?? null,
        })
      : Promise.resolve([]),
  ])

  return NextResponse.json({
    query: parsed.query,
    count: matches.length,
    results: matches.map((m) => ({
      chunk_id: m.id,
      document_id: m.document_id,
      collection_id: m.collection_id,
      collection_slug: m.collection_slug,
      filename: m.filename,
      chunk_index: m.chunk_index,
      similarity: m.similarity,
      excerpt: m.content,
    })),
    graph:
      parsed.include_graph && graphRows.length > 0
        ? graphRows.map((g) => ({
            entity: g.entity_name,
            entity_type: g.entity_type,
            related_to: g.neighbor_name,
            neighbor_type: g.neighbor_type,
            relation: g.relation_type,
            evidence_chunk_id: g.evidence_chunk_id,
          }))
        : undefined,
  })
}
