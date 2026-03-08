import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const DEFAULT_SHEET_NAME = 'Creative Strategy & Design Feedback'

/**
 * POST /api/feedback/rounds
 * Create a round (sheet) for manual feedback. Body: { name?: string }.
 * monday_board_id is set to '' for manual rounds; can be updated later if syncing from Monday.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let body: { name?: string } = {}
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    // optional body
  }

  const name = (body.name ?? DEFAULT_SHEET_NAME).trim() || DEFAULT_SHEET_NAME
  const { data, error } = await db
    .from('feedback_rounds')
    .insert({
      name,
      monday_board_id: '',
    })
    .select('id, name, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
