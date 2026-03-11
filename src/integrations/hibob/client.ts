/**
 * HiBob API client for Heimdall.
 * Fetches employee details and time-off data to sync leave status into Monday.
 */

const HIBOB_API_URL = 'https://api.hibob.com/v1'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HibobEmployee {
  id: string
  firstName: string
  surname: string
  email: string
  displayName: string
}

export interface HibobTimeOffRequest {
  id: number
  employeeId: string
  policyType: string
  policyTypeDisplayName: string
  startDate: string
  endDate: string | null
  status: string
  requestRangeType?: string
  type?: string
}

export interface HibobOutToday {
  employeeId: string
  employeeDisplayName: string
  employeeEmail: string
  policyTypeDisplayName: string
  startDate: string
  endDate: string | null
  startDatePortion?: string
  endDatePortion?: string
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function getAuthHeader(): string | null {
  const id = process.env.HIBOB_SERVICE_USER_ID
  const token = process.env.HIBOB_API_TOKEN
  if (!id || !token) return null
  const encoded = Buffer.from(`${id}:${token}`).toString('base64')
  return `Basic ${encoded}`
}

// ---------------------------------------------------------------------------
// Fetch wrapper
// ---------------------------------------------------------------------------

const RETRY_ATTEMPTS = 3
const RETRY_BASE_MS = 2000

async function hibobFetch<T>(path: string): Promise<T | null> {
  const auth = getAuthHeader()
  if (!auth) return null

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(`${HIBOB_API_URL}${path}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: auth,
      },
    })

    if (res.status === 429 && attempt < RETRY_ATTEMPTS) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? Math.min(Number(retryAfter) * 1000, 30_000)
        : RETRY_BASE_MS * attempt
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    if (!res.ok) {
      lastError = new Error(`HiBob API error: ${res.status} ${res.statusText} — ${path}`)
      if (res.status === 404) return null
      throw lastError
    }

    return (await res.json()) as T
  }

  throw lastError ?? new Error('HiBob API: rate limited')
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function isConfigured(): boolean {
  return !!process.env.HIBOB_SERVICE_USER_ID && !!process.env.HIBOB_API_TOKEN
}

export async function getEmployee(employeeId: string): Promise<HibobEmployee | null> {
  const raw = await hibobFetch<Record<string, unknown>>(`/people/${encodeURIComponent(employeeId)}`)
  if (!raw) return null
  return {
    id: String(raw.id ?? employeeId),
    firstName: String(raw.firstName ?? ''),
    surname: String(raw.surname ?? ''),
    email: String(raw.email ?? ''),
    displayName: String(raw.displayName ?? `${raw.firstName ?? ''} ${raw.surname ?? ''}`.trim()),
  }
}

export async function getTimeOffRequest(
  employeeId: string,
  requestId: number | string,
): Promise<HibobTimeOffRequest | null> {
  return hibobFetch<HibobTimeOffRequest>(
    `/timeoff/employees/${encodeURIComponent(employeeId)}/requests/${requestId}`,
  )
}

export async function getWhoIsOutToday(): Promise<HibobOutToday[]> {
  const today = new Date().toISOString().slice(0, 10)
  const raw = await hibobFetch<{ outs?: HibobOutToday[] }>(
    `/timeoff/outtoday?from=${today}&to=${today}&includePrivate=true`,
  )
  return raw?.outs ?? []
}
