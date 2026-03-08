import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/boards
 * List boards for the authenticated user.
 */
export async function GET(req: NextRequest) {
  const { supabase } = createSupabaseRouteClient(req)
  if (!supabase) {
    return NextResponse.json({ boards: [] })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ boards: [] })
  }

  const { data: boards, error } = await supabase
    .from('user_ad_boards')
    .select('id, name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ boards: boards ?? [] })
}

/**
 * POST /api/briefing-assistant/boards
 * Create a new board for the authenticated user.
 * Body: { name: string }
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
  const name = (body as { name?: string }).name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Board name is required' }, { status: 400 })
  }

  const { data: board, error } = await supabase
    .from('user_ad_boards')
    .insert({ user_id: user.id, name })
    .select('id, name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A board with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ board })
}
