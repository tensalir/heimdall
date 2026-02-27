import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getBoardByMondayId } from '@/src/services/opsBoardStore'

const MONDAY_BOARD_ID = '9147622374'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ batchKey: string }> }
) {
  const { batchKey } = await params
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const board = await getBoardByMondayId(MONDAY_BOARD_ID)

  const { data: items, error } = await db
    .from('ops_board_items')
    .select('*')
    .eq('monday_board_id', MONDAY_BOARD_ID)
    .eq('batch_canonical', batchKey)
    .order('updated_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    batchKey,
    board: board ?? null,
    items: items ?? [],
  })
}
