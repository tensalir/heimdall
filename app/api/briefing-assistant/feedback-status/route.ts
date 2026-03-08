import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  monday_item_ids: z.array(z.string()).max(200),
})

/**
 * POST /api/briefing-assistant/feedback-status
 * Body: { monday_item_ids: string[] }
 * Returns a map of monday_item_id -> { hasExperiment, roles, sentToMonday } for query-time feedback badge.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { monday_item_ids: ids } = parsed.data
  if (ids.length === 0) {
    return NextResponse.json({ statusByItem: {} })
  }

  const { data: experiments } = await db
    .from('feedback_experiments')
    .select('id, monday_item_id, sent_to_monday')
    .in('monday_item_id', ids)

  if (!experiments?.length) {
    const statusByItem: Record<string, { hasExperiment: boolean; roles: string[]; sentToMonday: boolean }> = {}
    for (const id of ids) statusByItem[id] = { hasExperiment: false, roles: [], sentToMonday: false }
    return NextResponse.json({ statusByItem })
  }

  const expIds = experiments.map((e) => e.id)
  const { data: entries } = await db
    .from('feedback_entries')
    .select('experiment_id, role')
    .in('experiment_id', expIds)

  const rolesByExpId = new Map<string, string[]>()
  for (const e of entries ?? []) {
    const list = rolesByExpId.get(e.experiment_id) ?? []
    if (!list.includes(e.role)) list.push(e.role)
    rolesByExpId.set(e.experiment_id, list)
  }

  const statusByItem: Record<string, { hasExperiment: boolean; roles: string[]; sentToMonday: boolean }> = {}
  for (const id of ids) {
    statusByItem[id] = { hasExperiment: false, roles: [], sentToMonday: false }
  }
  for (const exp of experiments) {
    const roles = rolesByExpId.get(exp.id) ?? []
    statusByItem[exp.monday_item_id] = {
      hasExperiment: true,
      roles,
      sentToMonday: exp.sent_to_monday ?? false,
    }
  }

  return NextResponse.json({ statusByItem })
}
