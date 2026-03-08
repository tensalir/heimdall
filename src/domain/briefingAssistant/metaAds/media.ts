import { NextResponse } from 'next/server.js'
import { isValidMediaUrl } from '../../../../lib/media-utils.js'
import { extractMediaFromSnapshot } from '../../../integrations/meta/preview.js'
import { mirrorMediaAsset } from '../../../integrations/meta/mediaMirror.js'
import type { SupabaseDb } from './ingest.js'

const WARMUP_CONCURRENCY = 2
const WARMUP_MAX_PER_SYNC = 10
const WARMUP_MAX_BULK = 50
const LAZY_MIRROR_MAX = 5

let _lazyMirrorRunning = false

export async function lazyMirrorPass(
  db: SupabaseDb,
  ads: Array<{ id: string; thumbnail_url: string | null }>,
) {
  if (_lazyMirrorRunning) return
  const candidates = ads
    .filter((a) => a.thumbnail_url && isValidMediaUrl(a.thumbnail_url) && !a.thumbnail_url!.includes('supabase'))
    .map((a) => a.id)
    .slice(0, LAZY_MIRROR_MAX)
  if (candidates.length === 0) return

  _lazyMirrorRunning = true
  try {
    await runThumbnailWarmup(db, candidates)
  } finally {
    _lazyMirrorRunning = false
  }
}

async function warmSingleItem(
  db: SupabaseDb,
  item: { id: string; link_url: string | null },
): Promise<boolean> {
  if (!item.link_url) return false
  try {
    const media = await extractMediaFromSnapshot(item.link_url)
    if (!media?.thumbnailUrl) return false

    let thumbUrl = media.thumbnailUrl
    const mirrored = await mirrorMediaAsset(db, media.thumbnailUrl, item.id, 'thumb')
    if (mirrored) thumbUrl = mirrored

    const update: Record<string, unknown> = {
      thumbnail_url: thumbUrl,
      media_type: media.type,
    }
    if (media.videoUrl) {
      update.source_video_url = media.videoUrl
    }

    await db
      .from('briefing_source_items')
      .update(update)
      .eq('id', item.id)

    return true
  } catch (e) {
    console.error(`[thumbnail-warmup] Failed for ${item.id}:`, e instanceof Error ? e.message : e)
    return false
  }
}

async function runWarmupQueue(
  db: SupabaseDb,
  items: { id: string; link_url: string | null }[],
): Promise<{ warmed: number; failed: number }> {
  let warmed = 0
  let failed = 0
  const queue = [...items]

  const workers = Array.from({ length: WARMUP_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      const ok = await warmSingleItem(db, item)
      if (ok) warmed++
      else failed++
    }
  })

  await Promise.allSettled(workers)
  return { warmed, failed }
}

export async function runThumbnailWarmup(db: SupabaseDb, itemIds: string[]) {
  if (itemIds.length === 0) return
  const batch = itemIds.slice(0, WARMUP_MAX_PER_SYNC)

  const { data: items } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url')
    .in('id', batch)

  const needsWarmup = (items ?? []).filter(
    (i: { thumbnail_url: string | null; link_url: string | null }) =>
      !isValidMediaUrl(i.thumbnail_url),
  )
  if (needsWarmup.length === 0) return

  const { warmed, failed } = await runWarmupQueue(db, needsWarmup)
  console.log(`[thumbnail-warmup] sync batch: ${warmed} warmed, ${failed} failed out of ${needsWarmup.length}`)
}

export async function handleWarmThumbnails(db: SupabaseDb) {
  const { data: allItems, error: qErr } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url')
    .eq('source_type', 'meta_ad')
    .not('link_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  const toWarm = (allItems ?? []).filter(
    (i: { link_url: string | null; thumbnail_url: string | null }) =>
      !isValidMediaUrl(i.thumbnail_url),
  )

  if (toWarm.length === 0) {
    return NextResponse.json({ ok: true, message: 'All ads already have valid thumbnails', warmed: 0, failed: 0, remaining: 0 })
  }

  const batch = toWarm.slice(0, WARMUP_MAX_BULK)
  const { warmed, failed } = await runWarmupQueue(db, batch)

  return NextResponse.json({
    ok: true,
    candidates: batch.length,
    warmed,
    failed,
    remaining: Math.max(0, toWarm.length - batch.length),
  })
}

