import type { Client } from '@microsoft/microsoft-graph-client'
import slugify from 'slugify'

export interface PageSummary {
  id: string
  title: string
  slug: string
  webUrl?: string
  lastModifiedDateTime?: string
}

const PAGE_LIST_FIELDS = ['id', 'title', 'name', 'webUrl', 'lastModifiedDateTime'].join(',')

/**
 * List every site page in the given SharePoint site.
 *
 * Filters to pageLayout=article (default content pages) and follows @odata.nextLink
 * for pagination. Excludes news posts unless the user explicitly opts in later.
 */
export async function listAllPages(client: Client, siteId: string): Promise<PageSummary[]> {
  const all: PageSummary[] = []
  let url: string | undefined = `/sites/${siteId}/pages/microsoft.graph.sitePage?$select=${PAGE_LIST_FIELDS}&$top=100`

  while (url) {
    const response: { value?: unknown[]; '@odata.nextLink'?: string } = await client.api(url).get()
    const value = Array.isArray(response.value) ? response.value : []

    for (const raw of value) {
      const summary = toPageSummary(raw)
      if (summary) all.push(summary)
    }

    const nextLink = response['@odata.nextLink']
    if (typeof nextLink === 'string' && nextLink.length > 0) {
      // Microsoft Graph SDK accepts absolute or relative urls; absolute is fine here.
      url = nextLink
    } else {
      url = undefined
    }
  }

  return all
}

/**
 * Find a single page by case-insensitive title or slug match.
 * Used when the user runs `extract:one -- "Brand voice"`.
 */
export async function findPageByTitleOrSlug(
  client: Client,
  siteId: string,
  needle: string,
): Promise<PageSummary | undefined> {
  const all = await listAllPages(client, siteId)
  const normalized = needle.toLowerCase().trim()

  return all.find((p) => p.title.toLowerCase() === normalized || p.slug === normalized || p.slug === toSlug(needle))
}

function toPageSummary(raw: unknown): PageSummary | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>

  const id = typeof r.id === 'string' ? r.id : undefined
  const title = typeof r.title === 'string' && r.title.length > 0
    ? r.title
    : typeof r.name === 'string'
      ? r.name
      : undefined
  if (!id || !title) return undefined

  return {
    id,
    title,
    slug: toSlug(title),
    webUrl: typeof r.webUrl === 'string' ? r.webUrl : undefined,
    lastModifiedDateTime: typeof r.lastModifiedDateTime === 'string' ? r.lastModifiedDateTime : undefined,
  }
}

export function toSlug(input: string): string {
  return slugify(input, { lower: true, strict: true, trim: true })
}
