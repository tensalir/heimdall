import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  policyTypeToStatus,
  handleHibobTimeOffWebhook,
  type HibobWebhookV2Payload,
} from './hibob.js'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../config/env.js', () => ({
  getEnv: () => ({
    MONDAY_HIBOB_BOARD_ID: 'board_123',
    MONDAY_HIBOB_EMAIL_COLUMN_ID: 'email_col',
    MONDAY_HIBOB_STATUS_COLUMN_ID: 'status_col',
    MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID: 'type_col',
    MONDAY_HIBOB_LEAVE_START_COLUMN_ID: 'start_col',
    MONDAY_HIBOB_LEAVE_END_COLUMN_ID: 'end_col',
  }),
}))

vi.mock('../../../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    time: vi.fn(() => ({ done: vi.fn() })),
  },
}))

const mockGetEmployee = vi.fn()
const mockGetTimeOffRequest = vi.fn()
const mockIsConfigured = vi.fn(() => true)

vi.mock('../../integrations/hibob/client.js', () => ({
  getEmployee: (...args: unknown[]) => mockGetEmployee(...args),
  getTimeOffRequest: (...args: unknown[]) => mockGetTimeOffRequest(...args),
  isConfigured: () => mockIsConfigured(),
}))

const mockFindItems = vi.fn()
const mockUpdateColumns = vi.fn()

vi.mock('../../integrations/monday/client.js', () => ({
  findItemsByColumnValue: (...args: unknown[]) => mockFindItems(...args),
  updateMultipleColumnValues: (...args: unknown[]) => mockUpdateColumns(...args),
}))

// ---------------------------------------------------------------------------
// policyTypeToStatus mapping
// ---------------------------------------------------------------------------

describe('policyTypeToStatus', () => {
  it('maps "Sick" to Sick', () => {
    expect(policyTypeToStatus('Sick')).toBe('Sick')
  })

  it('maps "sick" case-insensitively', () => {
    expect(policyTypeToStatus('SICK')).toBe('Sick')
    expect(policyTypeToStatus('Sick')).toBe('Sick')
  })

  it('maps vacation/holiday variants to On Leave', () => {
    expect(policyTypeToStatus('Holiday')).toBe('On Leave')
    expect(policyTypeToStatus('Vacation')).toBe('On Leave')
    expect(policyTypeToStatus('Annual Leave')).toBe('On Leave')
    expect(policyTypeToStatus('Paid Leave')).toBe('On Leave')
  })

  it('maps parental/compassionate to On Leave', () => {
    expect(policyTypeToStatus('Parental Leave')).toBe('On Leave')
    expect(policyTypeToStatus('Compassionate Leave')).toBe('On Leave')
  })

  it('maps WFH to WFH', () => {
    expect(policyTypeToStatus('Working From Home')).toBe('WFH')
    expect(policyTypeToStatus('WFH')).toBe('WFH')
  })

  it('defaults unknown types to On Leave', () => {
    expect(policyTypeToStatus('Custom PTO')).toBe('On Leave')
    expect(policyTypeToStatus('Mental Health Day')).toBe('On Leave')
  })
})

// ---------------------------------------------------------------------------
// handleHibobTimeOffWebhook
// ---------------------------------------------------------------------------

describe('handleHibobTimeOffWebhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsConfigured.mockReturnValue(true)
    mockUpdateColumns.mockResolvedValue(true)
  })

  function payload(overrides: Partial<HibobWebhookV2Payload> = {}): HibobWebhookV2Payload {
    return {
      companyId: 1,
      type: 'timeoff.request.approved',
      triggeredBy: 'system',
      triggeredAt: '2026-03-11T08:00:00Z',
      version: 'v2',
      data: { employeeId: 'emp_1', requestId: 42 },
      ...overrides,
    }
  }

  // ---- Approved (Sick) ----

  it('sets Sick status on approved sick leave', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'alice@loop.com', displayName: 'Alice' })
    mockGetTimeOffRequest.mockResolvedValue({
      id: 42,
      employeeId: 'emp_1',
      policyType: 'Sick',
      policyTypeDisplayName: 'Sick',
      startDate: '2026-03-11',
      endDate: '2026-03-12',
      status: 'approved',
    })
    mockFindItems.mockResolvedValue([{ id: 'item_1', name: 'Alice' }])

    const result = await handleHibobTimeOffWebhook(payload())

    expect(result.action).toBe('updated')
    expect(result.message).toContain('Sick')

    expect(mockUpdateColumns).toHaveBeenCalledWith('board_123', 'item_1', {
      status_col: { label: 'Sick' },
      type_col: 'Sick',
      start_col: { date: '2026-03-11' },
      end_col: { date: '2026-03-12' },
    })
  })

  // ---- Approved (Vacation) ----

  it('sets On Leave status on approved vacation', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'bob@loop.com', displayName: 'Bob' })
    mockGetTimeOffRequest.mockResolvedValue({
      id: 42,
      employeeId: 'emp_1',
      policyType: 'Holiday',
      policyTypeDisplayName: 'Holiday',
      startDate: '2026-04-01',
      endDate: '2026-04-05',
      status: 'approved',
    })
    mockFindItems.mockResolvedValue([{ id: 'item_2', name: 'Bob' }])

    const result = await handleHibobTimeOffWebhook(payload())

    expect(result.action).toBe('updated')
    expect(mockUpdateColumns).toHaveBeenCalledWith('board_123', 'item_2', {
      status_col: { label: 'On Leave' },
      type_col: 'Holiday',
      start_col: { date: '2026-04-01' },
      end_col: { date: '2026-04-05' },
    })
  })

  // ---- Cancelled ----

  it('clears status to Available on cancelled leave', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'carol@loop.com', displayName: 'Carol' })
    mockFindItems.mockResolvedValue([{ id: 'item_3', name: 'Carol' }])

    const result = await handleHibobTimeOffWebhook(
      payload({ type: 'timeoff.request.cancelled' }),
    )

    expect(result.action).toBe('cleared')
    expect(result.message).toContain('Available')

    expect(mockUpdateColumns).toHaveBeenCalledWith('board_123', 'item_3', {
      status_col: { label: 'Available' },
      type_col: '',
      start_col: {},
      end_col: {},
    })
  })

  // ---- Declined ----

  it('clears status on declined leave', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'dave@loop.com', displayName: 'Dave' })
    mockFindItems.mockResolvedValue([{ id: 'item_4', name: 'Dave' }])

    const result = await handleHibobTimeOffWebhook(
      payload({ type: 'timeoff.request.declined' }),
    )

    expect(result.action).toBe('cleared')
  })

  // ---- Deleted ----

  it('clears status on deleted leave', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'eve@loop.com', displayName: 'Eve' })
    mockFindItems.mockResolvedValue([{ id: 'item_5', name: 'Eve' }])

    const result = await handleHibobTimeOffWebhook(
      payload({ type: 'timeoff.request.deleted' }),
    )

    expect(result.action).toBe('cleared')
  })

  // ---- Submitted (ignored — still pending) ----

  it('ignores submitted events (pending approval)', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'frank@loop.com', displayName: 'Frank' })
    mockFindItems.mockResolvedValue([{ id: 'item_6', name: 'Frank' }])

    const result = await handleHibobTimeOffWebhook(
      payload({ type: 'timeoff.request.submitted' }),
    )

    expect(result.action).toBe('skipped')
    expect(mockUpdateColumns).not.toHaveBeenCalled()
  })

  // ---- Updated ----

  it('re-evaluates leave on updated event', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'grace@loop.com', displayName: 'Grace' })
    mockGetTimeOffRequest.mockResolvedValue({
      id: 42,
      employeeId: 'emp_1',
      policyType: 'Vacation',
      policyTypeDisplayName: 'Vacation',
      startDate: '2026-03-20',
      endDate: '2026-03-25',
      status: 'approved',
    })
    mockFindItems.mockResolvedValue([{ id: 'item_7', name: 'Grace' }])

    const result = await handleHibobTimeOffWebhook(
      payload({ type: 'timeoff.request.updated' }),
    )

    expect(result.action).toBe('updated')
    expect(mockUpdateColumns).toHaveBeenCalledWith('board_123', 'item_7', expect.objectContaining({
      status_col: { label: 'On Leave' },
    }))
  })

  // ---- No matching Monday item ----

  it('skips gracefully when no Monday item matches', async () => {
    mockGetEmployee.mockResolvedValue({ id: 'emp_1', email: 'unknown@loop.com', displayName: 'Unknown' })
    mockFindItems.mockResolvedValue([])

    const result = await handleHibobTimeOffWebhook(payload())

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('No matching Monday item')
    expect(mockUpdateColumns).not.toHaveBeenCalled()
  })

  // ---- Missing employeeId ----

  it('skips when payload has no employeeId', async () => {
    const result = await handleHibobTimeOffWebhook(
      payload({ data: {} }),
    )

    expect(result.action).toBe('skipped')
    expect(result.message).toContain('Missing employeeId')
  })
})
