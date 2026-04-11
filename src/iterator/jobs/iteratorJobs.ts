/**
 * Durable job management for Iterator.
 *
 * Uses Supabase for persistent job tracking, following the pattern
 * from lib/discoveryJobs.ts but with Iterator-specific status states.
 */

import { getSupabase } from '../../../lib/supabase'
import type { IteratorJob, IteratorJobStatus, IteratorMode, EditPlan } from '../types'

const TABLE = 'iterator_jobs'

export async function createJob(
  mode: IteratorMode,
  sourceFrameId?: string,
  sourceFileKey?: string,
  briefing?: string,
): Promise<IteratorJob | null> {
  const db = getSupabase()
  if (!db) return null

  const { data, error } = await db
    .from(TABLE)
    .insert({
      mode,
      status: 'queued' as IteratorJobStatus,
      source_frame_id: sourceFrameId || null,
      source_file_key: sourceFileKey || null,
      briefing: briefing || null,
      progress: {},
    })
    .select('*')
    .single()

  if (error) {
    console.error('[iteratorJobs] create failed:', error.message)
    return null
  }
  return data as IteratorJob
}

export async function updateJobStatus(
  jobId: string,
  status: IteratorJobStatus,
  extra: Partial<{ progress: Record<string, unknown>; edit_plan: EditPlan; error: string }> = {},
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  const update: Record<string, unknown> = { status, ...extra }
  if (status === 'planning' || status === 'generating') {
    update.started_at = new Date().toISOString()
  }
  if (status === 'completed' || status === 'failed') {
    update.completed_at = new Date().toISOString()
  }

  await db.from(TABLE).update(update).eq('id', jobId)
}

export async function getJob(jobId: string): Promise<IteratorJob | null> {
  const db = getSupabase()
  if (!db) return null

  const { data } = await db.from(TABLE).select('*').eq('id', jobId).single()
  return (data as IteratorJob) || null
}

export async function storeGeneratedAsset(
  jobId: string,
  assetType: string,
  aspectRatio: string,
  imageUrl: string,
  prompt?: string,
  model?: string,
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  await db.from('iterator_generated_assets').insert({
    job_id: jobId,
    asset_type: assetType,
    aspect_ratio: aspectRatio,
    image_url: imageUrl,
    prompt: prompt || null,
    model: model || null,
    metadata: {},
  })
}
