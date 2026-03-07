/**
 * Apify-powered Meta Ads Library scraper.
 *
 * Uses the "curious_coder/facebook-ads-library-scraper" Actor on Apify
 * to fetch ads without needing a Meta API token or local Puppeteer.
 * Returns NormalizedMetaAd[] for the same ingestion pipeline.
 *
 * Requires APIFY_API_TOKEN env var.
 * Pricing: ~$0.75 per 1,000 ads.
 *
 * @see https://apify.com/curious_coder/facebook-ads-library-scraper
 */

import { ApifyClient } from 'apify-client'
import type { NormalizedMetaAd, MediaTier } from '../meta/client.js'

const ACTOR_ID = 'curious_coder/facebook-ads-library-scraper'
const DEFAULT_TIMEOUT_SECS = 120

export interface ApifyScrapeParams {
  search_terms?: string
  search_page_ids?: string[]
  country?: string
  ad_active_status?: 'all' | 'active' | 'inactive'
  limit?: number
  sort?: 'impressions_desc' | 'most_recent'
}

export interface ApifyScrapeResult {
  ads: NormalizedMetaAd[]
  provider: 'apify'
  scraped: number
  errors: string[]
  runId?: string
  costUsd?: number
}

function getApifyClient(): ApifyClient | null {
  const token = process.env.APIFY_API_TOKEN
  if (!token) return null
  return new ApifyClient({ token })
}

export function isApifyAvailable(): boolean {
  return !!process.env.APIFY_API_TOKEN
}

function buildSearchUrl(params: ApifyScrapeParams): string {
  const url = new URL('https://www.facebook.com/ads/library/')
  url.searchParams.set('active_status', params.ad_active_status ?? 'all')
  url.searchParams.set('ad_type', 'all')
  url.searchParams.set('country', params.country ?? 'US')
  url.searchParams.set('media_type', 'all')

  if (params.search_terms) {
    url.searchParams.set('q', params.search_terms)
    url.searchParams.set('search_type', 'keyword_unordered')
  }

  return url.toString()
}

function buildPageUrl(pageId: string): string {
  return `https://www.facebook.com/${pageId}`
}

interface ApifyAdItem {
  ad_archive_id?: string
  adid?: string
  adArchiveID?: string
  ad_id?: string
  id?: string
  pageName?: string
  page_name?: string
  pageID?: string
  page_id?: string
  isActive?: boolean
  is_active?: boolean
  startDate?: string | number
  start_date?: string
  endDate?: string | number
  end_date?: string
  snapshot?: {
    body?: { markup?: { __html?: string }; text?: string } | string
    cards?: Array<{
      body?: string
      title?: string
      link_url?: string
      image_url?: string
      video_url?: string
    }>
    images?: Array<{ url?: string; original_image_url?: string } | string>
    videos?: Array<{ url?: string; video_url?: string } | string>
    title?: string | { text?: string }
    link_url?: string
    link_caption?: string
    link_description?: string
    cta_text?: string
    cta_type?: string
  }
  impressionsWithIndex?: { impressions_text?: string }
  impressions_with_index?: { impressions_text?: string }
  spend?: { lower_bound?: string; upper_bound?: string } | string
  currency?: string
  publisherPlatform?: string[]
  publisher_platforms?: string[]
  categories?: string[]
  collationCount?: number
  collation_count?: number
  entityType?: string
  entity_type?: string
  languages?: string[]
  language?: string
  state_media_run_label?: string
  gated_type?: string
  [key: string]: unknown
}

function extractText(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) {
    const obj = val as Record<string, unknown>
    if (typeof obj.text === 'string') return obj.text
    if (obj.markup && typeof obj.markup === 'object') {
      const markup = obj.markup as Record<string, unknown>
      if (typeof markup.__html === 'string') {
        return markup.__html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      }
    }
  }
  return null
}

function extractImageUrl(snapshot: ApifyAdItem['snapshot']): string | null {
  if (!snapshot) return null

  if (snapshot.images?.length) {
    for (const img of snapshot.images) {
      if (typeof img === 'string' && img.startsWith('http')) return img
      if (typeof img === 'object' && img !== null) {
        const url = (img as Record<string, string>).original_image_url ||
          (img as Record<string, string>).url
        if (url?.startsWith('http')) return url
      }
    }
  }

  if (snapshot.cards?.length) {
    for (const card of snapshot.cards) {
      if (card.image_url?.startsWith('http')) return card.image_url
    }
  }

  return null
}

function extractVideoUrl(snapshot: ApifyAdItem['snapshot']): string | null {
  if (!snapshot) return null

  if (snapshot.videos?.length) {
    for (const vid of snapshot.videos) {
      if (typeof vid === 'string' && vid.startsWith('http')) return vid
      if (typeof vid === 'object' && vid !== null) {
        const url = (vid as Record<string, string>).video_url ||
          (vid as Record<string, string>).url
        if (url?.startsWith('http')) return url
      }
    }
  }

  if (snapshot.cards?.length) {
    for (const card of snapshot.cards) {
      if (card.video_url?.startsWith('http')) return card.video_url
    }
  }

  return null
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'number') return new Date(val * 1000).toISOString()
  if (typeof val === 'string') {
    try {
      const d = new Date(val)
      if (!isNaN(d.getTime())) return d.toISOString()
    } catch { /* ignore */ }
  }
  return null
}

