/**
 * Shared media URL validation and thumbnail status helpers.
 * Extracted from meta-ads route handlers to eliminate duplication.
 */

export function isValidMediaUrl(url: string | null): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return false
  if (url.startsWith('/api/')) return false
  if (url.includes('/ads/archive/render_ad/')) return false
  if (url.includes('/ads/library/?id=')) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

export function thumbnailStatus(url: string | null): 'ready' | 'pending' | 'invalid' {
  if (!url) return 'pending'
  if (isValidMediaUrl(url)) return 'ready'
  return 'invalid'
}
