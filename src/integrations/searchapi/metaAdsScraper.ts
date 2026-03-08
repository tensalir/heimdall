/**
 * SearchAPI-powered Meta Ads Library scraper.
 *
 * Uses the SearchAPI Meta Ad Library engine to fetch structured ad data
 * including direct image/video URLs extracted from Meta's rendered pages.
 * Returns NormalizedMetaAd[] for the same ingestion pipeline as Apify/browser.
 *
 * Requires SEARCHAPI_API_KEY env var.
 * Pricing: credit-based; see https://www.searchapi.io/pricing
 *
 * @see https://www.searchapi.io/docs/meta-ad-library-api
 */

import type { NormalizedMetaAd, MediaTier } from '../meta/client.js'

const SEARCHAPI_BASE = 'https://www.searchapi.io/api/v1/search'
const REQUEST_TIMEOUT_MS = 30_000

export interface SearchApiScrapeParams {
  search_terms?: string
  search_page_ids?: string[]
  country?: string
  ad_active_status?: 'active' | 'inactive' | 'all'
  media_type?: 'all' | 'video' | 'image'
  limit?: number
  sort?: 'most_recent' | 'impressions_high_to_low'
}

export interface SearchApiScrapeResult {
  ads: NormalizedMetaAd[]
  provider: 'searchapi'
  scraped: number
  errors: string[]
  totalResults?: number
}

function getApiKey(): string | null {
  return process.env.SEARCHAPI_API_KEY ?? null
}

export function isSearchApiAvailable(): boolean {
  return !!process.env.SEARCHAPI_API_KEY
}

// ---------------------------------------------------------------------------
// Raw response types from SearchAPI
// ---------------------------------------------------------------------------

interface SearchApiImage {
  original_image_url?: string
  resized_image_url?: string
}

interface SearchApiVideo {
  video_hd_url?: string
  video_sd_url?: string
  video_preview_image_url?: string
}

interface SearchApiCard {
  body?: string
  title?: string
  link_url?: string
  link_description?: string
  cta_text?: string
  cta_type?: string
  original_image_url?: string
  resized_image_url?: string
}

interface SearchApiSnapshot {
  page_id?: string
  page_name?: string
  page_profile_picture_url?: string
  body?: { text?: string } | string
  title?: string
  caption?: string
  display_format?: string
  link_url?: string
  link_description?: string
  cta_text?: string
  cta_type?: string
  images?: SearchApiImage[]
  videos?: SearchApiVideo[]
  cards?: SearchApiCard[]
  page_categories?: string[]
  page_like_count?: number
  page_entity_type?: string
  current_page_name?: string
}

interface SearchApiAd {
  ad_archive_id?: string
  page_id?: string
  page_name?: string
  snapshot?: SearchApiSnapshot
  is_active?: boolean
  start_date?: string
  end_date?: string
  publisher_platform?: string[]
  categories?: string[]
  collation_count?: number
  collation_id?: string
  entity_type?: string
  gated_type?: string
  impressions_with_index?: { impressions_index?: number }
  total_active_time?: number
  [key: string]: unknown
}

