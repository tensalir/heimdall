import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { WorkingDocSectionsSchema } from '@/src/domain/briefingAssistant/schema'

export const dynamic = 'force-dynamic'

const CreateDraftBodySchema = z.object({
  name: z.string().min(1).max(500).optional(),
  sections: WorkingDocSectionsSchema.optional().default({}),
  source_item_ids: z.array(z.string()).optional().default([]),
  asset_ids: z.array(z.string()).optional().default([]),
  monday_board_id: z.string().nullable().optional(),
  monday_status: z.string().nullable().optional(),
  monday_assignee: z.string().nullable().optional(),
})

/**
 * GET /api/briefing-assistant/drafts — list drafts for current user (newest first).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data, error } = await db
    .from('briefing_drafts')
    .select(
      'id, name, sections, source_item_ids, asset_ids, monday_board_id, monday_status, monday_assignee, monday_item_id, created_at, updated_at',
    )
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ drafts: data ?? [] })
}

/**
 * POST /api/briefing-assistant/drafts — create draft.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const json = await req.json().catch(() => ({}))
  const parsed = CreateDraftBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  const body = parsed.data
  const now = new Date().toISOString()

  const { data, error } = await db
    .from('briefing_drafts')
    .insert({
      user_id: auth.user.id,
      name: body.name?.trim() || 'Untitled briefing',
      sections: body.sections,
      source_item_ids: body.source_item_ids,
      asset_ids: body.asset_ids,
      monday_board_id: body.monday_board_id ?? null,
      monday_status: body.monday_status ?? null,
      monday_assignee: body.monday_assignee ?? null,
      updated_at: now,
    })
    .select(
      'id, name, sections, source_item_ids, asset_ids, monday_board_id, monday_status, monday_assignee, monday_item_id, created_at, updated_at',
    )
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ draft: data })
}
