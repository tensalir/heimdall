import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/forecast/runs/[runId]/fc-overrides
 * Body: { monthKey, total_ads_needed?, adspend_target_global?, adspend_target_expansion?,
 *         creative_budget_pct?, channel_mix_json?, use_case_boost_json?, asset_mix_json?,
 *         funnel_json?, asset_type_json?, asset_production_json? }
 * Upserts forecast_fc_overrides for the run/month.
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
  if (body.total_ads_needed !== undefined) update.total_ads_needed = body.total_ads_needed
  if (body.adspend_target_global !== undefined) update.adspend_target_global = body.adspend_target_global
  if (body.adspend_target_expansion !== undefined) update.adspend_target_expansion = body.adspend_target_expansion
  if (body.creative_budget_pct !== undefined) update.creative_budget_pct = body.creative_budget_pct
  if (body.channel_mix_json !== undefined) update.channel_mix_json = body.channel_mix_json
  if (body.use_case_boost_json !== undefined) update.use_case_boost_json = body.use_case_boost_json
  if (body.asset_mix_json !== undefined) update.asset_mix_json = body.asset_mix_json
  if (body.funnel_json !== undefined) update.funnel_json = body.funnel_json
  if (body.asset_type_json !== undefined) update.asset_type_json = body.asset_type_json
  if (body.asset_production_json !== undefined) update.asset_production_json = body.asset_production_json

  const { data, error } = await db
    .from('forecast_fc_overrides')
    .upsert(update, { onConflict: 'run_id,month_key' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
