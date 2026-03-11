/**
 * HiBob time-off webhook handler.
 *
 * Receives HiBob Webhooks V2 events for time-off requests,
 * enriches them via the HiBob API, and updates the corresponding
 * Monday board item with the employee's leave status.
 *
 * Handled events: approved, cancelled, declined, deleted, updated, setEndDate
 * Ignored events: submitted (pending approval — no board change yet)
 */

import { getEnv } from '../../config/env.js'
import { logger } from '../../../lib/logger.js'
import {
  getEmployee,
  getTimeOffRequest,
  isConfigured as isHibobConfigured,
} from '../../integrations/hibob/client.js'
import {
  findItemsByColumnValue,
  updateMultipleColumnValues,
} from '../../integrations/monday/client.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HibobWebhookV2Payload {
  companyId?: number
  type: string
  triggeredBy?: string
  triggeredAt?: string
  version?: string
  data?: {
    employeeId?: string
    requestId?: number | string
    [key: string]: unknown
  }
}

interface SyncResult {
  received: boolean
  action?: 'updated' | 'cleared' | 'skipped' | 'error'
  employee?: string
  message?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Status mapping
// ---------------------------------------------------------------------------

const LEAVE_STATUS_MAP: Record<string, string> = {
  sick: 'Sick',
  holiday: 'On Leave',
  vacation: 'On Leave',
  'time off': 'On Leave',
  'paid leave': 'On Leave',
  'annual leave': 'On Leave',
  'personal leave': 'On Leave',
  'compassionate leave': 'On Leave',
  'parental leave': 'On Leave',
  'unpaid leave': 'On Leave',
  'working from home': 'WFH',
  wfh: 'WFH',
}

const DEFAULT_LEAVE_STATUS = 'On Leave'
const AVAILABLE_STATUS = 'Available'

/**
 * Map a HiBob policy type display name to a Monday status label.
 */
export function policyTypeToStatus(policyType: string): string {
  const key = policyType.toLowerCase().trim()
  return LEAVE_STATUS_MAP[key] ?? DEFAULT_LEAVE_STATUS
}

// Events that mean "this person is (or will be) on leave"
const ACTIVE_LEAVE_EVENTS = new Set([
  'timeoff.request.approved',
])

// Events that mean "this leave is no longer happening"
const CLEAR_LEAVE_EVENTS = new Set([
  'timeoff.request.cancelled',
  'timeoff.request.declined',
  'timeoff.request.deleted',
])

// Events where we re-evaluate the leave (might change dates/type)
const UPDATE_LEAVE_EVENTS = new Set([
  'timeoff.request.updated',
  'timeoff.request.setEndDate',
])

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

export async function verifyHibobWebhookSecret(url: URL): Promise<boolean> {
  const expected = getEnv().HIBOB_WEBHOOK_SECRET
  if (!expected) return true
  const provided = url.searchParams.get('secret')
  if (!provided) return false
  if (expected.length !== provided.length) return false
  try {
    const crypto = await import('node:crypto')
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleHibobTimeOffWebhook(body: HibobWebhookV2Payload): Promise<SyncResult> {
  const env = getEnv()
  const boardId = env.MONDAY_HIBOB_BOARD_ID
  const emailColId = env.MONDAY_HIBOB_EMAIL_COLUMN_ID
  const statusColId = env.MONDAY_HIBOB_STATUS_COLUMN_ID

  if (!boardId || !emailColId || !statusColId) {
    logger.warn('webhook', 'HiBob sync not configured — missing MONDAY_HIBOB_* env vars')
    return { received: true, action: 'skipped', message: 'Not configured' }
  }

  if (!isHibobConfigured()) {
    logger.warn('webhook', 'HiBob API credentials not configured')
    return { received: true, action: 'skipped', message: 'HiBob API not configured' }
  }

  const eventType = body.type
  const employeeId = body.data?.employeeId
  const requestId = body.data?.requestId

  if (!employeeId) {
    logger.warn('webhook', 'HiBob webhook missing employeeId', { eventType })
    return { received: true, action: 'skipped', message: 'Missing employeeId' }
  }

  logger.info('webhook', 'HiBob time-off webhook received', {
    eventType,
    employeeId,
    requestId: requestId != null ? String(requestId) : undefined,
  })

  // ---- Fetch employee email (join key) ----
  const employee = await getEmployee(employeeId)
  if (!employee?.email) {
    logger.warn('webhook', 'Could not resolve employee email', { employeeId })
    return { received: true, action: 'error', error: 'Employee not found or has no email' }
  }

  // ---- Find the matching Monday item ----
  const items = await findItemsByColumnValue(boardId, emailColId, employee.email)
  if (items.length === 0) {
    logger.info('webhook', 'No Monday item found for employee', {
      email: employee.email,
      employeeId,
    })
    return { received: true, action: 'skipped', employee: employee.displayName, message: 'No matching Monday item' }
  }

  // ---- Determine what to do based on event type ----

  if (CLEAR_LEAVE_EVENTS.has(eventType)) {
    return await clearLeaveStatus(boardId, statusColId, items, employee, env)
  }

  if (ACTIVE_LEAVE_EVENTS.has(eventType) || UPDATE_LEAVE_EVENTS.has(eventType)) {
    return await setLeaveStatus(boardId, statusColId, items, employee, employeeId, requestId, env)
  }

  // Ignore events we don't act on (e.g. submitted = still pending approval)
  logger.info('webhook', 'HiBob event ignored (no action)', { eventType, employeeId })
  return { received: true, action: 'skipped', employee: employee.displayName, message: `Event ${eventType} ignored` }
}

// ---------------------------------------------------------------------------
// Status writers
// ---------------------------------------------------------------------------

async function setLeaveStatus(
  boardId: string,
  statusColId: string,
  items: Array<{ id: string; name: string }>,
  employee: { email: string; displayName: string },
  employeeId: string,
  requestId: number | string | undefined,
  env: ReturnType<typeof getEnv>,
): Promise<SyncResult> {
  let policyType = 'Time Off'
  let startDate: string | null = null
  let endDate: string | null = null

  if (requestId != null) {
    const request = await getTimeOffRequest(employeeId, requestId)
    if (request) {
      policyType = request.policyTypeDisplayName || request.policyType || policyType
      startDate = request.startDate ?? null
      endDate = request.endDate ?? null
    }
  }

  const statusLabel = policyTypeToStatus(policyType)

  for (const item of items) {
    const columnValues: Record<string, unknown> = {
      [statusColId]: { label: statusLabel },
    }

    if (env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID) {
      columnValues[env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID] = policyType
    }
    if (env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID && startDate) {
      columnValues[env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID] = { date: startDate }
    }
    if (env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID && endDate) {
      columnValues[env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID] = { date: endDate }
    }

    const ok = await updateMultipleColumnValues(boardId, item.id, columnValues)
    logger.info('webhook', ok ? 'Monday item updated with leave status' : 'Failed to update Monday item', {
      mondayItemId: item.id,
      mondayItemName: item.name,
      email: employee.email,
      status: statusLabel,
      policyType,
    })
  }

  return {
    received: true,
    action: 'updated',
    employee: employee.displayName,
    message: `Set to "${statusLabel}" (${policyType})`,
  }
}

async function clearLeaveStatus(
  boardId: string,
  statusColId: string,
  items: Array<{ id: string; name: string }>,
  employee: { email: string; displayName: string },
  env: ReturnType<typeof getEnv>,
): Promise<SyncResult> {
  for (const item of items) {
    const columnValues: Record<string, unknown> = {
      [statusColId]: { label: AVAILABLE_STATUS },
    }

    if (env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID) {
      columnValues[env.MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID] = ''
    }
    if (env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID) {
      columnValues[env.MONDAY_HIBOB_LEAVE_START_COLUMN_ID] = {}
    }
    if (env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID) {
      columnValues[env.MONDAY_HIBOB_LEAVE_END_COLUMN_ID] = {}
    }

    const ok = await updateMultipleColumnValues(boardId, item.id, columnValues)
    logger.info('webhook', ok ? 'Monday item cleared to Available' : 'Failed to clear Monday item', {
      mondayItemId: item.id,
      email: employee.email,
    })
  }

  return {
    received: true,
    action: 'cleared',
    employee: employee.displayName,
    message: `Set to "${AVAILABLE_STATUS}"`,
  }
}
