/**
 * Daily reconciliation between HiBob "who's out today" and the Monday board.
 *
 * 1. Fetches today's absences from HiBob.
 * 2. Fetches all items from the Monday board.
 * 3. Sets anyone currently out to the correct leave status.
 * 4. Clears anyone who was on leave but is no longer out.
 */

import { getEnv } from '../config/env.js'
import { logger } from '../../lib/logger.js'
import {
  getWhoIsOutToday,
  isConfigured as isHibobConfigured,
  type HibobOutToday,
} from '../integrations/hibob/client.js'
import {
  mondayGraphql,
  updateMultipleColumnValues,
} from '../integrations/monday/client.js'
import { policyTypeToStatus } from '../api/webhooks/hibob.js'

interface SyncReport {
  synced: boolean
  outToday: number
  updated: number
  cleared: number
  errors: number
  message?: string
}

// Status labels that indicate someone is currently on leave in Monday
const LEAVE_STATUSES = new Set(['On Leave', 'Sick', 'WFH'])
const AVAILABLE_STATUS = 'Available'

// Monday board reader types
interface BoardRawItem {
  id: string
  name: string
  column_values: Array<{ id: string; text: string | null }>
}
interface BoardPageSlice {
  cursor: string | null
  items: BoardRawItem[]
}
interface BoardFirstPage {
  boards?: Array<{ items_page: BoardPageSlice }>
}
interface BoardNextPage {
  next_items_page?: BoardPageSlice
}

const FIRST_PAGE_QUERY = `query ($boardId: ID!) {
  boards(ids: [$boardId]) {
    items_page(limit: 100) {
      cursor
      items { id name column_values { id text } }
    }
  }
}`

const NEXT_PAGE_QUERY = `query ($cursor: String!) {
  next_items_page(cursor: $cursor, limit: 100) {
    cursor
    items { id name column_values { id text } }
  }
}`

/**
 * Fetch all board items with their email and status column values.
 */
async function fetchBoardItems(
  boardId: string,
  emailColId: string,
  statusColId: string,
): Promise<Array<{ id: string; name: string; email: string; status: string }>> {
  const items: Array<{ id: string; name: string; email: string; status: string }> = []
  let cursor: string | null = null

  for (let page = 0; page < 20; page++) {
    let slice: BoardPageSlice | undefined

    if (cursor) {
      const nextData: BoardNextPage | null = await mondayGraphql<BoardNextPage>(NEXT_PAGE_QUERY, { cursor })
      slice = nextData?.next_items_page
    } else {
      const firstData: BoardFirstPage | null = await mondayGraphql<BoardFirstPage>(FIRST_PAGE_QUERY, { boardId })
      slice = firstData?.boards?.[0]?.items_page
    }

    if (!slice?.items?.length) break

    for (const item of slice.items) {
      const emailVal = item.column_values.find((c) => c.id === emailColId)?.text ?? ''
      const statusVal = item.column_values.find((c) => c.id === statusColId)?.text ?? ''
      if (emailVal) {
        items.push({ id: item.id, name: item.name, email: emailVal.toLowerCase().trim(), status: statusVal })
      }
    }

    cursor = slice.cursor ?? null
    if (!cursor) break
  }

  return items
}

export async function syncLeaveStatusFromHibob(): Promise<SyncReport> {
  const env = getEnv()
  const boardId = env.MONDAY_HIBOB_BOARD_ID
  const emailColId = env.MONDAY_HIBOB_EMAIL_COLUMN_ID
  const statusColId = env.MONDAY_HIBOB_STATUS_COLUMN_ID

  if (!boardId || !emailColId || !statusColId) {
    return { synced: false, outToday: 0, updated: 0, cleared: 0, errors: 0, message: 'Not configured' }
  }
  if (!isHibobConfigured()) {
    return { synced: false, outToday: 0, updated: 0, cleared: 0, errors: 0, message: 'HiBob API not configured' }
  }

  const timer = logger.time('integration', 'HiBob daily leave sync')

  const [outToday, boardItems] = await Promise.all([
    getWhoIsOutToday(),
    fetchBoardItems(boardId, emailColId, statusColId),
  ])

  const outEmails = new Map<string, HibobOutToday>()
  for (const entry of outToday) {
    if (entry.employeeEmail) {
      outEmails.set(entry.employeeEmail.toLowerCase().trim(), entry)
    }
  }

  let updated = 0
  let cleared = 0
  let errors = 0

  for (const item of boardItems) {
    try {
      const outEntry = outEmails.get(item.email)

      if (outEntry) {
        const expectedStatus = policyTypeToStatus(outEntry.policyTypeDisplayName)
        if (item.status !== expectedStatus) {
          const colVals: Record<string, unknown> = {
            [statusColId]: { label: expectedStatus },
          }
          if (env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID) {
            colVals[env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID] = outEntry.policyTypeDisplayName
          }
          if (env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID && outEntry.startDate) {
            colVals[env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID] = { date: outEntry.startDate }
          }
          if (env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID && outEntry.endDate) {
            colVals[env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID] = { date: outEntry.endDate }
          }

          await updateMultipleColumnValues(boardId, item.id, colVals)
          updated++
        }
      } else if (LEAVE_STATUSES.has(item.status)) {
        // Person was on leave in Monday but is NOT out in HiBob today → clear
        const colVals: Record<string, unknown> = {
          [statusColId]: { label: AVAILABLE_STATUS },
        }
        if (env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID) {
          colVals[env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID] = ''
        }
        if (env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID) {
          colVals[env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID] = {}
        }
        if (env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID) {
          colVals[env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID] = {}
        }

        await updateMultipleColumnValues(boardId, item.id, colVals)
        cleared++
      }
    } catch (err) {
      errors++
      logger.error('integration', 'Failed to sync leave status for item', err, {
        mondayItemId: item.id,
        email: item.email,
      })
    }
  }

  timer.done({ outToday: outToday.length, boardItems: boardItems.length, updated, cleared, errors })

  return { synced: true, outToday: outToday.length, updated, cleared, errors }
}
