import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { adId } = await params
  const { data: item, error } = await db
    .from('briefing_source_items')
    .select('link_url, external_id')
    .eq('id', adId)
    .single()

  if (error || !item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  if (item.link_url) {
    return NextResponse.redirect(item.link_url, 307)
  }

  if (!item.external_id) {
    return NextResponse.json({ error: 'No snapshot URL available' }, { status: 404 })
  }

  const fallbackUrl = `https://www.facebook.com/ads/library/?id=${encodeURIComponent(item.external_id)}`
  return NextResponse.redirect(fallbackUrl, 307)
}
