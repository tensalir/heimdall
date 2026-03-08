import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import {
  getSharedBrowser,
  dismissOverlays,
  isLoginWall,
  refreshSnapshotUrl,
  waitForPoolSlot,
  incrementActiveTabs,
  decrementActiveTabs,
  buildMetaPreviewPlaceholderSvg,
} from '@/src/integrations/meta/preview'

export const dynamic = 'force-dynamic'

const ATLAS_CACHE_TTL_MS = 1000 * 60 * 60
const atlasCache = new Map<string, { buffer: Buffer; mimeType: string; expiresAt: number }>()

/**
 * GET /api/briefing-assistant/meta-ads/[adId]/atlas
 *
 * Renders the full Meta ad snapshot page via headless browser and returns
 * a high-quality PNG screenshot. Used by the Atlas browser panel/modal
 * to show the ad exactly as it appears on the Meta Ads Library.
 *
 * Query params:
 *   width  — viewport width (default 600, max 1400)
 *   height — viewport height (default 900, max 2000)
 *   fresh  — skip cache when 'true'
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const auth = await requireUser(req); if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return new NextResponse(buildMetaPreviewPlaceholderSvg('Meta ad'), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  const { adId } = await params
  const { searchParams } = new URL(req.url)
  const viewWidth = Math.min(Number(searchParams.get('width') || 600), 1400)
  const viewHeight = Math.min(Number(searchParams.get('height') || 900), 2000)
  const skipCache = searchParams.get('fresh') === 'true'

  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, external_id, page_name, title, link_url')
    .eq('id', adId)
    .single()

  const label = item?.page_name ?? item?.title ?? 'Meta ad'
  const snapshotUrl = refreshSnapshotUrl(item?.link_url ?? null, item?.external_id)
  if (!snapshotUrl) {
    return new NextResponse(buildMetaPreviewPlaceholderSvg(label), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  const cacheKey = `atlas:${adId}:${viewWidth}x${viewHeight}`
  if (!skipCache) {
    const cached = atlasCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return new NextResponse(cached.buffer, {
        headers: {
          'Content-Type': cached.mimeType,
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
          'X-Atlas-Cache': 'hit',
        },
      })
    }
  }

  try {
    await waitForPoolSlot()
    incrementActiveTabs()
    try {
      const browser = await getSharedBrowser()
      const page = await browser.newPage()
      try {
        await page.setViewport({ width: viewWidth, height: viewHeight, deviceScaleFactor: 2 })
        await page.goto(snapshotUrl, { waitUntil: 'networkidle2', timeout: 50000 })
        await new Promise((r) => setTimeout(r, 3000))
        await dismissOverlays(page)
        await new Promise((r) => setTimeout(r, 500))

        if (await isLoginWall(page)) {
          return new NextResponse(buildMetaPreviewPlaceholderSvg(label + ' (login required)'), {
            headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
          })
        }

        const buffer = (await page.screenshot({
          type: 'png',
          fullPage: false,
        })) as Buffer

        atlasCache.set(cacheKey, {
          buffer,
          mimeType: 'image/png',
          expiresAt: Date.now() + ATLAS_CACHE_TTL_MS,
        })

        if (atlasCache.size > 50) {
          const oldest = atlasCache.keys().next().value as string
          atlasCache.delete(oldest)
        }

        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=3600, s-maxage=3600',
            'X-Atlas-Cache': 'miss',
          },
        })
      } finally {
        await page.close()
      }
    } finally {
      decrementActiveTabs()
    }
  } catch {
    return new NextResponse(buildMetaPreviewPlaceholderSvg(label), {
      headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
    })
  }
}
