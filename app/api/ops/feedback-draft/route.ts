import { NextRequest, NextResponse } from 'next/server'
import { requireFeedbackReviewer } from '@/lib/route-auth'
import { saveDraft } from '@/src/services/opsFeedbackStore'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/ops/feedback-draft
 * Body: { item_id, board_id, draft }
 * Autosaves the user-edited summary draft inside Heimdall.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireFeedbackReviewer(req)
  if (auth.error) return auth.error

  let body: { item_id?: string; board_id?: string; draft?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { item_id, board_id, draft } = body
  if (!item_id || !board_id) {
    return NextResponse.json({ error: 'item_id and board_id are required' }, { status: 400 })
  }

  const ok = await saveDraft(item_id, board_id, draft ?? '')
  if (!ok) {
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
