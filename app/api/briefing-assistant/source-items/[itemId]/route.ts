import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/source-items/[itemId]
 * Returns a single source item for the Create Ads left panel.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { itemId } = await params
  if (!itemId) {
    return NextResponse.json({ error: 'itemId required' }, { status: 400 })
  }

  const { data: row, error } = await db
    .from('briefing_source_items')
    .select('id, source_type, title, preview, thumbnail_url, body_text, raw_data, created_at')
    .eq('id', itemId)
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  return NextResponse.json({
    item: {
      id: row.id,
      type: (row.source_type as string).replace('_', '-'),
      title: row.title,
      preview: row.preview ?? row.body_text ?? '',
      thumbnail_url: row.thumbnail_url,
      data: row.raw_data ?? {},
    },
  })
}
