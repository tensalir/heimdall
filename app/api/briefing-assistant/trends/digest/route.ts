import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { synthesizeDigest, getVertical, VERTICALS } from '@/src/services/trendDiscoveryService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/trends/digest?vertical=festivals
 * Returns the Perplexity-generated trend digest for a vertical.
 * If the digest is stale (>24h) or missing, regenerates on demand.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const verticalId = searchParams.get('vertical')?.trim()

  if (!verticalId) {
    return NextResponse.json(
      { error: 'vertical query parameter required', available: VERTICALS.map((v) => v.id) },
      { status: 400 },
    )
  }

  if (!getVertical(verticalId)) {
    return NextResponse.json(
      { error: `Unknown vertical: ${verticalId}`, available: VERTICALS.map((v) => v.id) },
      { status: 400 },
    )
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const digestExternalId = `digest-${verticalId}`
  const { data: existing } = await db
    .from('briefing_source_items')
    .select('body_text, raw_data, updated_at')
    .eq('source_type', 'trend')
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

  const result = await synthesizeDigest(verticalId)
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
