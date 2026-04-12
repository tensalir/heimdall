/**
 * Asset storage for Iterator.
 *
 * Persists generated images, reference images, and extracted backgrounds
 * to Supabase Storage, returning signed URLs. Follows the pattern
 * established by mediaMirror.ts instead of storing large data: URLs.
 */

import { getSupabase } from '../../../lib/supabase.js'

const BUCKET = 'briefing-media'

export async function storeAsset(
  jobId: string,
  assetType: string,
  imageBuffer: Buffer,
  contentType = 'image/png',
): Promise<string | null> {
  const db = getSupabase()
  if (!db) return null

  const ext = contentType === 'image/jpeg' ? 'jpg' : 'png'
  const path = `${jobId}/${assetType}-${Date.now()}.${ext}`

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

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`
  return publicUrl
}

export async function storeBase64Asset(
  jobId: string,
  assetType: string,
  base64Data: string,
): Promise<string | null> {
  const buffer = Buffer.from(base64Data, 'base64')
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8
  return storeAsset(jobId, assetType, buffer, isJpeg ? 'image/jpeg' : 'image/png')
}
