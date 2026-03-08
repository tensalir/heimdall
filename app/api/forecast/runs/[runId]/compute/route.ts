import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import { computeFcOutput, computeCsOutput } from '@/src/domain/forecast/parityEngine'
import type { ForecastUseCaseRow, ForecastFcOverride } from '@/src/domain/forecast/schema'
import type { CsDetailRow } from '@/src/domain/forecast/parityEngine'

export const dynamic = 'force-dynamic'

const STUDIO_AGENCY_NAMES = [
  'Studio N',
  'Studio L',
  '5pm',
  'Studio N repurpose',
  'Monks',
  'Gain',
  'Viscap',
  'Loop Legends',
  'Reiterations',
  'Localisations',
  'KH',
  'Reactive',
  'TOTAL',
]

/**
 * GET /api/forecast/runs/[runId]/compute?monthKey=May26
 * Returns FC and CS computed outputs for the run and month. Uses stored overrides when present.
 */
export async function GET(
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
  const { searchParams } = new URL(req.url ?? '', 'http://localhost')
  const monthKey = searchParams.get('monthKey') ?? ''

  if (!runId || !monthKey) {
    return NextResponse.json({ error: 'runId and monthKey required' }, { status: 400 })
  }

  const [rowsRes, fcOverrideRes, detailRowsRes] = await Promise.all([
    db
      .from('forecast_use_case_rows')
      .select('*')
      .eq('run_id', runId)
      .order('row_index', { ascending: true }),
    db
      .from('forecast_fc_overrides')
      .select('*')
      .eq('run_id', runId)
      .eq('month_key', monthKey)
      .maybeSingle(),
    db
      .from('forecast_cs_detail_rows')
      .select('*')
      .eq('run_id', runId)
      .eq('month_key', monthKey)
      .order('row_index', { ascending: true }),
  ])

  if (rowsRes.error) {
    return NextResponse.json({ error: rowsRes.error.message }, { status: 500 })
  }

  const useCaseRows: ForecastUseCaseRow[] = (rowsRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    run_id: r.run_id as string,
    row_index: r.row_index as number,
    year_num: r.year_num as number | null,
    month_date: r.month_date as string | null,
    use_case: r.use_case as string,
    graph_spent: r.graph_spent as number | null,
    graph_revenue: r.graph_revenue as number | null,
    roas: r.roas as number | null,
    results_spent: r.results_spent as number | null,
    spent_pct_total: r.spent_pct_total as number | null,
    forecasted_spent: r.forecasted_spent as number | null,
    forecasted_revenue: r.forecasted_revenue as number | null,
    raw_json: r.raw_json as Record<string, unknown> | null,
    created_at: r.created_at as string,
  }))

  const fcOverride: ForecastFcOverride | null = fcOverrideRes.data
    ? {
        id: (fcOverrideRes.data as Record<string, unknown>).id as string,
        run_id: (fcOverrideRes.data as Record<string, unknown>).run_id as string,
        month_key: (fcOverrideRes.data as Record<string, unknown>).month_key as string,
        total_ads_needed: (fcOverrideRes.data as Record<string, unknown>).total_ads_needed as number | null,
        adspend_target_global: (fcOverrideRes.data as Record<string, unknown>).adspend_target_global as number | null,
        adspend_target_expansion: (fcOverrideRes.data as Record<string, unknown>).adspend_target_expansion as number | null,
        creative_budget_pct: (fcOverrideRes.data as Record<string, unknown>).creative_budget_pct as number | null,
        channel_mix_json: (fcOverrideRes.data as Record<string, unknown>).channel_mix_json as ForecastFcOverride['channel_mix_json'],
        use_case_boost_json: (fcOverrideRes.data as Record<string, unknown>).use_case_boost_json as Record<string, number> | null,
        asset_mix_json: (fcOverrideRes.data as Record<string, unknown>).asset_mix_json as ForecastFcOverride['asset_mix_json'],
        funnel_json: (fcOverrideRes.data as Record<string, unknown>).funnel_json as ForecastFcOverride['funnel_json'],
        asset_type_json: (fcOverrideRes.data as Record<string, unknown>).asset_type_json as ForecastFcOverride['asset_type_json'],
        asset_production_json: (fcOverrideRes.data as Record<string, unknown>).asset_production_json as Record<string, unknown> | null,
        created_at: (fcOverrideRes.data as Record<string, unknown>).created_at as string,
        updated_at: (fcOverrideRes.data as Record<string, unknown>).updated_at as string,
      }
    : null

  const detailRows: CsDetailRow[] = (detailRowsRes.data ?? []).map((d: Record<string, unknown>) => ({
    siobhanRef: String(d.siobhan_ref ?? ''),
    contentBucket: String(d.content_bucket ?? ''),
    static: Number(d.static_count ?? 0),
    video: Number(d.video_count ?? 0),
    carousel: Number(d.carousel_count ?? 0),
    ideationStarter: String(d.ideation_starter ?? ''),
    experimentName: String(d.experiment_name ?? ''),
    notes: String(d.notes ?? ''),
    typeUseCase: String(d.type_use_case ?? ''),
    briefOwner: String(d.brief_owner ?? ''),
    studioAgency: String(d.studio_agency ?? ''),
    agencyRef: String(d.agency_ref ?? ''),
    numAssets: Number(d.num_assets ?? 0),
  }))

  const fc = computeFcOutput(monthKey, useCaseRows, {
    fcOverride,
  })

  const cs = computeCsOutput(fc, {
    studioAgencyNames: STUDIO_AGENCY_NAMES,
    detailRows,
  })

  return NextResponse.json({ fc, cs })
}
