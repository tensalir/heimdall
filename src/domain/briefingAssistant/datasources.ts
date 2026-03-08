/**
 * Canonical datasource IDs and labels shared by UI and APIs.
 * Use these IDs in API requests and UI state; reject any ID not in this set.
 */

export const DATASOURCE_IDS = [
  'ad_performance',
  'social_comments',
  'untapped_use_cases',
  'prior_briefings',
  'static_fallback',
] as const

export type CanonicalDatasourceId = (typeof DATASOURCE_IDS)[number]

/** Display config for UI (label + icon key for Lucide). */
export const DATASOURCE_CONFIG: Record<
  CanonicalDatasourceId,
  { label: string; icon: 'MessageSquare' | 'Lightbulb' | 'BarChart3' | 'FileText' | 'BookOpen' }
> = {
  ad_performance: { label: 'Ads', icon: 'BarChart3' },
  social_comments: { label: 'Social', icon: 'MessageSquare' },
  untapped_use_cases: { label: 'Use cases', icon: 'Lightbulb' },
  prior_briefings: { label: 'Prior Briefings', icon: 'BookOpen' },
  static_fallback: { label: 'Static', icon: 'FileText' },
}

/** IDs shown in the generator panel (exclude static_fallback). */
export const UI_DATASOURCE_IDS: CanonicalDatasourceId[] = [
  'ad_performance',
  'social_comments',
  'untapped_use_cases',
  'prior_briefings',
]

const idSet = new Set<string>(DATASOURCE_IDS)

export function isCanonicalDatasourceId(id: string): id is CanonicalDatasourceId {
  return idSet.has(id)
}

/** Validate and filter to only canonical IDs; reject invalid ones (no silent fallback). */
export function validateDatasourceIds(ids: string[]): CanonicalDatasourceId[] {
  const out: CanonicalDatasourceId[] = []
  for (const id of ids) {
    if (isCanonicalDatasourceId(id)) out.push(id)
  }
  return out
}
