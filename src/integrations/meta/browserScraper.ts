/**
 * Browser-based Meta Ads Library scraper.
 *
 * Navigates the public Meta Ads Library search page via Puppeteer,
 * extracts ad cards from the rendered DOM, and returns the same
 * NormalizedMetaAd shape used by the Graph API client so both
 * providers can feed the same ingestion pipeline.
 */

import type { NormalizedMetaAd, MediaTier } from './client.js'
import {
  getSharedBrowser,
  dismissOverlays,
  waitForPoolSlot,
  incrementActiveTabs,
  decrementActiveTabs,
} from './preview.js'

const SCRAPE_TIMEOUT_MS = 60_000
const SCROLL_PAUSE_MS = 1500
const MAX_SCROLL_ROUNDS = 15

export interface BrowserScrapeParams {
  search_terms?: string
  search_page_ids?: string[]
  country?: string
  ad_active_status?: 'ACTIVE' | 'INACTIVE' | 'ALL'
  limit?: number
}

export interface BrowserScrapeResult {
  ads: NormalizedMetaAd[]
  provider: 'browser'
  scraped: number
  errors: string[]
}

function getDefaultRegion(): string {
  return process.env.META_ADS_DEFAULT_REGION || 'US'
}

function buildLibraryUrl(params: BrowserScrapeParams): string {
  const url = new URL('https://www.facebook.com/ads/library/')
  url.searchParams.set('active_status', params.ad_active_status?.toLowerCase() ?? 'all')
  url.searchParams.set('ad_type', 'all')
  url.searchParams.set('country', params.country ?? getDefaultRegion())
  url.searchParams.set('media_type', 'all')

  if (params.search_page_ids?.length) {
    url.searchParams.set('view_all_page_id', params.search_page_ids[0])
    url.searchParams.set('search_type', 'page')
  } else if (params.search_terms) {
    url.searchParams.set('q', params.search_terms)
    url.searchParams.set('search_type', 'keyword_unordered')
  }

  return url.toString()
}

interface RawScrapedAd {
  adId: string | null
  pageName: string
  pageId: string | null
  bodyText: string | null
  startedAt: string | null
  isActive: boolean
  snapshotUrl: string | null
  thumbnailSrc: string | null
  hasVideo: boolean
  platforms: string[]
}

/**
 * Scrape ads from the Meta Ads Library using headless Puppeteer.
 * Reuses the shared browser pool from preview.ts.
 */
