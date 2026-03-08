import { NextResponse } from 'next/server'
import sharp from 'sharp'

/**
 * Image proxy endpoint for Figma plugin.
 *
 * Monday.com protected_static URLs require session cookies that the plugin iframe
 * doesn't have. This endpoint resolves the image via Monday's assets GraphQL API
 * to get a signed public S3 URL, then fetches and returns bytes with CORS headers.
 * Non-Figma formats (WebP, SVG, BMP, TIFF, etc.) are normalized to PNG and
 * dimensions are capped at 4096px for Figma plugin compatibility.
 *
 * Usage: GET /api/images/proxy?url=<encoded-image-url>
 *        GET /api/images/proxy?assetId=<monday-asset-id>
 *
 * Flow:
 *   1. Resolve via assetId first when present; else extract resource ID from URL
 *   2. Query Monday assets API for public_url when needed
 *   3. Fetch the image
 *   4. Normalize to PNG/JPEG/GIF and <=4096px if needed
 *   5. Return bytes with CORS headers
 */

const MONDAY_API_URL = 'https://api.monday.com/v2'
const FIGMA_MAX_DIM = 4096

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Allowed URL patterns to prevent open-proxy abuse
const ALLOWED_HOSTS = [
  'monday.com',
  '.monday.com',
  'monday-files.s3.amazonaws.com',
  'files-monday-com.s3.amazonaws.com',
  // Figma CDN hosts (for image fills from cross-file experiment import)
  'figma-alpha-api.s3.us-west-2.amazonaws.com',
  's3-alpha.figma.com',
  's3-alpha-sig.figma.com',
  '.figma.com',
  'figma-alpha.s3.us-west-2.amazonaws.com',
]

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/,
]

const MAX_RESPONSE_SIZE = 25 * 1024 * 1024

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (PRIVATE_IP_PATTERNS.some((p) => p.test(parsed.hostname))) return false
    if (parsed.hostname === 'localhost') return false
    return ALLOWED_HOSTS.some((host) => {
      if (host.startsWith('.')) {
        return parsed.hostname === host.slice(1) || parsed.hostname.endsWith(host)
      }
      return parsed.hostname === host
    })
  } catch {
    return false
  }
}

/**
 * Extract resource/asset ID from Monday URLs.
 * Matches: /protected_static/.../resources/{id}/... and /resources/{id}/...
 */
function extractResourceId(url: string): string | null {
  const match = /\/resources\/(\d+)(?:\/|$)/i.exec(url)
  return match ? match[1] : null
}

/**
 * Resolve a Monday resource ID to a public S3 URL via the assets API.
 */
async function resolvePublicUrl(resourceId: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: token,
        'API-Version': '2025-04',
      },
      body: JSON.stringify({
        query: `query ($ids: [ID!]!) { assets(ids: $ids) { id public_url } }`,
        variables: { ids: [Number(resourceId)] },
      }),
    })
    if (!res.ok) return null
    const json = (await res.json()) as {
      data?: { assets?: Array<{ id: string; public_url?: string }> }
    }
    return json.data?.assets?.[0]?.public_url ?? null
  } catch {
    return null
  }
}

function errorJson(
  reason: string,
  error: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { status: 'error', reason, error },
    { status, headers: CORS_HEADERS }
  )
}

/** Figma plugin supports PNG, JPEG, GIF only; max 4096px. */
const FIGMA_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif'])

function detectMimeFromMagic(buffer: ArrayBuffer): string | null {
  const arr = new Uint8Array(buffer)
  if (arr.length < 4) return null
  if (arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47) return 'image/png'
  if (arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff) return 'image/jpeg'
  if (arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46 && (arr[3] === 0x38 || arr[3] === 0x39)) return 'image/gif'
  if (arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46) return 'image/webp' // RIFF
  if (arr[0] === 0x3c && (arr[1] === 0x3f || arr[1] === 0x73)) return 'image/svg+xml' // <? or <s
  if (arr[0] === 0x42 && arr[1] === 0x4d) return 'image/bmp'
  if ((arr[0] === 0x49 && arr[1] === 0x49) || (arr[0] === 0x4d && arr[1] === 0x4d)) return 'image/tiff'
  return null
}

