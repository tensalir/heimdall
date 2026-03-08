import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth'
import { getSupabase } from '@/lib/supabase'
import { mirrorMediaAsset } from '@/src/integrations/meta/mediaMirror'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/saved-items
 * List saved items for the authenticated user.
 * Query: board_id?, source_item_id? (check if specific ad is saved)
 */
export async function GET(req: NextRequest) {
  const { supabase } = createSupabaseRouteClient(req)
  if (!supabase) {
    return NextResponse.json({ items: [] })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ items: [] })
  }

  const { searchParams } = new URL(req.url)
  const boardId = searchParams.get('board_id')
  const sourceItemId = searchParams.get('source_item_id')

  let query = supabase
    .from('briefing_saved_items')
    .select('id, source_item_id, board_id, created_at')
    .eq('user_id', user.id)

  if (boardId) query = query.eq('board_id', boardId)
  if (sourceItemId) query = query.eq('source_item_id', sourceItemId)

  query = query.order('created_at', { ascending: false }).limit(200)

  const { data: items, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ items: items ?? [] })
}

/**
 * POST /api/briefing-assistant/saved-items
 * Save an ad to a board (or unsorted). Triggers CDN mirror in background.
 * Body: { source_item_id: string, board_id?: string }
 */
export async function POST(req: NextRequest) {
  const { supabase } = createSupabaseRouteClient(req)
  if (!supabase) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { source_item_id, board_id } = body as { source_item_id?: string; board_id?: string }

  if (!source_item_id) {
    return NextResponse.json({ error: 'source_item_id is required' }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    user_id: user.id,
    source_item_id,
  }
  if (board_id) row.board_id = board_id

  const { data: saved, error } = await supabase
    .from('briefing_saved_items')
    .upsert(row, { onConflict: 'user_id,source_item_id' })
    .select('id, source_item_id, board_id, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  triggerMirror(source_item_id).catch(() => {})

  return NextResponse.json({ ok: true, item: saved })
}

/**
 * DELETE /api/briefing-assistant/saved-items
 * Remove a saved item.
 * Body: { source_item_id: string, board_id?: string }
 */
export async function DELETE(req: NextRequest) {
  const { supabase } = createSupabaseRouteClient(req)
  if (!supabase) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 401 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { source_item_id } = body as { source_item_id?: string }

  if (!source_item_id) {
    return NextResponse.json({ error: 'source_item_id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('briefing_saved_items')
    .delete()
    .eq('user_id', user.id)
    .eq('source_item_id', source_item_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

async function triggerMirror(sourceItemId: string) {
  const db = getSupabase()
  if (!db) return

  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, thumbnail_url, creative_url, media_type, link_url')
    .eq('id', sourceItemId)
    .single()

  if (!item) return

  const thumbUrl = item.thumbnail_url as string | null
  if (thumbUrl && !thumbUrl.includes('supabase')) {
    const mirrored = await mirrorMediaAsset(db, thumbUrl, item.id, 'thumb')
    if (mirrored) {
      await db.from('briefing_source_items').update({ thumbnail_url: mirrored }).eq('id', item.id)
    }
  }

  if ((item.media_type as string) === 'video') {
    const videoUrl = item.creative_url as string | null
    if (videoUrl && !videoUrl.includes('supabase')) {
      const mirrored = await mirrorMediaAsset(db, videoUrl, item.id, 'video')
      if (mirrored) {
        await db.from('briefing_source_items').update({ creative_url: mirrored }).eq('id', item.id)
      }
    }
  }
}
