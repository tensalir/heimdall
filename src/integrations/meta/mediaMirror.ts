import type { SupabaseClient } from '@supabase/supabase-js'

const BUCKET = 'briefing-media'
const DOWNLOAD_TIMEOUT_MS = 20000
const MAX_RETRIES = 2

/**
 * Download a CDN media asset and upload it to Supabase Storage.
 * Returns the stable public URL, or null if mirroring fails.
 *
 * Caller must pass an initialized SupabaseClient (typically from getSupabase()).
 */
export async function mirrorMediaAsset(
  db: SupabaseClient,
  cdnUrl: string,
  itemId: string,
  suffix: 'thumb' | 'video' = 'thumb',
): Promise<string | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(cdnUrl, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      })
      if (!res.ok) {
        if (attempt < MAX_RETRIES) continue
        console.error(`[media-mirror] Download failed for ${itemId}: HTTP ${res.status}`)
        return null
      }

      const contentType = res.headers.get('content-type') ?? 'image/jpeg'
      const ext = extensionFromMime(contentType)
      const path = `meta-ads/${itemId}-${suffix}.${ext}`
      const buffer = Buffer.from(await res.arrayBuffer())

      if (buffer.byteLength < 500) {
        console.warn(`[media-mirror] Suspiciously small file for ${itemId}: ${buffer.byteLength} bytes`)
        if (attempt < MAX_RETRIES) continue
        return null
      }

      const { error: uploadErr } = await db.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType,
          upsert: true,
          cacheControl: '31536000',
        })

      if (uploadErr) {
        console.error(`[media-mirror] Upload failed for ${itemId}:`, uploadErr.message)
        return null
      }

      const SIGNED_URL_TTL = 7 * 24 * 60 * 60 // 7 days
      const { data: signed, error: signErr } = await db.storage
        .from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL)
      if (signErr || !signed?.signedUrl) {
        console.error(`[media-mirror] Signed URL failed for ${itemId}:`, signErr?.message)
        return null
      }
      return signed.signedUrl
    } catch (e) {
      if (attempt < MAX_RETRIES) continue
      console.error(`[media-mirror] Error for ${itemId}:`, e instanceof Error ? e.message : e)
      return null
    }
  }

  return null
}

function extensionFromMime(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  }
  return map[base] ?? 'bin'
}