export async function scrapeMetaAdsLibrary(
  params: BrowserScrapeParams,
): Promise<BrowserScrapeResult> {
  const errors: string[] = []
  const limit = Math.min(params.limit ?? 50, 200)

  const libraryUrl = buildLibraryUrl(params)

  await waitForPoolSlot()
  incrementActiveTabs()
  try {
    const browser = await getSharedBrowser()
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
      await page.goto(libraryUrl, { waitUntil: 'networkidle2', timeout: SCRAPE_TIMEOUT_MS })
      await new Promise((r) => setTimeout(r, 3000))
      await dismissOverlays(page)
      await new Promise((r) => setTimeout(r, 1000))

      let previousCount = 0
      for (let round = 0; round < MAX_SCROLL_ROUNDS; round++) {
        const currentCount = await page.evaluate(
          () => document.querySelectorAll('[class*="xrvj5dj"], div[role="article"], div._7jyg').length,
        )
        if (currentCount >= limit || currentCount === previousCount) break
        previousCount = currentCount
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await new Promise((r) => setTimeout(r, SCROLL_PAUSE_MS))
      }

      const rawAds = await page.evaluate((maxAds: number) => {
        const results: RawScrapedAd[] = []
        const seen = new Set<string>()

        const cards = document.querySelectorAll(
          '[class*="xrvj5dj"], div[role="article"], div._7jyg',
        )

        for (const card of Array.from(cards)) {
          if (results.length >= maxAds) break

          const links = Array.from(card.querySelectorAll('a[href*="/ads/library/?id="]'))
          let adId: string | null = null
          let snapshotUrl: string | null = null
          for (const link of links) {
            const href = (link as HTMLAnchorElement).href || ''
            const match = href.match(/[?&]id=(\d+)/)
            if (match) {
              adId = match[1]
              snapshotUrl = href
              break
            }
          }

          if (!adId) {
            const allLinks = Array.from(card.querySelectorAll('a[href]'))
            for (const link of allLinks) {
              const href = (link as HTMLAnchorElement).href || ''
              const match = href.match(/\/ads\/library\/\?id=(\d+)/) ||
                href.match(/ads_archive.*[?&]id=(\d+)/)
              if (match) {
                adId = match[1]
                snapshotUrl = href
                break
              }
            }
          }

          if (adId && seen.has(adId)) continue
          if (adId) seen.add(adId)

          const textEls = card.querySelectorAll('span, div')
          let bodyText: string | null = null
          let pageName = 'Unknown'
          const textContents: string[] = []
          for (const el of Array.from(textEls)) {
            const t = (el.textContent || '').trim()
            if (t.length > 5 && t.length < 2000) textContents.push(t)
          }

          const headings = card.querySelectorAll('strong, [class*="x1lliihq"], h4, h3')
          if (headings.length > 0) {
            pageName = (headings[0].textContent || '').trim() || 'Unknown'
          }

          if (textContents.length > 1) {
            const longestNonTitle = textContents
              .filter((t) => t !== pageName && t.length > 20)
              .sort((a, b) => b.length - a.length)
            bodyText = longestNonTitle[0] ?? null
          }

          let startedLabel: string | null = null
          for (const t of textContents) {
            const dateMatch = t.match(/Started running on (.+)/i) || t.match(/(\w+ \d+, \d{4})/i)
            if (dateMatch) {
              startedLabel = dateMatch[1]
              break
            }
          }

          const isActive = textContents.some((t) => /\bactive\b/i.test(t))

          const imgs = Array.from(card.querySelectorAll('img'))
          const cdnImgs = imgs.filter((img) => {
            const src = img.src || ''
            return /scontent|fbcdn|\.fbsbx\.com/i.test(src) && src.startsWith('http')
          })
          const thumbnailSrc = cdnImgs.length > 0
            ? cdnImgs.sort((a, b) => {
                const ar = a.getBoundingClientRect()
                const br = b.getBoundingClientRect()
                return (br.width * br.height) - (ar.width * ar.height)
              })[0].src
            : null

          const hasVideo = card.querySelectorAll('video, [class*="video"], svg[class*="play"]').length > 0

          const platformIcons = card.querySelectorAll('[aria-label*="Facebook"], [aria-label*="Instagram"], [aria-label*="Messenger"]')
          const platforms: string[] = []
          for (const icon of Array.from(platformIcons)) {
            const label = icon.getAttribute('aria-label') || ''
            if (label) platforms.push(label.toLowerCase())
          }

          let pageId: string | null = null
          const pageLinks = Array.from(card.querySelectorAll('a[href*="facebook.com/"]'))
          for (const link of pageLinks) {
            const href = (link as HTMLAnchorElement).href || ''
            const numericMatch = href.match(/facebook\.com\/(\d{5,})/)
            if (numericMatch) {
              pageId = numericMatch[1]
              break
            }
            const vanityMatch = href.match(/facebook\.com\/([a-zA-Z0-9._-]{2,})(?:\/|$|\?)/)
            if (vanityMatch && !['ads', 'pages', 'groups', 'events', 'marketplace', 'watch', 'gaming', 'stories'].includes(vanityMatch[1].toLowerCase())) {
              pageId = vanityMatch[1]
              break
            }
          }

          results.push({
            adId,
            pageName,
            pageId,
            bodyText,
            startedAt: startedLabel,
            isActive,
            snapshotUrl,
            thumbnailSrc,
            hasVideo,
            platforms,
          })
        }

        return results
      }, limit)

      const ads: NormalizedMetaAd[] = rawAds.map((raw: RawScrapedAd) => {
        let startedAt: string | null = null
        if (raw.startedAt) {
          try {
            const d = new Date(raw.startedAt)
            if (!isNaN(d.getTime())) startedAt = d.toISOString()
          } catch { /* ignore */ }
        }

        const tier: MediaTier = 'poster_only'

        return {
          external_id: raw.adId ?? `browser_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          page_id: raw.pageId,
          title: raw.pageName,
          preview: raw.bodyText?.slice(0, 200) ?? '',
          page_name: raw.pageName,
          body_text: raw.bodyText,
          link_url: raw.snapshotUrl,
          thumbnail_url: raw.thumbnailSrc,
          creative_url: null,
          media_type: raw.hasVideo ? 'video' : 'image',
          media_tier: tier,
          platform: raw.platforms.length > 0 ? raw.platforms.join(', ') : 'meta',
          is_active: raw.isActive,
          started_at: startedAt,
          ended_at: null,
          spend_lower: null,
          spend_upper: null,
          impressions_lower: null,
          impressions_upper: null,
          raw_data: { _source: 'browser_scrape', ...raw },
        }
      })

      return {
        ads,
        provider: 'browser',
        scraped: ads.length,
        errors,
      }
    } finally {
      await page.close()
    }
  } catch (e) {
    errors.push(`Scrape failed: ${e instanceof Error ? e.message : String(e)}`)
    return { ads: [], provider: 'browser', scraped: 0, errors }
  } finally {
    decrementActiveTabs()
  }
}
