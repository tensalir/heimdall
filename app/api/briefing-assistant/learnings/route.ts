import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

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

/**
 * GET /api/briefing-assistant/learnings
 * Aggregates working_doc_sections across all briefing_assignments to surface
 * recurring patterns grouped by product/use case and section.
 * Phase 1: direct DB aggregation. Phase 2: vector retrieval + LLM summarization.
 */
export async function GET() {
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

  if (!assignments?.length) {
    return NextResponse.json({ products: [], totalBriefs: 0 })
  }

  const sectionKeys = ['idea', 'why', 'audience', 'product', 'visual', 'copyInfo', 'test', 'variants'] as const

  const productMap = new Map<string, { briefIds: Set<string>; sectionMap: Map<string, string[]> }>()

  for (const row of assignments) {
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

  return NextResponse.json({
    products,
    totalBriefs: assignments.length,
  })
}
