/**
 * Meta Ad Library API client.
 * Fetches ads from the Meta Ad Library API with search, pagination, and filtering.
 * Requires META_AD_LIBRARY_ACCESS_TOKEN in env.
 */

const META_AD_LIBRARY_API = 'https://graph.facebook.com/v21.0/ads_archive'

export interface MetaAdLibraryParams {
  search_terms?: string
  ad_reached_countries?: string[]
  ad_active_status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
  search_page_ids?: string[]
  ad_type?: 'POLITICAL_AND_ISSUE_ADS' | 'ALL'
  media_type?: 'IMAGE' | 'VIDEO' | 'MEME' | 'NONE'
  limit?: number
  after?: string
}

export interface MetaAdLibraryAd {
  id: string
  ad_creative_bodies?: string[]
  ad_creative_link_captions?: string[]
  ad_creative_link_descriptions?: string[]
  ad_creative_link_titles?: string[]
  ad_delivery_start_time?: string
  ad_delivery_stop_time?: string
  ad_snapshot_url?: string
  page_id?: string
  page_name?: string
  publisher_platforms?: string[]
  spend?: { lower_bound: string; upper_bound: string }
  impressions?: { lower_bound: string; upper_bound: string }
  currency?: string
}

export interface MetaAdLibraryResponse {
  data: MetaAdLibraryAd[]
  paging?: {
    cursors?: { before: string; after: string }
    next?: string
  }
}

function getAccessToken(): string | null {
  return process.env.META_AD_LIBRARY_ACCESS_TOKEN ?? null
}

export function isMetaAdLibraryAvailable(): boolean {
  return !!getAccessToken()
}

export async function searchMetaAdLibrary(
  params: MetaAdLibraryParams,
): Promise<MetaAdLibraryResponse> {
  const token = getAccessToken()
  if (!token) {
    throw new Error('META_AD_LIBRARY_ACCESS_TOKEN not configured')
  }

  const url = new URL(META_AD_LIBRARY_API)
  url.searchParams.set('access_token', token)
  url.searchParams.set('fields', [
    'id',
    'ad_creative_bodies',
    'ad_creative_link_captions',
    'ad_creative_link_descriptions',
    'ad_creative_link_titles',
    'ad_delivery_start_time',
    'ad_delivery_stop_time',
    'ad_snapshot_url',
    'page_id',
    'page_name',
    'publisher_platforms',
    'spend',
    'impressions',
    'currency',
  ].join(','))

  if (params.search_terms) url.searchParams.set('search_terms', params.search_terms)
  if (params.ad_reached_countries?.length) {
    url.searchParams.set('ad_reached_countries', JSON.stringify(params.ad_reached_countries))
  }
  url.searchParams.set('ad_active_status', params.ad_active_status ?? 'ALL')
  url.searchParams.set('ad_type', params.ad_type ?? 'ALL')
  if (params.search_page_ids?.length) {
    url.searchParams.set('search_page_ids', params.search_page_ids.join(','))
  }
  if (params.media_type) url.searchParams.set('media_type', params.media_type)
  url.searchParams.set('limit', String(params.limit ?? 25))
  if (params.after) url.searchParams.set('after', params.after)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Meta Ad Library API ${res.status}: ${text}`)
  }
  return (await res.json()) as MetaAdLibraryResponse
}

/**
 * Normalize a Meta Ad Library API response ad into our internal source item shape.
 */
export function normalizeMetaAd(ad: MetaAdLibraryAd): {
  external_id: string
  title: string
  preview: string
  page_name: string
  body_text: string | null
  link_url: string | null
  thumbnail_url: string | null
  media_type: 'image' | 'video'
  platform: string
  is_active: boolean
  started_at: string | null
  ended_at: string | null
  spend_lower: number | null
  spend_upper: number | null
  impressions_lower: number | null
  impressions_upper: number | null
  raw_data: Record<string, unknown>
} {
  const bodies = ad.ad_creative_bodies ?? []
  const bodyText = bodies[0] ?? null
  const pageName = ad.page_name ?? 'Unknown'
  const platforms = (ad.publisher_platforms ?? []).join(', ')
  const snapshotUrl = ad.ad_snapshot_url ?? null

  return {
    external_id: ad.id,
    title: pageName,
    preview: bodyText?.slice(0, 200) ?? '',
    page_name: pageName,
    body_text: bodyText,
    link_url: snapshotUrl,
    thumbnail_url: snapshotUrl,
    media_type: 'image',
    platform: platforms || 'meta',
    is_active: !ad.ad_delivery_stop_time,
    started_at: ad.ad_delivery_start_time ?? null,
    ended_at: ad.ad_delivery_stop_time ?? null,
    spend_lower: ad.spend?.lower_bound ? Number(ad.spend.lower_bound) : null,
    spend_upper: ad.spend?.upper_bound ? Number(ad.spend.upper_bound) : null,
    impressions_lower: ad.impressions?.lower_bound ? Number(ad.impressions.lower_bound) : null,
    impressions_upper: ad.impressions?.upper_bound ? Number(ad.impressions.upper_bound) : null,
    raw_data: ad as unknown as Record<string, unknown>,
  }
}
