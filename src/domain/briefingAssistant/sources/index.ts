/**
 * Dynamic evidence sources for angle generation.
 * Single retrieval interface: getEvidence(sources, filter) aggregates from selected adapters.
 * Uses canonical datasource IDs (ad_performance, social_comments, etc.) shared with UI and APIs.
 */

import type { EvidenceSnippet } from '../angleContext.js'
import type { EvidenceSourceAdapter, EvidenceFilter } from './types.js'
import type { CanonicalDatasourceId } from '../datasources.js'
import { metaAdapter } from './metaAdapter.js'
import { customerInsightsAdapter } from './customerInsightsAdapter.js'
import { socialCommentsAdapter } from './socialCommentsAdapter.js'
import { priorBriefingsAdapter } from './priorBriefingsAdapter.js'
import { staticAdapter } from './staticAdapter.js'

export type { EvidenceSourceAdapter, EvidenceFilter } from './types.js'
export { metaAdapter } from './metaAdapter.js'
export { customerInsightsAdapter } from './customerInsightsAdapter.js'
export { socialCommentsAdapter } from './socialCommentsAdapter.js'
export { priorBriefingsAdapter } from './priorBriefingsAdapter.js'
export { staticAdapter } from './staticAdapter.js'

/** Canonical datasource IDs (re-export for API validation). Same set as in datasources.ts. */
export { DATASOURCE_IDS as SOURCE_IDS } from '../datasources.js'

const adapterMap: Record<CanonicalDatasourceId, EvidenceSourceAdapter> = {
  ad_performance: metaAdapter,
  untapped_use_cases: customerInsightsAdapter,
  social_comments: socialCommentsAdapter,
  prior_briefings: priorBriefingsAdapter,
  static_fallback: staticAdapter,
}

/**
 * Fetch evidence from the given sources and merge into one list.
 * Deduplicates by snippet id; sorts by recency (newest first).
 * @param sourceIds - Canonical datasource IDs (ad_performance, social_comments, etc.)
 */
export async function getEvidence(
  sourceIds: CanonicalDatasourceId[] = ['static_fallback'],
  filter: EvidenceFilter = {}
): Promise<EvidenceSnippet[]> {
  const limit = filter.limit ?? 50
  const adapters = sourceIds
    .filter((id): id is CanonicalDatasourceId => id in adapterMap)
    .map((id) => adapterMap[id])
  const results = await Promise.all(
    adapters.map((a) => a.getEvidence({ ...filter, limit: Math.ceil(limit / adapters.length) || 10 }))
  )
  const seen = new Set<string>()
  const merged: EvidenceSnippet[] = []
  for (const list of results) {
    for (const s of list) {
      if (!seen.has(s.id)) {
        seen.add(s.id)
        merged.push(s)
      }
    }
  }
  merged.sort((a, b) => (b.recency < a.recency ? -1 : b.recency > a.recency ? 1 : 0))
  return merged.slice(0, limit)
}
