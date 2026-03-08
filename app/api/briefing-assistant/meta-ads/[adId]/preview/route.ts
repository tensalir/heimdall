import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { isValidMediaUrl } from '@/lib/media-utils'
import {
  buildMetaPreviewPlaceholderSvg,
  getMetaAdPreviewPng,
  extractMediaFromSnapshot,
} from '@/src/integrations/meta/preview'
import { mirrorMediaAsset } from '@/src/integrations/meta/mediaMirror'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const db = getSupabase()
  if (!db) {
    return new NextResponse(buildMetaPreviewPlaceholderSvg('Meta ad'), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  const { adId } = await params
  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, external_id, page_name, title, link_url, thumbnail_url')
    .eq('id', adId)
    .single()

  const label = item?.page_name ?? item?.title ?? 'Meta ad'
  if (!item?.external_id) {
    return new NextResponse(buildMetaPreviewPlaceholderSvg(label), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
  }

  if (item.link_url && !isValidMediaUrl(item.thumbnail_url)) {
    selfHealMedia(db, item.id, item.link_url).catch((e) =>
      console.error(`[preview-self-heal] ${item.id}:`, e instanceof Error ? e.message : e),
    )
  }

  try {
    const { buffer, mimeType } = await getMetaAdPreviewPng(
      item.external_id,
      item.id,
      item.link_url,
    )
    const cacheControl =
      process.env.NODE_ENV === 'production'
        ? 'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400'
        : 'no-store'
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': cacheControl,
      },
    })
  } catch {
    return new NextResponse(buildMetaPreviewPlaceholderSvg(label), {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-store',
      },
    })
  }
}

async function selfHealMedia(
  db: NonNullable<ReturnType<typeof getSupabase>>,
  itemId: string,
  linkUrl: string,
) {
  const media = await extractMediaFromSnapshot(linkUrl)
  if (!media?.thumbnailUrl) return

  const mirrored = await mirrorMediaAsset(db, media.thumbnailUrl, itemId, 'thumb')
  const thumbUrl = mirrored ?? media.thumbnailUrl

  const update: Record<string, string> = {
    thumbnail_url: thumbUrl,
    media_type: media.type,
  }

  if (media.videoUrl) {
    update.source_video_url = media.videoUrl
  }

  await db
    .from('briefing_source_items')
    .update(update)
    .eq('id', itemId)

  console.log(`[preview-self-heal] Healed poster for ${itemId}: ${media.type}, thumb=${thumbUrl.substring(0, 60)}...`)
}