function normalizeApifyAd(item: ApifyAdItem): NormalizedMetaAd | null {
  const externalId = item.ad_archive_id || item.adid || item.adArchiveID || item.ad_id || item.id
  if (!externalId) return null

  const pageName = item.pageName || item.page_name || 'Unknown'
  const pageId = item.pageID || item.page_id || null
  const platforms = (item.publisherPlatform || item.publisher_platforms || []).join(', ')

  const bodyText = extractText(item.snapshot?.body) ?? null
  const imageUrl = extractImageUrl(item.snapshot)
  const videoUrl = extractVideoUrl(item.snapshot)
  const hasVideo = !!videoUrl
  const thumbnailUrl = imageUrl

  const snapshotTitle = extractText(item.snapshot?.title)
  const linkUrl = item.snapshot?.link_url ?? null

  let spendLower: number | null = null
  let spendUpper: number | null = null
  if (item.spend && typeof item.spend === 'object') {
    spendLower = item.spend.lower_bound ? Number(item.spend.lower_bound) : null
    spendUpper = item.spend.upper_bound ? Number(item.spend.upper_bound) : null
  }

  const tier: MediaTier = 'poster_only'

  const lang = (item.languages?.[0] ?? item.language) || null

  return {
    external_id: String(externalId),
    page_id: pageId ? String(pageId) : null,
    title: pageName,
    preview: (bodyText ?? snapshotTitle ?? '').slice(0, 200),
    page_name: pageName,
    body_text: bodyText,
    link_url: linkUrl
      ? linkUrl
      : `https://www.facebook.com/ads/library/?id=${encodeURIComponent(String(externalId))}`,
    thumbnail_url: thumbnailUrl,
    creative_url: videoUrl,
    media_type: hasVideo ? 'video' : 'image',
    media_tier: tier,
    platform: platforms || 'meta',
    is_active: item.isActive ?? item.is_active ?? true,
    started_at: parseDate(item.startDate ?? item.start_date),
    ended_at: parseDate(item.endDate ?? item.end_date),
    spend_lower: spendLower,
    spend_upper: spendUpper,
    impressions_lower: null,
    impressions_upper: null,
    raw_data: { _source: 'apify', ...item },
    language: lang,
    cta_text: item.snapshot?.cta_text ?? null,
    cta_type: item.snapshot?.cta_type ?? null,
    collation_count: item.collationCount ?? item.collation_count ?? null,
    categories: item.categories ?? null,
    link_caption: item.snapshot?.link_caption ?? null,
    link_description: item.snapshot?.link_description ?? null,
    snapshot_title: snapshotTitle,
    source_provider: 'apify',
  }
}

export async function scrapeViaApify(
  params: ApifyScrapeParams,
): Promise<ApifyScrapeResult> {
  const errors: string[] = []
  const client = getApifyClient()
  if (!client) {
    return { ads: [], provider: 'apify', scraped: 0, errors: ['APIFY_API_TOKEN not configured'] }
  }

  const urls: { url: string }[] = []

  if (params.search_page_ids?.length) {
    for (const pageId of params.search_page_ids) {
      urls.push({ url: buildPageUrl(pageId) })
    }
  }

  if (params.search_terms) {
    urls.push({ url: buildSearchUrl(params) })
  }

  if (urls.length === 0) {
    return { ads: [], provider: 'apify', scraped: 0, errors: ['No search terms or page IDs provided'] }
  }

  const input: Record<string, unknown> = {
    urls,
    count: Math.max(10, params.limit ?? 50),
    'scrapePageAds.activeStatus': params.ad_active_status ?? 'all',
    'scrapePageAds.sortBy': params.sort ?? 'impressions_desc',
    'scrapePageAds.countryCode': (params.country ?? 'US').toUpperCase(),
  }

  try {
    console.log(`[apify] Starting Actor run with ${urls.length} URL(s), limit=${params.limit ?? 50}`)

    const run = await client
      .actor(ACTOR_ID)
      .call(input, { timeout: DEFAULT_TIMEOUT_SECS })

    const { items } = await client
      .dataset(run.defaultDatasetId)
      .listItems()

    const ads: NormalizedMetaAd[] = []
    for (const item of items) {
      const normalized = normalizeApifyAd(item as ApifyAdItem)
      if (normalized) ads.push(normalized)
    }

    console.log(`[apify] Run ${run.id} completed: ${items.length} raw items, ${ads.length} normalized ads`)

    return {
      ads,
      provider: 'apify',
      scraped: ads.length,
      errors,
      runId: run.id,
      costUsd: (run as unknown as Record<string, unknown>).usageTotalUsd as number | undefined,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[apify] Actor run failed: ${msg}`)
    errors.push(`Apify run failed: ${msg}`)
    return { ads: [], provider: 'apify', scraped: 0, errors }
  }
}
