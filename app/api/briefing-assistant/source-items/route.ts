import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/source-items?limit=20&type=meta_ad
 * Returns recent source items across all types for the Create Ads source picker.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = auth.supabase

  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get('limit') || 20), 100)
  const sourceType = searchParams.get('type')?.trim() || null

  let query = db
    .from('briefing_source_items')
    .select('id, source_type, title, preview, body_text, thumbnail_url, raw_data, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (sourceType) query = query.eq('source_type', sourceType)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    type: (row.source_type as string).replace('_', '-') as string,
    title: row.title,
    preview: row.preview ?? '',
    body_text: row.body_text ?? null,
    thumbnail_url: row.thumbnail_url,
    data: row.raw_data ?? {},
  }))

  return NextResponse.json({ items })
}
