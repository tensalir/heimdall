const FIGMA_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?figma\.com$/i
const VERCEL_APP_ORIGIN_RE = /^https:\/\/.*\.vercel\.app$/i

export function resolveCorsOrigin(
  origin: string | null | undefined,
  requestOrigin: string,
  allowedOrigins: string[] = []
): string {
  const normalizedOrigin = String(origin ?? '').trim()
  if (!normalizedOrigin) return ''

  if (allowedOrigins.includes(normalizedOrigin)) return normalizedOrigin
  if (FIGMA_ORIGIN_RE.test(normalizedOrigin)) return normalizedOrigin
  if (VERCEL_APP_ORIGIN_RE.test(normalizedOrigin)) return normalizedOrigin
  if (normalizedOrigin === requestOrigin) return normalizedOrigin

  return ''
}
