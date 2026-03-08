import { searchMetaAdLibrary, normalizeMetaAd, isMetaAdLibraryAvailable } from '../../../integrations/meta/client.js'
import type { NormalizedMetaAd } from '../../../integrations/meta/client.js'
import { computeDaysRunning } from '../scoring/semanticTagger.js'
import { scrapeMetaAdsLibrary } from '../../../integrations/meta/browserScraper.js'
import { scrapeViaApify, isApifyAvailable } from '../../../integrations/apify/metaAdsScraper.js'
import type { SupabaseClient } from '@supabase/supabase-js'

export type SourceMode = 'apify' | 'browser' | 'api' | 'auto'
export type SupabaseDb = SupabaseClient

export function getSourceMode(): SourceMode {
  const env = process.env.META_ADS_SOURCE_MODE?.toLowerCase()
  if (env === 'apify') return 'apify'
  if (env === 'api') return 'api'
  if (env === 'browser') return 'browser'
  return 'auto'
}

export function normalizedToRow(n: NormalizedMetaAd, extra?: Record<string, unknown>) {
  const daysRunning = computeDaysRunning(n.started_at, n.ended_at)
  const row: Record<string, unknown> = {
    source_type: 'meta_ad' as const,
    external_id: n.external_id,
    page_id: n.page_id,
    title: n.title,
    preview: n.preview,
    page_name: n.page_name,
    body_text: n.body_text,
    link_url: n.link_url,
    media_type: n.media_type,
    platform: n.platform,
    is_active: n.is_active,
    started_at: n.started_at,
    ended_at: n.ended_at,
    spend_lower: n.spend_lower,
    spend_upper: n.spend_upper,
    impressions_lower: n.impressions_lower,
    impressions_upper: n.impressions_upper,
    raw_data: n.raw_data,
    days_running: daysRunning,
    language: n.language ?? null,
    cta_text: n.cta_text ?? null,
    collation_count: n.collation_count ?? null,
    source_provider: n.source_provider ?? null,
    ...extra,
  }
  if (n.thumbnail_url) row.thumbnail_url = n.thumbnail_url
  if (n.creative_url) row.creative_url = n.creative_url
  return row
}

export async function upsertNormalizedAds(
  db: SupabaseDb,
  ads: NormalizedMetaAd[],
  extra?: Record<string, unknown>,
): Promise<string[]> {
  const rows = ads.map((n) => normalizedToRow(n, extra))
  const ingestedIds: string[] = []
  const BATCH_SIZE = 20
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data: upserted, error: upsertErr } = await db
      .from('briefing_source_items')
      .upsert(batch, { onConflict: 'source_type,external_id' })
      .select('id')
    if (!upsertErr && upserted) {
      for (const row of upserted) {
        if (row.id) ingestedIds.push(row.id)
      }
    }
  }
  return ingestedIds
}

export async function syncViaApify(params: {
  search_terms?: string
  page_ids?: string[]
  country?: string
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await scrapeViaApify({
    search_terms: params.search_terms,
    search_page_ids: params.page_ids,
    country: params.country ?? 'US',
    limit: params.limit,
  })
  return { ads: result.ads, provider: 'apify', errors: result.errors }
}

export async function syncViaBrowser(params: {
  search_terms?: string
  page_ids?: string[]
  country?: string
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await scrapeMetaAdsLibrary({
    search_terms: params.search_terms,
    search_page_ids: params.page_ids,
    country: params.country ?? 'US',
    limit: params.limit,
  })
  return { ads: result.ads, provider: 'browser', errors: result.errors }
}

export async function syncViaApi(params: {
  search_terms?: string
  page_ids?: string[]
  countries?: string[]
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await searchMetaAdLibrary({
    search_terms: params.search_terms?.trim(),
    search_page_ids: params.page_ids,
    ad_reached_countries: params.countries ?? ['US'],
    limit: Math.min(params.limit ?? 50, 100),
  })
  const ads = result.data.map((ad) => normalizeMetaAd(ad))
  return { ads, provider: 'api', errors: [] }
}

export { isApifyAvailable, isMetaAdLibraryAvailable }
export type { NormalizedMetaAd }
