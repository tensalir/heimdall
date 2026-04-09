import { NextRequest, NextResponse } from 'next/server'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import { matchEvidenceChunks, isEvidenceRetrievalAvailable } from '@/lib/evidenceClient'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/briefing-memory?q=...&product=...
 * Search historical briefings by semantic similarity.
 * Returns matched chunks with provenance metadata.
 */
export async function GET(req: NextRequest) {
  const auth = await requirePrivilegedUser(req)
  if (auth.error) return auth.error

  if (!isEvidenceRetrievalAvailable()) {
    return NextResponse.json({ error: 'Evidence retrieval not configured (check VOYAGE_API_KEY)' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const product = searchParams.get('product')?.trim() || null
  const limit = Math.min(Number(searchParams.get('limit') || 10), 30)

  if (!q) {
    return NextResponse.json({ error: 'q parameter required' }, { status: 400 })
  }

  const chunks = await matchEvidenceChunks({
    query: q,
    matchCount: limit,
    similarityThreshold: 0.2,
    datasourceId: null,
    productOrUseCase: product,
  })

  const results = chunks.map((c) => {
    const ctx = c.context_json as Record<string, unknown> | null
    return {
      id: c.id,
      content: c.content,
      similarity: Math.round(c.similarity * 1000) / 1000,
      datasource: c.datasource_id,
      product: c.product_or_use_case,
      recency: c.recency,
      briefName: ctx?.brief_name ?? ctx?.monday_item_name ?? null,
      section: ctx?.section ?? null,
      mondayItemId: ctx?.monday_item_id ?? null,
      sourceOrigin: ctx?.source_origin ?? null,
    }
  })

  return NextResponse.json({ results, total: results.length })
}

/**
 * POST /api/briefing-assistant/briefing-memory
 * Index health check and stats.
 * Body: { action: 'stats' }
 */
export async function POST(req: NextRequest) {
  const auth = await requirePrivilegedUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  const body = await req.json().catch(() => ({}))
  const action = (body as { action?: string }).action

  if (action === 'stats') {
    const { count: totalChunks } = await db
      .from('evidence_chunks')
      .select('id', { count: 'exact', head: true })

    const { count: mondayChunks } = await db
      .from('evidence_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('datasource_id', 'monday_briefings')

    const { count: priorChunks } = await db
      .from('evidence_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('datasource_id', 'prior_briefings')

    const { data: datasets } = await db
      .from('evidence_datasets')
      .select('id, dataset_key, source_filename, extracted_at')
      .order('extracted_at', { ascending: false })
      .limit(10)

    const voyageConfigured = !!process.env.VOYAGE_API_KEY
    const retrivalAvailable = isEvidenceRetrievalAvailable()

    return NextResponse.json({
      health: {
        voyage_configured: voyageConfigured,
        retrieval_available: retrivalAvailable,
      },
      counts: {
        total_chunks: totalChunks ?? 0,
        monday_briefing_chunks: mondayChunks ?? 0,
        prior_briefing_chunks: priorChunks ?? 0,
      },
      recent_datasets: datasets ?? [],
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
