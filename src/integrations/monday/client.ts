/**
 * Monday.com API client for Heimdall.
 * Webhook payload types and optional GraphQL for item/column fetch.
 */

const MONDAY_API_URL = 'https://api.monday.com/v2'

export interface MondayColumnValue {
  id: string
  title?: string
  text?: string
  value?: string
  type?: string
}

/** Image/file attachment extracted from Monday file columns or item assets. */
export interface MondayImageAttachment {
  url: string
  name: string
  /** Asset ID in Monday (for deduplication) */
  assetId?: string
  /** Source: which column or 'doc' */
  source: string
}

export interface MondayItem {
  id: string
  name: string
  created_at?: string
  column_values?: MondayColumnValue[]
  /** File assets attached to the item (from file columns, updates, etc.) */
  assets?: Array<{
    id: string
    name: string
    url?: string
    public_url?: string
    file_extension?: string
    file_size?: number
  }>
}

function getMondayToken(): string | null {
  return process.env.MONDAY_API_TOKEN ?? null
}

const MONDAY_RETRY_ATTEMPTS = 3
const MONDAY_RETRY_BASE_MS = 2000

/**
 * Run GraphQL query. Returns null if token missing.
 * Retries with backoff on 429 (rate limit).
 */
export async function mondayGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
  const token = getMondayToken()
  if (!token) return null
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MONDAY_RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'API-Version': '2025-04',
      },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429 && attempt < MONDAY_RETRY_ATTEMPTS) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter ? Math.min(Number(retryAfter) * 1000, 30000) : MONDAY_RETRY_BASE_MS * attempt
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }
    if (!res.ok) {
      lastError = new Error(`Monday API error: ${res.status} ${res.statusText}`)
      throw lastError
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      lastError = new Error(`Monday API: ${json.errors.map((e) => e.message).join('; ')}`)
      throw lastError
    }
    return json.data ?? null
  }
  throw lastError ?? new Error('Monday API: rate limited')
}

/** Column map: title lowercase, spaces -> underscores */
export function columnMap(item: MondayItem): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {}
  for (const col of item.column_values ?? []) {
    const key = col.title ? col.title.toLowerCase().replace(/\s+/g, '_') : col.id
    const text = col.text != null ? String(col.text).trim() : ''
    if (text !== '') out[key] = text
    else if (col.value != null) {
      try {
        const parsed = JSON.parse(col.value)
        if (typeof parsed === 'object' && parsed !== null && 'text' in parsed) out[key] = parsed.text
        else if (typeof parsed === 'string') out[key] = parsed
        else if (typeof parsed === 'number') out[key] = parsed
        else out[key] = col.value
      } catch {
        out[key] = col.value
      }
    }
  }
  return out
}

export function getCol(col: Record<string, string | number | null>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = col[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

/**
 * Extract image attachments from a Monday item.
 * Uses item.assets (queried via GraphQL) for public_url, cross-referenced
 * with file-type column values for context (which column the file came from).
 */
export function extractImageAttachments(item: MondayItem): MondayImageAttachment[] {
  const images: MondayImageAttachment[] = []
  const seenUrls = new Set<string>()

  // Strategy 1: Use item.assets which have public_url (preferred - long-lived URLs)
  if (item.assets?.length) {
    const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff'])
    for (const asset of item.assets) {
      const ext = (asset.file_extension ?? '').toLowerCase().replace(/^\./, '')
      if (!IMAGE_EXTENSIONS.has(ext)) continue
      const url = asset.public_url ?? asset.url
      if (!url) continue
      if (seenUrls.has(url)) continue
      seenUrls.add(url)
      images.push({
        url,
        name: asset.name || `image-${asset.id}.${ext}`,
        assetId: asset.id,
        source: 'asset',
      })
    }
  }

  // Strategy 2: Parse file-type column values for asset IDs we may have missed
  for (const col of item.column_values ?? []) {
    if (col.type !== 'file' && col.type !== 'files') continue
    if (!col.value) continue
    try {
      const parsed = JSON.parse(col.value) as Record<string, unknown>
      const files = Array.isArray(parsed.files) ? parsed.files : []
      for (const file of files as Array<Record<string, unknown>>) {
        if (file.isImage !== 'true' && file.isImage !== true) continue
        // If we already got this from item.assets, skip
        const assetId = file.assetId != null ? String(file.assetId) : undefined
        if (assetId && images.some((img) => img.assetId === assetId)) continue
        // Some file entries include a direct URL
        const url = typeof file.url === 'string' ? file.url : undefined
        if (!url) continue
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        const colTitle = col.title ?? col.id
        images.push({
          url,
          name: typeof file.name === 'string' ? file.name : `file-${assetId}`,
          assetId,
          source: colTitle,
        })
      }
    } catch {
      // Not valid JSON, skip
    }
  }

  return images
}

/**
 * Update a column value on a Monday item using JSON format.
 * Works for link columns ({"url":"...","text":"..."}) and other complex types.
 */
export async function updateColumnValue(
  boardId: string,
  itemId: string,
  columnId: string,
  value: string
): Promise<boolean> {
  const data = await mondayGraphql<{ change_column_value: { id: string } }>(
    `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
      change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) { id }
    }`,
    { boardId, itemId, columnId, value }
  )
  return !!data?.change_column_value?.id
}
