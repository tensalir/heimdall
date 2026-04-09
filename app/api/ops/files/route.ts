import { NextResponse } from 'next/server'
import { getProjectFiles } from '@/src/integrations/figma/restClient'
import { getSupabase } from '@/lib/supabase'
import { getKanbanLane } from '@/components/ops/StatusPill'
import {
  createBoard,
  getBoardByMondayId,
} from '@/src/services/opsBoardStore'

const FIGMA_PROJECT_ID = '387033831'
const MONDAY_BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'

function extractBatchCanonical(fileName: string): string | null {
  const match = fileName.match(/^([A-Z]+)\s+(\d{4})\s*-/i)
  if (!match) return null

  const MONTHS: Record<string, string> = {
    JANUARY: '01', FEBRUARY: '02', MARCH: '03', APRIL: '04',
    MAY: '05', JUNE: '06', JULY: '07', AUGUST: '08',
    SEPTEMBER: '09', OCTOBER: '10', NOVEMBER: '11', DECEMBER: '12',
  }
  const month = MONTHS[match[1].toUpperCase()]
  if (!month) return null
  return `${match[2]}-${month}`
}

export async function GET() {
  const files = await getProjectFiles(FIGMA_PROJECT_ID)

  // Auto-seed the ops_boards row if it doesn't exist yet
  const existing = await getBoardByMondayId(MONDAY_BOARD_ID)
  if (!existing) {
    await createBoard({
      mondayBoardId: MONDAY_BOARD_ID,
      boardName: 'Paid Social - Studio',
      figmaProjectId: FIGMA_PROJECT_ID,
      figmaProjectName: 'Performance Ads',
    })
  }

  // Fetch batch-level counts from ops_board_items
  const db = getSupabase()
  let batchCounts: Record<string, { upcoming: number; ready: number; imported: number; exported: number; failed: number }> = {}

  if (db) {
    const { data: items } = await db
      .from('ops_board_items')
      .select('batch_canonical, monday_status, pipeline_status')
      .eq('monday_board_id', MONDAY_BOARD_ID)

    if (items) {
      for (const item of items) {
        const bc = item.batch_canonical
        if (!bc) continue
        if (!batchCounts[bc]) batchCounts[bc] = { upcoming: 0, ready: 0, imported: 0, exported: 0, failed: 0 }
        const lane = getKanbanLane(item.monday_status, item.pipeline_status)
        if (lane === 'upcoming') batchCounts[bc].upcoming++
        else if (lane === 'ready_for_figma') batchCounts[bc].ready++
        else if (lane === 'imported') batchCounts[bc].imported++
        else if (lane === 'exported') batchCounts[bc].exported++
        if (item.pipeline_status === 'failed') batchCounts[bc].failed++
      }
    }
  }

  const enrichedFiles = files.map(f => {
    const batchCanonical = extractBatchCanonical(f.name)
    const counts = batchCanonical ? batchCounts[batchCanonical] : undefined
    return {
      key: f.key,
      name: f.name,
      last_modified: f.last_modified ?? null,
      thumbnail_url: f.thumbnail_url ?? null,
      batch_canonical: batchCanonical,
      counts: counts ?? { upcoming: 0, ready: 0, imported: 0, exported: 0, failed: 0 },
    }
  })

  // Sort by batch canonical descending (newest first), then by name for non-batch files
  enrichedFiles.sort((a, b) => {
    if (a.batch_canonical && b.batch_canonical) return b.batch_canonical.localeCompare(a.batch_canonical)
    if (a.batch_canonical) return -1
    if (b.batch_canonical) return 1
    return a.name.localeCompare(b.name)
  })

  return NextResponse.json({
    projectId: FIGMA_PROJECT_ID,
    mondayBoardId: MONDAY_BOARD_ID,
    files: enrichedFiles,
  })
}
