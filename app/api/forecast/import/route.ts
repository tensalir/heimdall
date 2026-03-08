import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import { parseUseCaseDataSheet } from '@/src/domain/forecast/parseUseCaseData'

export const dynamic = 'force-dynamic'

/**
 * POST /api/forecast/import
 * Body: multipart/form-data with file = .xlsx workbook.
 * Parses "Use Case Data" sheet, normalizes rows, creates forecast_runs + forecast_use_case_rows.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const runNameParam = formData.get('runName') as string | null

  if (!file?.size) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch {
    return NextResponse.json({ error: 'Invalid Excel file' }, { status: 400 })
  }

  const { rows, sheetNames, monthKeys } = parseUseCaseDataSheet(workbook)
  if (rows.length === 0) {
    return NextResponse.json({ error: 'No Use Case Data rows found. Ensure sheet "Use Case Data" exists and has data from row 3.' }, { status: 400 })
  }

  const runName = runNameParam?.trim() || file.name || `Upload ${new Date().toISOString().slice(0, 16)}`
  const { data: run, error: runErr } = await db
    .from('forecast_runs')
    .insert({
      name: runName,
      workbook_filename: file.name,
      sheet_names: sheetNames,
      month_keys: monthKeys,
    })
    .select('id, name, sheet_names, month_keys')
    .single()

  if (runErr || !run?.id) {
    return NextResponse.json({ error: runErr?.message ?? 'Failed to create forecast run' }, { status: 500 })
  }

  const insertRows = rows.map((r, i) => ({
    run_id: run.id,
    row_index: i,
    year_num: r.year_num,
    month_date: r.month_date || null,
    use_case: r.use_case,
    graph_spent: r.graph_spent,
    graph_revenue: r.graph_revenue,
    roas: r.roas,
    results_spent: r.results_spent,
    spent_pct_total: r.spent_pct_total,
    forecasted_spent: r.forecasted_spent,
    forecasted_revenue: r.forecasted_revenue ?? null,
    raw_json: null,
  }))

  const { error: rowsErr } = await db.from('forecast_use_case_rows').insert(insertRows)
  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    runId: run.id,
    runName: run.name,
    monthKeys: run.month_keys ?? monthKeys,
    sheetNames: run.sheet_names ?? sheetNames,
    useCaseRowCount: rows.length,
  })
}
