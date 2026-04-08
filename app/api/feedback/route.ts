import { NextResponse } from 'next/server'
import { requireUser, requireUserOrSheetsCookie } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export interface FeedbackEntryRow {
  id: string
  experiment_id: string
  role: 'strategy' | 'design' | 'copy'
  author: string
  content: string
  created_at: string
  updated_at: string
}

export interface FeedbackExperimentRow {
  id: string
  round_id: string
  monday_item_id: string
  experiment_name: string
  agency: string
  brief_link: string | null
  is_urgent: boolean
  figma_accessible: boolean
  sent_to_monday: boolean
  sent_at: string | null
  summary_cache: string | null
  created_at: string
  updated_at: string
  feedback_entries?: FeedbackEntryRow[]
}

/**
 * GET /api/feedback?round_id=...
 * Returns rounds list if no round_id; otherwise experiments + entries for that round, grouped by agency.
 */
export async function GET(request: Request) {
  const auth = await requireUserOrSheetsCookie(request)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const roundId = searchParams.get('round_id')

  if (!roundId) {
    const { data: rounds, error } = await db
      .from('feedback_rounds')
      .select('id, name, monday_board_id, created_at')
      .order('created_at', { ascending: false })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ rounds: rounds ?? [] })
  }

  const { data: experiments, error: expErr } = await db
    .from('feedback_experiments')
    .select('*')
    .eq('round_id', roundId)
    .order('experiment_name')
  if (expErr) {
    return NextResponse.json({ error: expErr.message }, { status: 500 })
  }

  const { data: entries, error: entErr } = await db
    .from('feedback_entries')
    .select('*')
    .in('experiment_id', (experiments ?? []).map((e) => e.id))
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 })
  }

  const entriesByExperiment = new Map<string, FeedbackEntryRow[]>()
  for (const e of entries ?? []) {
    const list = entriesByExperiment.get(e.experiment_id) ?? []
    list.push(e as FeedbackEntryRow)
    entriesByExperiment.set(e.experiment_id, list)
  }

  const withEntries = (experiments ?? []).map((exp) => ({
    ...exp,
    feedback_entries: entriesByExperiment.get(exp.id) ?? [],
  })) as FeedbackExperimentRow[]

  // Group by agency
  const byAgency = new Map<string, FeedbackExperimentRow[]>()
  for (const exp of withEntries) {
    const agency = exp.agency || 'Other'
    const list = byAgency.get(agency) ?? []
    list.push(exp)
    byAgency.set(agency, list)
  }

  return NextResponse.json({
    round_id: roundId,
    experiments: withEntries,
    by_agency: Object.fromEntries(byAgency),
  })
}

/**
 * POST /api/feedback
 * Creates or updates a feedback entry. Body: { experiment_id, role, content?, author? }
 */
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let body: { experiment_id?: string; role?: string; content?: string; author?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { experiment_id, role, content = '', author = '' } = body
  if (!experiment_id || !role) {
    return NextResponse.json({ error: 'experiment_id and role are required' }, { status: 400 })
  }
  const validRole = role === 'strategy' || role === 'design' || role === 'copy'
  if (!validRole) {
    return NextResponse.json({ error: 'role must be strategy, design, or copy' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data, error } = await db
    .from('feedback_entries')
    .upsert(
      {
        experiment_id,
        role,
        author: author.trim(),
        content: String(content).trim(),
        updated_at: now,
      },
      { onConflict: 'experiment_id,role' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}
