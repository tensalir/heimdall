import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { isEvidenceRetrievalAvailable } from '@/lib/evidenceClient'

export const dynamic = 'force-dynamic'

interface SectionAgg {
  section: string
  count: number
  samples: string[]
}

interface ProductAgg {
  product: string
  briefCount: number
  sections: SectionAgg[]
}

interface EvidenceCoverage {
  datasource: string
  chunkCount: number
  latestRecency: string | null
}

interface IndexHealth {
  retrievalAvailable: boolean
  voyageConfigured: boolean
  totalChunks: number
  datasourceCoverage: EvidenceCoverage[]
  gaps: string[]
}

/**
 * GET /api/briefing-assistant/learnings
 * Aggregates working_doc_sections across all briefing_assignments to surface
 * recurring patterns grouped by product/use case and section.
 * Also returns evidence index health and coverage gaps.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: assignments, error } = await db
    .from('briefing_assignments')
    .select('id, brief_name, product_or_use_case, working_doc_sections, batch_key, status, updated_at')
    .not('working_doc_sections', 'eq', '{}')
    .order('updated_at', { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const sectionKeys = ['idea', 'why', 'audience', 'product', 'visual', 'copyInfo', 'test', 'variants'] as const

  const productMap = new Map<string, { briefIds: Set<string>; sectionMap: Map<string, string[]> }>()

  for (const row of assignments ?? []) {
    const product = (row.product_or_use_case as string) || 'General'
    if (!productMap.has(product)) {
      productMap.set(product, { briefIds: new Set(), sectionMap: new Map() })
    }
    const entry = productMap.get(product)!
    entry.briefIds.add(row.id)

    const sections = (row.working_doc_sections ?? {}) as Record<string, string>
    for (const key of sectionKeys) {
      const value = sections[key]?.trim()
      if (!value) continue
      if (!entry.sectionMap.has(key)) entry.sectionMap.set(key, [])
      entry.sectionMap.get(key)!.push(value)
    }
  }

  const products: ProductAgg[] = []
  for (const [product, entry] of productMap.entries()) {
    const sections: SectionAgg[] = []
    for (const [section, values] of entry.sectionMap.entries()) {
      sections.push({
        section,
        count: values.length,
        samples: values.slice(0, 3),
      })
    }
    sections.sort((a, b) => b.count - a.count)
    products.push({
      product,
      briefCount: entry.briefIds.size,
      sections,
    })
  }
  products.sort((a, b) => b.briefCount - a.briefCount)

  const indexHealth = await getIndexHealth(db)

  return NextResponse.json({
    products,
    totalBriefs: assignments?.length ?? 0,
    indexHealth,
  })
}

async function getIndexHealth(db: NonNullable<ReturnType<typeof getSupabase>>): Promise<IndexHealth> {
  const retrievalAvailable = isEvidenceRetrievalAvailable()
  const voyageConfigured = !!process.env.VOYAGE_API_KEY

  const { count: totalChunks } = await db
    .from('evidence_chunks')
    .select('id', { count: 'exact', head: true })

  const datasourceIds = ['ad_performance', 'social_comments', 'prior_briefings', 'monday_briefings']
  const datasourceCoverage: EvidenceCoverage[] = []

  for (const dsId of datasourceIds) {
    const { count } = await db
      .from('evidence_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('datasource_id', dsId)

    const { data: latest } = await db
      .from('evidence_chunks')
      .select('recency')
      .eq('datasource_id', dsId)
      .not('recency', 'is', null)
      .order('recency', { ascending: false })
      .limit(1)
      .maybeSingle()

    datasourceCoverage.push({
      datasource: dsId,
      chunkCount: count ?? 0,
      latestRecency: (latest?.recency as string) ?? null,
    })
  }

  const gaps: string[] = []
  if (!voyageConfigured) gaps.push('VOYAGE_API_KEY not configured — embedding and retrieval disabled')
  if (!retrievalAvailable) gaps.push('Evidence retrieval unavailable (check SUPABASE + VOYAGE config)')

  const mondayEntry = datasourceCoverage.find((d) => d.datasource === 'monday_briefings')
  if (!mondayEntry || mondayEntry.chunkCount === 0) {
    gaps.push('No Monday briefings indexed yet — run ingest-monday-briefings.ts to backfill historical briefs')
  }

  const priorEntry = datasourceCoverage.find((d) => d.datasource === 'prior_briefings')
  if (!priorEntry || priorEntry.chunkCount === 0) {
    gaps.push('No prior briefings indexed — run ingest-prior-briefings.ts to index app-created briefs')
  }

  const adEntry = datasourceCoverage.find((d) => d.datasource === 'ad_performance')
  if (!adEntry || adEntry.chunkCount === 0) {
    gaps.push('No ad performance evidence indexed — ingest Meta ad data for evidence-grounded briefings')
  }

  const socialEntry = datasourceCoverage.find((d) => d.datasource === 'social_comments')
  if (!socialEntry || socialEntry.chunkCount === 0) {
    gaps.push('No social comments indexed — run social discovery or ingest social data')
  }

  for (const ds of datasourceCoverage) {
    if (ds.latestRecency) {
      const daysOld = Math.floor((Date.now() - new Date(ds.latestRecency).getTime()) / 86400000)
      if (daysOld > 30) {
        gaps.push(`${ds.datasource} evidence is ${daysOld} days stale (latest: ${ds.latestRecency})`)
      }
    }
  }

  return {
    retrievalAvailable,
    voyageConfigured,
    totalChunks: totalChunks ?? 0,
    datasourceCoverage,
    gaps,
  }
}
