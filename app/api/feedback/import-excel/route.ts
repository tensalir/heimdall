import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const AGENCY_HEADERS = new Set(['GAIN', 'MONKS', 'STATIQ', 'GOODO', 'STUDIO', 'OTHER'])
const SKIP_SHEET_NAMES = /TEMPLATE|duplicate/i

function isAgencyHeader(val: unknown): boolean {
  const s = typeof val === 'string' ? val.trim().toUpperCase() : ''
  return AGENCY_HEADERS.has(s) || (s.length <= 12 && /^[A-Z\s]+$/.test(s))
}

function isHeaderRow(cells: unknown[]): boolean {
  const a = String(cells[0] ?? '').toUpperCase()
  const b = String(cells[3] ?? '').toUpperCase()
  return a.includes('BRIEF') || b.includes('STRATEGY') || b.includes('FEEDBACK')
}

function isEmptyRow(cells: unknown[]): boolean {
  return cells.every((c) => c == null || String(c).trim() === '')
}

function isFigmaUrl(val: unknown): boolean {
  const s = String(val ?? '').trim()
  return s.includes('figma.com') || s.startsWith('http')
}

interface ParsedExperiment {
  agency: string
  brief_link: string | null
  is_urgent: boolean
  experiment_name: string
  strategy: string
  design: string
  copy: string
}

function parseSheet(sheet: XLSX.WorkSheet, sheetName: string): ParsedExperiment[] {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    header: 1,
    defval: null,
    raw: false,
  }) as unknown[][]

  const out: ParsedExperiment[] = []
  let currentAgency = 'Other'

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? []
    const cells = [
      row[0],
      row[1],
      row[2],
      row[3],
      row[4],
      row[5],
    ]

    if (isEmptyRow(cells)) continue

    const col1 = String(cells[0] ?? '').trim()
    const col3 = String(cells[2] ?? '').trim()
    const col4 = String(cells[3] ?? '').trim()
    const col5 = String(cells[4] ?? '').trim()
    const col6 = String(cells[5] ?? '').trim()

    if (isAgencyHeader(col1) && !isFigmaUrl(col1)) {
      currentAgency = col1 || currentAgency
      continue
    }
    if (r <= 2 && isHeaderRow(cells)) continue

    const hasFeedback = col4 || col5 || col6
    const hasLinkOrName = col1 && (isFigmaUrl(col1) || col1.length > 2)
    if (!hasFeedback && !hasLinkOrName) continue

    const briefLink = isFigmaUrl(col1) ? col1 : null
    const experimentName = col1 && !isFigmaUrl(col1) ? col1 : briefLink ? `Experiment ${r + 1}` : `Row ${r + 1}`
    const urgent = /yes|true|1/i.test(col3)

    out.push({
      agency: currentAgency,
      brief_link: briefLink || null,
      is_urgent: urgent,
      experiment_name: experimentName,
      strategy: col4,
      design: col5,
      copy: col6,
    })
  }

  return out
}

/**
 * POST /api/feedback/import-excel
 * Body: multipart/form-data with file = Excel file, and optional roundId (to add to existing round) or roundName (new round name).
 * Parses the workbook: each sheet becomes a round (or all go into one round if roundId provided). Creates experiments and feedback entries.
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
  const roundIdParam = formData.get('roundId') as string | null
  const roundNameParam = formData.get('roundName') as string | null

  if (!file?.size) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: 'buffer', cellDates: true })
  } catch (e) {
    return NextResponse.json({ error: 'Invalid Excel file' }, { status: 400 })
  }

  const sheetNames = workbook.SheetNames.filter((n) => !SKIP_SHEET_NAMES.test(n))
  if (sheetNames.length === 0) {
    return NextResponse.json({ error: 'No importable sheets found' }, { status: 400 })
  }

  const allExperiments: { sheetName: string; experiments: ParsedExperiment[] }[] = []
  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const experiments = parseSheet(sheet, name)
    if (experiments.length) allExperiments.push({ sheetName: name, experiments })
  }

  const createdRoundIds: string[] = []
  let totalExperiments = 0
  const usedRoundId = roundIdParam?.trim() || null

  for (const { sheetName, experiments } of allExperiments) {
    let roundId: string

    if (usedRoundId) {
      roundId = usedRoundId
    } else {
      const name = roundNameParam?.trim() || sheetName
      const { data: round, error: roundErr } = await db
        .from('feedback_rounds')
        .insert({ name, monday_board_id: '' })
        .select('id')
        .single()
      if (roundErr || !round?.id) {
        return NextResponse.json({ error: 'Failed to create round' }, { status: 500 })
      }
      roundId = round.id
      createdRoundIds.push(roundId)
    }

    for (let i = 0; i < experiments.length; i++) {
      const exp = experiments[i]
      const monday_item_id = `import-${roundId.slice(0, 8)}-${i}-${Date.now()}`
      const { data: inserted, error: expErr } = await db
        .from('feedback_experiments')
        .insert({
          round_id: roundId,
          monday_item_id,
          experiment_name: exp.experiment_name,
          agency: exp.agency,
          brief_link: exp.brief_link,
          is_urgent: exp.is_urgent,
        })
        .select('id')
        .single()

      if (expErr || !inserted?.id) continue
      totalExperiments++

      const entries: Array<{ experiment_id: string; role: 'strategy' | 'design' | 'copy'; content: string }> = []
      if (exp.strategy) entries.push({ experiment_id: inserted.id, role: 'strategy', content: exp.strategy })
      if (exp.design) entries.push({ experiment_id: inserted.id, role: 'design', content: exp.design })
      if (exp.copy) entries.push({ experiment_id: inserted.id, role: 'copy', content: exp.copy })
      if (entries.length) {
        await db.from('feedback_entries').insert(entries)
      }
    }
  }

  const firstRoundId = createdRoundIds[0] ?? usedRoundId
  return NextResponse.json({
    ok: true,
    roundsCreated: createdRoundIds.length,
    totalExperiments,
    roundId: firstRoundId,
  })
}
