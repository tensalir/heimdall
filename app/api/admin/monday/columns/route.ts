import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth'
import { mondayGraphql } from '@/src/integrations/monday/client'

/**
 * GET /api/admin/monday/columns?boardId=9147622374
 *
 * Returns column id, title, and type for the given Monday board.
 * Use this to find MONDAY_ASSETS_COLUMN_ID (e.g. the "Assets" column id).
 * Requires authenticated admin (Supabase session).
 */
export async function GET(request: Request) {
  const { supabase } = createSupabaseRouteClient(request)
  if (!supabase) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const boardId = searchParams.get('boardId')
  if (!boardId) {
    return NextResponse.json(
      { error: 'boardId query parameter is required' },
      { status: 400 }
    )
  }

  const data = await mondayGraphql<{
    boards?: Array<{
      columns?: Array<{ id: string; title: string; type: string }>
    }>
  }>(
    `query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns { id title type }
      }
    }`,
    { boardId: [boardId] }
  )

  const board = data?.boards?.[0]
  if (!board) {
    return NextResponse.json(
      { error: 'Board not found or no access', columns: [] },
      { status: 404 }
    )
  }

  const columns = board.columns ?? []
  return NextResponse.json({ columns })
}