export async function handleMirrorMedia(
  db: SupabaseDb,
  body: { item_id?: string; type?: string },
) {
  const itemId = body.item_id
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  }

  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url, creative_url, source_video_url, media_type')
    .eq('id', itemId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  const wantVideo = body.type === 'video' || item.media_type === 'video'
  const results: { thumbnail_url?: string; creative_url?: string } = {}

  if (!isValidMediaUrl(item.thumbnail_url) || !item.thumbnail_url?.includes('supabase')) {
    if (item.link_url) {
      const media = await extractMediaFromSnapshot(item.link_url)
      if (media?.thumbnailUrl) {
        const mirrored = await mirrorMediaAsset(db, media.thumbnailUrl, itemId, 'thumb')
        if (mirrored) {
          results.thumbnail_url = mirrored
          await db.from('briefing_source_items').update({
            thumbnail_url: mirrored,
            media_type: media.type,
            ...(media.videoUrl ? { source_video_url: media.videoUrl } : {}),
          }).eq('id', itemId)
        }
      }
    }
  } else {
    results.thumbnail_url = item.thumbnail_url
  }

  if (wantVideo) {
    const videoSource = item.source_video_url || null
    if (videoSource) {
      const mirrored = await mirrorMediaAsset(db, videoSource, itemId, 'video')
      if (mirrored) {
        results.creative_url = mirrored
        await db.from('briefing_source_items').update({ creative_url: mirrored }).eq('id', itemId)
      }
    } else if (item.link_url) {
      const media = await extractMediaFromSnapshot(item.link_url)
      if (media?.videoUrl) {
        const mirrored = await mirrorMediaAsset(db, media.videoUrl, itemId, 'video')
        if (mirrored) {
          results.creative_url = mirrored
          await db.from('briefing_source_items').update({
            creative_url: mirrored,
            source_video_url: media.videoUrl,
          }).eq('id', itemId)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, mirrored: results })
}

export async function handlePromoteVideo(db: SupabaseDb, itemId: string) {
  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, link_url, creative_url, source_video_url, media_type')
    .eq('id', itemId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  if (isValidMediaUrl(item.creative_url) && item.creative_url?.includes('supabase')) {
    return NextResponse.json({ ok: true, status: 'already_mirrored', creative_url: item.creative_url })
  }

  const videoSource = item.source_video_url || null
  if (!videoSource) {
    if (!item.link_url) {
      return NextResponse.json({ ok: false, status: 'no_source', message: 'No snapshot URL to extract from' })
    }
    const media = await extractMediaFromSnapshot(item.link_url)
    if (!media?.videoUrl) {
      return NextResponse.json({ ok: false, status: 'no_video', message: 'No video found in snapshot' })
    }

    const mirrored = await mirrorMediaAsset(db, media.videoUrl, itemId, 'video')
    if (!mirrored) {
      return NextResponse.json({ ok: false, status: 'mirror_failed' })
    }

    await db
      .from('briefing_source_items')
      .update({ creative_url: mirrored, source_video_url: media.videoUrl, media_type: 'video' })
      .eq('id', itemId)

    return NextResponse.json({ ok: true, status: 'promoted', creative_url: mirrored })
  }

  const mirrored = await mirrorMediaAsset(db, videoSource, itemId, 'video')
  if (!mirrored) {
    return NextResponse.json({ ok: false, status: 'mirror_failed' })
  }

  await db.from('briefing_source_items').update({ creative_url: mirrored }).eq('id', itemId)
  return NextResponse.json({ ok: true, status: 'promoted', creative_url: mirrored })
}

const POSTER_TTL_DAYS = 90
const VIDEO_TTL_DAYS = 14

export async function handleCleanupMedia(db: SupabaseDb) {
  const posterCutoff = new Date(Date.now() - POSTER_TTL_DAYS * 86400000).toISOString()
  const videoCutoff = new Date(Date.now() - VIDEO_TTL_DAYS * 86400000).toISOString()

  const { data: stalePosters } = await db
    .from('briefing_source_items')
    .select('id, thumbnail_url')
    .eq('source_type', 'meta_ad')
    .neq('media_tier', 'first_party')
    .lt('updated_at', posterCutoff)
    .not('thumbnail_url', 'is', null)
    .limit(100)

  let postersCleared = 0
  for (const item of stalePosters ?? []) {
    if (item.thumbnail_url?.includes('supabase')) {
      const path = item.thumbnail_url.split('/briefing-media/').pop()
      if (path) {
        await db.storage.from('briefing-media').remove([path])
      }
    }
    await db.from('briefing_source_items').update({ thumbnail_url: null, creative_url: null }).eq('id', item.id)
    postersCleared++
  }

  const { data: staleVideos } = await db
    .from('briefing_source_items')
    .select('id, creative_url')
    .eq('source_type', 'meta_ad')
    .neq('media_tier', 'first_party')
    .lt('updated_at', videoCutoff)
    .not('creative_url', 'is', null)
    .limit(100)

  let videosCleared = 0
  for (const item of staleVideos ?? []) {
    if (item.creative_url?.includes('supabase')) {
      const path = item.creative_url.split('/briefing-media/').pop()
      if (path) {
        await db.storage.from('briefing-media').remove([path])
      }
    }
    await db.from('briefing_source_items').update({ creative_url: null }).eq('id', item.id)
    videosCleared++
  }

  return NextResponse.json({
    ok: true,
    posters_cleared: postersCleared,
    videos_cleared: videosCleared,
    poster_ttl_days: POSTER_TTL_DAYS,
    video_ttl_days: VIDEO_TTL_DAYS,
  })
}
