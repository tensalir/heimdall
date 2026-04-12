/**
 * Asset storage for Iterator.
 *
 * Persists generated images, reference images, and extracted backgrounds
 * to Supabase Storage, returning signed URLs. Follows the pattern
 * established by mediaMirror.ts instead of storing large data: URLs.
 */

import { getSupabase } from '../../../lib/supabase.js'

const BUCKET = 'iterator-assets'

export async function storeAsset(
  jobId: string,
  assetType: string,
  imageBuffer: Buffer,
  contentType = 'image/png',
): Promise<string | null> {
  const db = getSupabase()
  if (!db) return null

  const path = `${jobId}/${assetType}-${Date.now()}.png`

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, imageBuffer, {
      contentType,
      upsert: false,
    })

  if (uploadError) {
    console.error('[iterator/storage] Upload failed:', uploadError.message)
    return null
  }

  const { data: signedUrl } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7) // 7-day expiry

  return signedUrl?.signedUrl || null
}

export async function storeBase64Asset(
  jobId: string,
  assetType: string,
  base64Data: string,
): Promise<string | null> {
  const buffer = Buffer.from(base64Data, 'base64')
  return storeAsset(jobId, assetType, buffer)
}
