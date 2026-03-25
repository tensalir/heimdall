import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { mondayGraphql } from '@/src/integrations/monday/client'

export const dynamic = 'force-dynamic'

function parseStatusLabels(settingsStr: string | null | undefined): Record<string, string> {
  if (!settingsStr) return {}
  try {
    const s = JSON.parse(settingsStr) as { labels?: Record<string, string> }
    return s.labels ?? {}
  } catch {
    return {}
  }
}

type RawBoard = {
  id: string
  name: string
  subscribers?: Array<{ id: string; name: string }>
  columns?: Array<{ id: string; title: string; type: string; settings_str: string | null }>
}

async function fetchBoardsFromMonday(ids: string[]): Promise<RawBoard[]> {
  if (!ids.length) return []

  const queryWithSubs = `
    query ($ids: [ID!]) {
      boards(ids: $ids) {
        id
        name
        subscribers { id name }
        columns { id title type settings_str }
      }
    }
  `
  const queryNoSubs = `
    query ($ids: [ID!]) {
      boards(ids: $ids) {
        id
        name
        columns { id title type settings_str }
      }
    }
  `

  let data: { boards: RawBoard[] } | null = null
  try {
    data = await mondayGraphql<{ boards: RawBoard[] }>(queryWithSubs, { ids })
  } catch {
    try {
      data = await mondayGraphql<{ boards: RawBoard[] }>(queryNoSubs, { ids })
    } catch {
      data = null
    }
  }

  return data?.boards ?? []
}

function pickStatusColumn(
  cols: Array<{ id: string; title: string; type: string; settings_str: string | null }>,
) {
  const statusCols = cols.filter((c) => c.type === 'status')
  if (!statusCols.length) return null
  const titled = statusCols.find((c) => c.title.toLowerCase().includes('status'))
  return titled ?? statusCols[0]
}

function pickPeopleColumn(
  cols: Array<{ id: string; title: string; type: string }>,
) {
  const peopleCols = cols.filter((c) => c.type === 'people' || c.type === 'person')
  return peopleCols[0] ?? null
}

/**
 * GET /api/briefing-assistant/monday-boards
 * Boards from sprint batches + MONDAY_BRIEFING_BOARD_ID, with Monday metadata.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const envBoard =
    process.env.MONDAY_BRIEFING_BOARD_ID?.trim() || process.env.MONDAY_BOARD_ID?.trim() || ''

  const { data: batchRows, error } = await db
    .from('briefing_sprint_batches')
    .select('monday_board_id')
    .not('monday_board_id', 'is', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const idSet = new Set<string>()
  if (envBoard) idSet.add(envBoard)
  for (const row of batchRows ?? []) {
    const id = (row as { monday_board_id: string | null }).monday_board_id?.trim()
    if (id) idSet.add(id)
  }

  const ids = [...idSet]
  const rawBoards = await fetchBoardsFromMonday(ids)

  const byId = new Map(rawBoards.map((b) => [b.id, b]))

  const boards = ids.map((id) => {
    const raw = byId.get(id)
    const columns = raw?.columns ?? []
    const statusCol = pickStatusColumn(columns)
    const peopleCol = pickPeopleColumn(columns)
    const labels = statusCol ? parseStatusLabels(statusCol.settings_str) : {}

    return {
      id,
      name: raw?.name?.trim() || `Board ${id}`,
      subscribers: (raw?.subscribers ?? []).map((s) => ({
        id: String(s.id),
        name: s.name ?? `User ${s.id}`,
      })),
      status_columns: statusCol
        ? [{ id: statusCol.id, title: statusCol.title, labels }]
        : [],
      people_columns: peopleCol ? [{ id: peopleCol.id, title: peopleCol.title }] : [],
      default_status_column_id: statusCol?.id ?? null,
      default_people_column_id: peopleCol?.id ?? null,
    }
  })

  return NextResponse.json({
    boards,
    default_board_id: envBoard || ids[0] || null,
  })
}