interface SearchApiResponse {
  search_information?: {
    total_results?: number
  }
  ads?: SearchApiAd[]
  pagination?: {
    next_page_token?: string
  }
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function extractBodyText(body: SearchApiSnapshot['body']): string | null {
  if (!body) return null
  if (typeof body === 'string') return body
  if (typeof body === 'object' && body.text) return body.text
  return null
}

function extractImageUrl(snapshot: SearchApiSnapshot | undefined): string | null {
  if (!snapshot) return null

  if (snapshot.images?.length) {
    for (const img of snapshot.images) {
      if (img.original_image_url?.startsWith('http')) return img.original_image_url
      if (img.resized_image_url?.startsWith('http')) return img.resized_image_url
    }
  }

  if (snapshot.cards?.length) {
    for (const card of snapshot.cards) {
      if (card.original_image_url?.startsWith('http')) return card.original_image_url
      if (card.resized_image_url?.startsWith('http')) return card.resized_image_url
    }
  }

  return null
}

function extractVideoUrl(snapshot: SearchApiSnapshot | undefined): string | null {
  if (!snapshot) return null

  if (snapshot.videos?.length) {
    for (const vid of snapshot.videos) {
      if (vid.video_hd_url?.startsWith('http')) return vid.video_hd_url
      if (vid.video_sd_url?.startsWith('http')) return vid.video_sd_url
    }
  }

  return null
}

function extractVideoPoster(snapshot: SearchApiSnapshot | undefined): string | null {
  if (!snapshot?.videos?.length) return null
  for (const vid of snapshot.videos) {
    if (vid.video_preview_image_url?.startsWith('http')) return vid.video_preview_image_url
  }
  return null
}

function parseSearchApiDate(val: string | undefined | null): string | null {
  if (!val) return null
  try {
    const d = new Date(val)
    if (!isNaN(d.getTime())) return d.toISOString()
  } catch { /* ignore */ }
  return null
}

function normalizeSearchApiAd(item: SearchApiAd): NormalizedMetaAd | null {
  const externalId = item.ad_archive_id
  if (!externalId) return null

  const snapshot = item.snapshot
  const pageName = snapshot?.current_page_name || snapshot?.page_name || item.page_name || 'Unknown'
  const pageId = snapshot?.page_id || item.page_id || null
  const platforms = (item.publisher_platform ?? []).join(', ')

  const bodyText = extractBodyText(snapshot?.body) ?? null
  const videoUrl = extractVideoUrl(snapshot)
  const hasVideo = !!videoUrl || snapshot?.display_format === 'VIDEO'

  const imageUrl = extractImageUrl(snapshot)
  const videoPoster = extractVideoPoster(snapshot)
  const thumbnailUrl = imageUrl || videoPoster

  const linkUrl = snapshot?.link_url ?? null
  const tier: MediaTier = 'poster_only'

  return {
    external_id: String(externalId),
    page_id: pageId ? String(pageId) : null,
    title: pageName,
    preview: (bodyText ?? snapshot?.title ?? '').slice(0, 200),
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
    is_active: item.is_active ?? true,
    started_at: parseSearchApiDate(item.start_date),
    ended_at: parseSearchApiDate(item.end_date),
    spend_lower: null,
    spend_upper: null,
    impressions_lower: null,
    impressions_upper: null,
    raw_data: { _source: 'searchapi', ...item },
    language: null,
    cta_text: snapshot?.cta_text ?? null,
    cta_type: snapshot?.cta_type ?? null,
    collation_count: item.collation_count ?? null,
    categories: item.categories ?? null,
    link_caption: snapshot?.caption ?? null,
    link_description: snapshot?.link_description ?? null,
    snapshot_title: snapshot?.title ?? null,
    source_provider: 'searchapi',
  }
}

// ---------------------------------------------------------------------------
// Main scrape function
// ---------------------------------------------------------------------------

export async function scrapeViaSearchApi(
  params: SearchApiScrapeParams,
): Promise<SearchApiScrapeResult> {
  const errors: string[] = []
  const apiKey = getApiKey()
  if (!apiKey) {
    return { ads: [], provider: 'searchapi', scraped: 0, errors: ['SEARCHAPI_API_KEY not configured'] }
  }

  if (!params.search_terms?.trim() && !params.search_page_ids?.length) {
    return { ads: [], provider: 'searchapi', scraped: 0, errors: ['No search terms or page IDs provided'] }
  }

  const allAds: NormalizedMetaAd[] = []
  const targetCount = Math.max(10, params.limit ?? 50)
  let totalResults: number | undefined
  let nextPageToken: string | undefined

  const pageIds = params.search_page_ids ?? []
  const queries: Array<{ q?: string; page_id?: string }> = []

  if (pageIds.length > 0) {
    for (const pid of pageIds) {
      queries.push({ page_id: pid, q: params.search_terms })
    }
  } else if (params.search_terms) {
    queries.push({ q: params.search_terms })
  }

  for (const query of queries) {
    nextPageToken = undefined

    while (allAds.length < targetCount) {
      try {
        const url = new URL(SEARCHAPI_BASE)
        url.searchParams.set('engine', 'meta_ad_library')
        url.searchParams.set('api_key', apiKey)

        if (query.q) url.searchParams.set('q', query.q)
        if (query.page_id) url.searchParams.set('page_id', query.page_id)

        const country = params.country ?? 'US'
        if (country !== 'ALL') url.searchParams.set('country', country.toLowerCase())

        if (params.ad_active_status && params.ad_active_status !== 'all') {
          url.searchParams.set('active_status', params.ad_active_status)
        }
        if (params.media_type && params.media_type !== 'all') {
          url.searchParams.set('media_type', params.media_type)
        }
        if (params.sort) {
          url.searchParams.set('sort_by', params.sort)
        }
        if (nextPageToken) {
          url.searchParams.set('next_page_token', nextPageToken)
        }

        const res = await fetch(url.toString(), {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { Accept: 'application/json' },
        })

        if (!res.ok) {
          const body = await res.text().catch(() => '')
          errors.push(`SearchAPI HTTP ${res.status}: ${body.slice(0, 200)}`)
          break
        }

        const data = (await res.json()) as SearchApiResponse
        totalResults = data.search_information?.total_results ?? totalResults

        const rawAds = data.ads ?? []
        if (rawAds.length === 0) break

        for (const item of rawAds) {
          const normalized = normalizeSearchApiAd(item)
          if (normalized) allAds.push(normalized)
          if (allAds.length >= targetCount) break
        }

        nextPageToken = data.pagination?.next_page_token
        if (!nextPageToken) break

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[searchapi] Request failed: ${msg}`)
        errors.push(`SearchAPI request failed: ${msg}`)
        break
      }
    }
  }

  console.log(`[searchapi] Completed: ${allAds.length} normalized ads (total available: ${totalResults ?? 'unknown'})`)

  return {
    ads: allAds.slice(0, targetCount),
    provider: 'searchapi',
    scraped: allAds.length,
    errors,
    totalResults,
  }
}
