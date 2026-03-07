import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { synthesizeDigest, getTopic, TOPICS } from '@/src/services/socialListeningDiscoveryService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/social-comments/digest?topic=hearing-protection
 * Returns the Perplexity-generated social listening digest for a topic.
 * If the digest is stale (>24h) or missing, regenerates on demand.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const topicId = searchParams.get('topic')?.trim()

  if (!topicId) {
    return NextResponse.json(
      { error: 'topic query parameter required', available: TOPICS.map((t) => t.id) },
      { status: 400 },
    )
  }

  if (!getTopic(topicId)) {
    return NextResponse.json(
      { error: `Unknown topic: ${topicId}`, available: TOPICS.map((t) => t.id) },
      { status: 400 },
    )
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const digestExternalId = `social-digest-${topicId}`
  const { data: existing } = await db
    .from('briefing_source_items')
    .select('body_text, raw_data, updated_at')
    .eq('source_type', 'social_comment')
    .eq('external_id', digestExternalId)
    .single()

  const STALE_HOURS = 24
  const isStale =
    !existing ||
    !existing.body_text ||
    Date.now() - new Date(existing.updated_at).getTime() > STALE_HOURS * 60 * 60 * 1000

  if (!isStale && existing) {
    const raw = existing.raw_data as Record<string, unknown>
    return NextResponse.json({
      digest: existing.body_text,
      citations: raw?.citations ?? [],
      generatedAt: raw?.generated_at ?? existing.updated_at,
      fresh: false,
    })
  }

  if (!process.env.PERPLEXITY_API_KEY) {
    if (existing?.body_text) {
      const raw = existing.raw_data as Record<string, unknown>
      return NextResponse.json({
        digest: existing.body_text,
        citations: raw?.citations ?? [],
        generatedAt: raw?.generated_at ?? existing.updated_at,
        fresh: false,
        stale: true,
      })
    }
    return NextResponse.json({ error: 'PERPLEXITY_API_KEY not configured' }, { status: 503 })
  }

  const result = await synthesizeDigest(topicId)
  if (!result) {
    return NextResponse.json({ error: 'Digest synthesis failed' }, { status: 502 })
  }

  return NextResponse.json({
    digest: result.digest,
    citations: result.citations,
    generatedAt: result.generatedAt,
    fresh: true,
  })
}
