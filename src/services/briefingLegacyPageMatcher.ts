/**
 * Safe matching for legacy/manual Figma briefing pages that predate Heimdall sync metadata.
 * We only auto-backfill rows when we have a populated page and an exact, unambiguous match.
 */

export type LegacyPageContentStatus = 'populated' | 'empty'

export interface LegacyPageSummary {
  pageId: string
  pageName: string
  mondayItemId?: string | null
  contentStatus?: LegacyPageContentStatus | null
}

export interface LegacySyncCandidateItem {
  mondayItemId: string
  mondayBoardId: string
  mondayItemName: string
  batchCanonical: string
}

export interface LegacySyncMatch {
  item: LegacySyncCandidateItem
  page: LegacyPageSummary
  matchType: 'plugin_data' | 'page_name'
}

export function normalizeBriefingName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function coerceLegacyPageSummaries(raw: unknown): LegacyPageSummary[] {
  if (!Array.isArray(raw)) return []

  const pages: LegacyPageSummary[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const pageId = String(obj.pageId ?? '').trim()
    const pageName = String(obj.pageName ?? '').trim()
    const mondayItemId = String(obj.mondayItemId ?? '').trim()
    const rawStatus = String(obj.contentStatus ?? '').trim().toLowerCase()
    const contentStatus =
      rawStatus === 'populated' || rawStatus === 'empty'
        ? (rawStatus as LegacyPageContentStatus)
        : null

    if (!pageId || !pageName) continue
    pages.push({
      pageId,
      pageName,
      ...(mondayItemId ? { mondayItemId } : {}),
      ...(contentStatus ? { contentStatus } : {}),
    })
  }

  return pages
}

export function matchLegacyBriefingPages(
  items: LegacySyncCandidateItem[],
  pages: LegacyPageSummary[]
): LegacySyncMatch[] {
  const populatedPages = pages.filter((page) => page.contentStatus === 'populated')
  if (populatedPages.length === 0 || items.length === 0) return []

  const itemById = new Map(items.map((item) => [item.mondayItemId, item]))
  const itemsByName = new Map<string, LegacySyncCandidateItem[]>()
  for (const item of items) {
    const normalized = normalizeBriefingName(item.mondayItemName)
    if (!normalized) continue
    const list = itemsByName.get(normalized) ?? []
    list.push(item)
    itemsByName.set(normalized, list)
  }

  const matches: LegacySyncMatch[] = []
  const matchedItemIds = new Set<string>()
  const matchedPageIds = new Set<string>()

  for (const page of populatedPages) {
    const mondayItemId = String(page.mondayItemId ?? '').trim()
    if (!mondayItemId) continue
    const item = itemById.get(mondayItemId)
    if (!item || matchedItemIds.has(item.mondayItemId) || matchedPageIds.has(page.pageId)) continue
    matches.push({ item, page, matchType: 'plugin_data' })
    matchedItemIds.add(item.mondayItemId)
    matchedPageIds.add(page.pageId)
  }

  for (const page of populatedPages) {
    if (matchedPageIds.has(page.pageId)) continue
    const normalizedPageName = normalizeBriefingName(page.pageName)
    if (!normalizedPageName) continue

    const candidates = (itemsByName.get(normalizedPageName) ?? []).filter(
      (item) => !matchedItemIds.has(item.mondayItemId)
    )
    if (candidates.length !== 1) continue

    const item = candidates[0]
    matches.push({ item, page, matchType: 'page_name' })
    matchedItemIds.add(item.mondayItemId)
    matchedPageIds.add(page.pageId)
  }

  return matches
}
