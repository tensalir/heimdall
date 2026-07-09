/**
 * Minimal Figma REST client — exactly what the PSD exporter needs, nothing else.
 * Vendored from Heimdall's src/integrations/figma/restClient.ts (trimmed).
 *
 * Auth: FIGMA_ACCESS_TOKEN env var, sent as X-Figma-Token. The token needs the
 * file_content:read scope and access to the target file.
 */

const FIGMA_API_BASE = 'https://api.figma.com/v1'

function getFigmaToken(): string | null {
  return process.env.FIGMA_ACCESS_TOKEN ?? null
}

/**
 * Node ids appear as `1-23` in Figma URLs but the REST API expects `1:23`.
 * Safe to call on an already-normalized id.
 */
export function normalizeNodeId(id: string): string {
  return id.replace(/-/g, ':')
}

export interface FigmaFileMeta {
  name: string
  document?: { id: string; name?: string; type?: string; children?: unknown[] }
  version?: string
}

/** Get file metadata and document root. Read-only. */
export async function getFile(
  fileKey: string,
  options?: { depth?: number; ids?: string[] }
): Promise<FigmaFileMeta | null> {
  const token = getFigmaToken()
  if (!token) return null
  const url = new URL(`${FIGMA_API_BASE}/files/${fileKey}`)
  if (options?.depth != null) url.searchParams.set('depth', String(options.depth))
  if (options?.ids?.length) url.searchParams.set('ids', options.ids.join(','))
  const res = await fetch(url.toString(), { headers: { 'X-Figma-Token': token } })
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) return null
    throw new Error(`Figma API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as FigmaFileMeta
}

/** Response shape for GET /v1/files/:key/nodes */
export interface FigmaNodesResponse {
  name?: string
  lastModified?: string
  err?: string
  nodes: Record<
    string,
    {
      document?: unknown
      components?: Record<string, unknown>
      componentSets?: Record<string, unknown>
      schemaVersion?: number
      styles?: Record<string, unknown>
    } | null
  >
}

/** Get specific nodes (and their subtrees) from a file. */
export async function getFileNodes(
  fileKey: string,
  nodeIds: string[],
  options?: { depth?: number; geometry?: 'paths' }
): Promise<FigmaNodesResponse | null> {
  const token = getFigmaToken()
  if (!token || nodeIds.length === 0) return null
  const url = new URL(`${FIGMA_API_BASE}/files/${fileKey}/nodes`)
  url.searchParams.set('ids', nodeIds.join(','))
  if (options?.depth != null) url.searchParams.set('depth', String(options.depth))
  if (options?.geometry) url.searchParams.set('geometry', options.geometry)
  const res = await fetch(url.toString(), { headers: { 'X-Figma-Token': token } })
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) return null
    throw new Error(`Figma API error: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as FigmaNodesResponse
}

export interface ExportNodeImagesOptions {
  format?: 'png' | 'jpg' | 'svg' | 'pdf'
  scale?: number
  /**
   * Render the node at its full bounding-box dimensions, ignoring cropping and
   * empty surrounding space. Needed when the returned pixel size must match
   * `absoluteBoundingBox` exactly (e.g. a PSD composite).
   */
  useAbsoluteBounds?: boolean
  /** Pin to a specific file version for reproducible exports. */
  version?: string
}

function buildExportUrl(
  fileKey: string,
  nodeIds: string[],
  options?: ExportNodeImagesOptions
): URL {
  const url = new URL(`${FIGMA_API_BASE}/images/${fileKey}`)
  url.searchParams.set('ids', nodeIds.join(','))
  if (options?.format) url.searchParams.set('format', options.format)
  if (options?.scale != null) url.searchParams.set('scale', String(options.scale))
  if (options?.useAbsoluteBounds != null)
    url.searchParams.set('use_absolute_bounds', String(options.useAbsoluteBounds))
  if (options?.version) url.searchParams.set('version', options.version)
  return url
}

const FIGMA_IMAGES_RETRY_ATTEMPTS = 4
const FIGMA_IMAGES_RETRY_BASE_MS = 2000

/** Thrown when Figma rejects a render request outright. */
export class FigmaExportError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'FigmaExportError'
  }
}

/**
 * Export nodes as images, retrying 429/5xx with backoff. **Throws** on 403/404
 * rather than returning `{}` — a token without file_content:read scope and a
 * frame where every layer is hidden would otherwise be indistinguishable.
 *
 * A `null` value in the result means Figma could not render that node — it is
 * invisible, has 0% opacity, or has no renderable content. Normal, not an error.
 *
 * Figma returns a top-level `err` when *any* node in the batch fails, so a
 * single oversized node poisons the whole request. Callers that batch should
 * bisect on `FigmaExportError` to isolate the offender.
 */
export async function exportNodeImagesWithRetry(
  fileKey: string,
  nodeIds: string[],
  options?: ExportNodeImagesOptions
): Promise<Record<string, string | null>> {
  const token = getFigmaToken()
  if (!token) throw new FigmaExportError('FIGMA_ACCESS_TOKEN is not set')
  if (nodeIds.length === 0) return {}

  const url = buildExportUrl(fileKey, nodeIds, options)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= FIGMA_IMAGES_RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(url.toString(), { headers: { 'X-Figma-Token': token } })

    if (res.status === 429 && attempt < FIGMA_IMAGES_RETRY_ATTEMPTS) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? Math.min(Number(retryAfter) * 1000, 30000)
        : FIGMA_IMAGES_RETRY_BASE_MS * attempt
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    if (res.status >= 500 && attempt < FIGMA_IMAGES_RETRY_ATTEMPTS) {
      lastError = new FigmaExportError(`Figma API error: ${res.status} ${res.statusText}`, res.status)
      const waitMs = FIGMA_IMAGES_RETRY_BASE_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    if (!res.ok) {
      throw new FigmaExportError(
        `Figma API error: ${res.status} ${res.statusText}` +
          (res.status === 403
            ? ' — token expired, missing file_content:read scope, or org content-access restriction'
            : ''),
        res.status
      )
    }

    const data = (await res.json()) as { err?: string; images?: Record<string, string | null> }
    if (data.err) throw new FigmaExportError(`Figma export error: ${data.err}`)
    return data.images ?? {}
  }

  throw lastError ?? new FigmaExportError('Figma API: rate limited')
}
