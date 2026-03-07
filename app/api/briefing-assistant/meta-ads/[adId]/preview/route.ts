import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import {
  buildMetaPreviewPlaceholderSvg,
  getMetaAdPreviewPng,
} from '@/src/integrations/meta/preview'

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
    .select('id, external_id, page_name, title, link_url')
    .eq('id', adId)
    .single()

  const label = item?.page_name ?? item?.title ?? 'Meta ad'
  if (!item?.external_id) {
    return new NextResponse(buildMetaPreviewPlaceholderSvg(label), {
      headers: { 'Content-Type': 'image/svg+xml' },
    })
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