/**
 * Normalize image to Figma-compatible format (PNG/JPEG/GIF) and max dimension 4096.
 * Returns PNG buffer or null on failure.
 */
async function normalizeToFigmaCompatible(
  buffer: ArrayBuffer,
  contentType: string
): Promise<{ data: Buffer; contentType: string } | { error: string }> {
  const mime = detectMimeFromMagic(buffer) ?? contentType.split(';')[0].trim().toLowerCase()
  const buf = Buffer.from(buffer)

  try {
    let pipeline = sharp(buf)
    const meta = await pipeline.metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    const needsResize = w > FIGMA_MAX_DIM || h > FIGMA_MAX_DIM
    const isFigmaNative = FIGMA_MIMES.has(mime) && !needsResize

    if (isFigmaNative && !needsResize) {
      return { data: buf, contentType: mime }
    }

    if (needsResize) {
      const scale = Math.min(FIGMA_MAX_DIM / Math.max(w, 1), FIGMA_MAX_DIM / Math.max(h, 1), 1)
      const newW = Math.round(w * scale)
      const newH = Math.round(h * scale)
      pipeline = pipeline.resize(newW, newH, { fit: 'inside' })
    }

    if (FIGMA_MIMES.has(mime)) {
      const out = await pipeline.toBuffer()
      return { data: out, contentType: mime }
    }

    const out = await pipeline.png().toBuffer()
    return { data: out, contentType: 'image/png' }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Convert failed'
    return { error: message }
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('url')
    const assetIdParam = searchParams.get('assetId')

    const mondayToken = process.env.MONDAY_API_TOKEN
    let fetchUrl: string | null = null

    if (assetIdParam && mondayToken) {
      const publicUrl = await resolvePublicUrl(assetIdParam.trim(), mondayToken)
      if (publicUrl) fetchUrl = publicUrl
      if (!fetchUrl) {
        return errorJson(
          'asset_resolve_failed',
          'Could not resolve asset ID to URL',
          404
        )
      }
    } else if (imageUrl) {
      if (!isAllowedUrl(imageUrl)) {
        return errorJson(
          'url_not_allowed',
          'URL not allowed — only Monday.com image URLs are supported',
          403
        )
      }
      fetchUrl = imageUrl
      if (mondayToken) {
        const resourceId = extractResourceId(fetchUrl)
        if (resourceId) {
          const publicUrl = await resolvePublicUrl(resourceId, mondayToken)
          if (publicUrl) fetchUrl = publicUrl
        }
      }
    }

    if (!fetchUrl) {
      return errorJson(
        'missing_param',
        'Provide "url" or "assetId" query parameter',
        400
      )
    }

    const response = await fetch(fetchUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return errorJson(
        'fetch_failed',
        `Image fetch failed: ${response.status} ${response.statusText}`,
        502
      )
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_RESPONSE_SIZE) {
      return errorJson('too_large', 'Response exceeds size limit', 413)
    }

    const contentType = response.headers.get('content-type') ?? 'image/png'
    const buffer = await response.arrayBuffer()

    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      return errorJson('too_large', 'Response exceeds size limit', 413)
    }

    const result = await normalizeToFigmaCompatible(buffer, contentType)
    if ('error' in result) {
      return errorJson('decode_failed', result.error, 422)
    }

    return new NextResponse(result.data, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': result.contentType,
        'Content-Length': String(result.data.length),
        'Cache-Control': 'public, max-age=3600',
      },
    })
  } catch (error) {
    return errorJson(
      'proxy_error',
      error instanceof Error ? error.message : 'Proxy fetch failed',
      500
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export const dynamic = 'force-dynamic'
