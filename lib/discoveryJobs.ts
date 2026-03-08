import { getSupabase } from './supabase.js'

export type JobType = 'trend_discovery' | 'social_discovery' | 'meta_watchlist_sync' | 'meta_manual_sync'
export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface DiscoveryJob {
  id: string
  job_type: JobType
  status: JobStatus
  params: Record<string, unknown>
  progress: Record<string, unknown>
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export async function enqueueJob(
  jobType: JobType,
  params: Record<string, unknown> = {},
  userId?: string,
): Promise<DiscoveryJob | null> {
  const db = getSupabase()
  if (!db) return null

  const { data: existing } = await db
    .from('briefing_discovery_jobs')
    .select('id, status')
    .eq('job_type', jobType)
    .in('status', ['queued', 'running'])
    .limit(1)
    .maybeSingle()

  if (existing) return existing as unknown as DiscoveryJob

  const row: Record<string, unknown> = {
    job_type: jobType,
    status: 'queued',
    params,
  }
  if (userId) row.created_by = userId

  const { data, error } = await db
    .from('briefing_discovery_jobs')
    .insert(row)
    .select('*')
    .single()

  if (error) {
    console.error('[discoveryJobs] enqueue failed:', error.message)
    return null
  }
  return data as DiscoveryJob
}

export async function startJob(jobId: string): Promise<void> {
  const db = getSupabase()
  if (!db) return
  await db
    .from('briefing_discovery_jobs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', jobId)
}

export async function updateJobProgress(
  jobId: string,
  progress: Record<string, unknown>,
): Promise<void> {
  const db = getSupabase()
  if (!db) return
  await db
    .from('briefing_discovery_jobs')
    .update({ progress })
    .eq('id', jobId)
}

export async function completeJob(
  jobId: string,
  progress: Record<string, unknown>,
): Promise<void> {
  const db = getSupabase()
  if (!db) return
  await db
    .from('briefing_discovery_jobs')
    .update({
      status: 'completed',
      progress,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

export async function failJob(jobId: string, error: string): Promise<void> {
  const db = getSupabase()
  if (!db) return
  await db
    .from('briefing_discovery_jobs')
    .update({
      status: 'failed',
      error,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}
