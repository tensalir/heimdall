import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/forecast/runs/[runId]/cs-overrides
 * Body: { monthKey, studio_agency_json? }
 * Upserts forecast_cs_overrides for the run/month.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { runId } = await params
  if (!runId) {
    return NextResponse.json({ error: 'runId required' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const monthKey = body.monthKey as string
  if (!monthKey) {
    return NextResponse.json({ error: 'monthKey required' }, { status: 400 })
  }

  const update: Record<string, unknown> = {
    run_id: runId,
    month_key: monthKey,
    updated_at: new Date().toISOString(),
  }
  if (body.studio_agency_json !== undefined) update.studio_agency_json = body.studio_agency_json

  const { data, error } = await db
    .from('forecast_cs_overrides')
    .upsert(update, { onConflict: 'run_id,month_key' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
