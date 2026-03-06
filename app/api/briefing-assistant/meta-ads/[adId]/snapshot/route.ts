import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { buildMetaAdSnapshotUrl } from '@/src/integrations/meta/client'

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
    .select('external_id')
    .eq('id', adId)
    .single()

  if (error || !item?.external_id) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  return NextResponse.redirect(buildMetaAdSnapshotUrl(item.external_id), 307)
}
