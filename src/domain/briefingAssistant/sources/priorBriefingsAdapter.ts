/**
 * Prior briefings evidence adapter.
 * Retrieves relevant chunks from previously created briefings stored in the
 * evidence_chunks table (datasource_id = 'prior_briefings') via Supabase pgvector.
 * Falls back to fetching directly from briefing_assignments working_doc_sections
 * when no embedded chunks are available yet.
 */

import type { EvidenceSourceAdapter, EvidenceFilter } from './types.js'
import type { EvidenceSnippet } from '../angleContext.js'
import { matchEvidenceChunks, isEvidenceRetrievalAvailable } from '@/lib/evidenceClient.js'

const SOURCE_ID = 'prior_briefings'
const DATASOURCE_FILTER_ID = 'prior_briefings'

export const priorBriefingsAdapter: EvidenceSourceAdapter = {
  sourceId: SOURCE_ID,

  async getEvidence(filter: EvidenceFilter): Promise<EvidenceSnippet[]> {
    const limit = filter.limit ?? 15

    if (isEvidenceRetrievalAvailable()) {
      const query = buildQuery(filter)
      const chunks = await matchEvidenceChunks({
        query,
        matchCount: limit,
        similarityThreshold: 0.25,
        datasourceId: DATASOURCE_FILTER_ID,
        productOrUseCase: filter.productOrUseCase ?? null,
        since: filter.since ?? null,
      })
      if (chunks.length > 0) {
        return chunks.map((c) => ({
          id: c.id,
          text: c.content,
          source: SOURCE_ID,
          recency: c.recency ?? '',
          provenance: provenanceFromContext(c.context_json),
          tags: tagsFromContext(c.context_json),
        }))
      }
    }

    return getFallbackBriefings(filter, limit)
  },
}

function buildQuery(filter: EvidenceFilter): string {
  const parts: string[] = []
  if (filter.productOrUseCase) parts.push(filter.productOrUseCase)
  parts.push('creative briefing strategy angles hooks audience')
  return parts.join(' ')
}

function provenanceFromContext(ctx: Record<string, unknown> | null): string {
  if (!ctx) return 'Prior briefing'
  const section = ctx.section as string | undefined
  const briefName = ctx.brief_name as string | undefined
  const parts: string[] = ['Prior briefing']
  if (briefName) parts[0] = briefName
  if (section) parts.push(section)
  return parts.join(' — ')
}

function tagsFromContext(ctx: Record<string, unknown> | null): string[] {
  if (!ctx) return []
  const tags: string[] = []
  if (typeof ctx.product_or_use_case === 'string') tags.push(ctx.product_or_use_case)
  if (typeof ctx.batch_key === 'string') tags.push(ctx.batch_key)
  if (typeof ctx.section === 'string') tags.push(ctx.section)
  return tags
}

/**
 * Direct DB fallback: pull from briefing_assignments working_doc_sections
 * when no embedded chunks exist. Server-side only (uses service key).
 */
async function getFallbackBriefings(filter: EvidenceFilter, limit: number): Promise<EvidenceSnippet[]> {
  try {
    const { getSupabase } = await import('@/lib/supabase.js')
    const db = getSupabase()
    if (!db) return []

    let query = db
      .from('briefing_assignments')
      .select('id, brief_name, product_or_use_case, working_doc_sections, batch_key, updated_at')
      .not('working_doc_sections', 'eq', '{}')
      .order('updated_at', { ascending: false })
      .limit(limit * 2)

    if (filter.productOrUseCase) {
      query = query.ilike('product_or_use_case', `%${filter.productOrUseCase}%`)
    }

    const { data } = await query
    if (!data?.length) return []

    const snippets: EvidenceSnippet[] = []
    const sectionKeys = ['idea', 'why', 'audience', 'product', 'visual', 'copyInfo', 'test', 'variants'] as const

    for (const row of data) {
      const sections = (row.working_doc_sections ?? {}) as Record<string, string>
      for (const key of sectionKeys) {
        const value = sections[key]?.trim()
        if (!value) continue
        snippets.push({
          id: `${row.id}-${key}`,
          text: value,
          source: SOURCE_ID,
          recency: row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : '',
          provenance: `${row.brief_name ?? 'Briefing'} — ${key}`,
          tags: [row.product_or_use_case, row.batch_key, key].filter(Boolean) as string[],
        })
      }
    }

    return snippets.slice(0, limit)
  } catch {
    return []
  }
}
