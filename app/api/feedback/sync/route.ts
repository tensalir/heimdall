import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import type { ExternalLinkRef } from '@/src/contracts/integrations'
import { buildLockKey } from '@/src/services/integrationExecutionGuard'
import { readMondayBoardItemsWithMeta } from '@/src/services/mondayBoardReader'
import { recordIntegrationCall } from '@/src/services/integrationTelemetry'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? ''

/** Extract Figma or generic link from column values (brief link column). Returns contract shape or null. */
function extractBriefLink(columnValues: Array<{ id: string; title?: string; text?: string; value?: string }>): ExternalLinkRef | null {
  for (const col of columnValues) {
    const title = (col.title ?? '').toLowerCase()
    const text = (col.text ?? '').trim()
    if (title.includes('brief') || title.includes('link') || title.includes('figma') || title.includes('design') || title.includes('url')) {
      if (text && (text.includes('figma.com') || text.startsWith('http'))) return { url: text, label: title || undefined }
      if (col.value) {
        try {
          const parsed = JSON.parse(col.value) as Record<string, unknown>
          const url = parsed?.url ?? parsed?.text
          if (typeof url === 'string' && (url.includes('figma.com') || url.startsWith('http'))) return { url, label: title || undefined }
        } catch {
          // ignore
        }
      }
    }
    if (text.includes('figma.com')) return { url: text, label: undefined }
  }
  return null
}

/** Map Monday group title to agency name (normalize for display). */
function groupToAgency(groupTitle: string): string {
  const t = groupTitle.trim()
  if (!t) return 'Other'
  const known = ['Gain', 'Monks', 'Statiq', 'Goodo', 'Studio']
  const lower = t.toLowerCase()
  const match = known.find((k) => k.toLowerCase() === lower)
  return match ?? t
}

/**
 * POST /api/feedback/sync
 * Fetches items from the Monday board and upserts feedback_experiments.
 * Body: { roundId?: string, roundName?: string } — if roundId omitted, creates/uses a round for the board.
 * Uses tool-scoped lock key for future KV-based locking: buildLockKey('feedback', 'sync', boardId).
 */
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  if (!BOARD_ID) {
    return NextResponse.json({ error: 'MONDAY_BOARD_ID not configured' }, { status: 500 })
  }

  const _syncLockKey = buildLockKey('feedback', 'sync', BOARD_ID)
  const syncStart = Date.now()

  let body: { roundId?: string; roundName?: string } = {}
  try {
    body = await request.json().catch(() => ({}))
  } catch {
    // optional body
  }

  const { items: allItems, boardFound } = await readMondayBoardItemsWithMeta(BOARD_ID)
  if (!boardFound) {
    return NextResponse.json({ error: 'Board not found or no access', synced: 0 }, { status: 404 })
  }

  // Resolve or create round
  let roundId = body.roundId
  if (!roundId) {
    const roundName = body.roundName ?? `Board ${BOARD_ID}`
    const { data: existing } = await db
      .from('feedback_rounds')
      .select('id')
      .eq('monday_board_id', BOARD_ID)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (existing?.id) {
      roundId = existing.id
    } else {
      const { data: inserted, error: insertErr } = await db
        .from('feedback_rounds')
        .insert({ name: roundName, monday_board_id: BOARD_ID })
        .select('id')
        .single()
      if (insertErr || !inserted?.id) {
        return NextResponse.json({ error: 'Failed to create round', synced: 0 }, { status: 500 })
      }
      roundId = inserted.id
    }
  }

  let upserted = 0
  for (const item of allItems) {
    const agency = groupToAgency(item.group?.title ?? '')
    const briefLink = extractBriefLink(item.column_values)
    const { error } = await db
      .from('feedback_experiments')
      .upsert(
        {
          round_id: roundId,
          monday_item_id: item.id,
          experiment_name: item.name,
          agency,
          brief_link: briefLink?.url ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'round_id,monday_item_id' }
      )
    if (!error) upserted++
  }

  recordIntegrationCall({
    tool: 'feedback',
    provider: 'monday',
    operation: 'sync_board',
    durationMs: Date.now() - syncStart,
    outcome: 'ok',
    resourceId: BOARD_ID,
  })
  return NextResponse.json({ ok: true, synced: upserted, roundId, totalItems: allItems.length })
}
