import type { PendingSyncJob, PendingSyncJobState } from '../src/jobs/types.js'
import {
  frontifyIntakeSettingsSchema,
  type FrontifyIntakeSettings,
} from '../src/domain/frontifyIntake/types.js'

/**
 * Vercel KV persistence layer for Heimdall.
 * Replaces the in-memory queue with Redis-backed storage.
 * Falls back to in-memory storage when KV env vars are missing (local dev).
 */

// ---------------------------------------------------------------------------
// In-memory fallback for local dev (no Vercel KV)
// ---------------------------------------------------------------------------
// Use globalThis to persist across Next.js HMR reloads in dev mode.
// Without this, module reloads clear the Maps and all queued jobs vanish.
const g = globalThis as unknown as {
  _heimdallMemStore?: Map<string, unknown>
  _heimdallMemSets?: Map<string, Set<string>>
  _heimdallMemSorted?: Map<string, { score: number; member: string }[]>
  _heimdallMemLists?: Map<string, string[]>
}
const memStore = g._heimdallMemStore ?? (g._heimdallMemStore = new Map<string, unknown>())
const memSets = g._heimdallMemSets ?? (g._heimdallMemSets = new Map<string, Set<string>>())
const memSorted = g._heimdallMemSorted ?? (g._heimdallMemSorted = new Map<string, { score: number; member: string }[]>())
const memLists = g._heimdallMemLists ?? (g._heimdallMemLists = new Map<string, string[]>())

function getSet(key: string): Set<string> {
  if (!memSets.has(key)) memSets.set(key, new Set())
  return memSets.get(key)!
}
function getSorted(key: string) {
  if (!memSorted.has(key)) memSorted.set(key, [])
  return memSorted.get(key)!
}
function getList(key: string) {
  if (!memLists.has(key)) memLists.set(key, [])
  return memLists.get(key)!
}

const hasKV = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

// Lazy-load @vercel/kv only when env vars are present
let _kv: typeof import('@vercel/kv').kv | null = null
async function getKV() {
  if (!hasKV) return null
  if (!_kv) {
    const mod = await import('@vercel/kv')
    _kv = mod.kv
  }
  return _kv
}

// ---------------------------------------------------------------------------
// Thin wrappers that route to KV or in-memory
// ---------------------------------------------------------------------------
async function kvSet(key: string, value: string) {
  const kv = await getKV()
  if (kv) return kv.set(key, value)
  memStore.set(key, value)
}
async function kvGet(key: string): Promise<string | null> {
  const kv = await getKV()
  if (kv) return kv.get<string>(key)
  const v = memStore.get(key)
  if (v == null) return null
  return typeof v === 'string' ? v : (v as string)
}
async function kvDel(key: string) {
  const kv = await getKV()
  if (kv) return kv.del(key)
  memStore.delete(key)
}
async function kvSadd(key: string, member: string) {
  const kv = await getKV()
  if (kv) return kv.sadd(key, member)
  getSet(key).add(member)
}
async function kvSrem(key: string, member: string) {
  const kv = await getKV()
  if (kv) return kv.srem(key, member)
  getSet(key).delete(member)
}
async function kvSmembers(key: string): Promise<string[]> {
  const kv = await getKV()
  if (kv) return kv.smembers<string[]>(key)
  return [...getSet(key)]
}
async function kvScard(key: string): Promise<number> {
  const kv = await getKV()
  if (kv) return kv.scard(key)
  return getSet(key).size
}
async function kvZadd(key: string, entry: { score: number; member: string }) {
  const kv = await getKV()
  if (kv) return kv.zadd(key, entry)
  const arr = getSorted(key)
  arr.push(entry)
  arr.sort((a, b) => a.score - b.score)
}
async function kvZrange(key: string, start: number, end: number, opts?: { rev?: boolean }): Promise<string[]> {
  const kv = await getKV()
  if (kv) return kv.zrange<string[]>(key, start, end, opts as any)
  let arr = getSorted(key).map((e) => e.member)
  if (opts?.rev) arr = arr.reverse()
  return arr.slice(start, end + 1)
}
async function kvZrem(key: string, member: string) {
  const kv = await getKV()
  if (kv) return kv.zrem(key, member)
  const arr = getSorted(key)
  const idx = arr.findIndex((e) => e.member === member)
  if (idx >= 0) arr.splice(idx, 1)
}
async function kvZcard(key: string): Promise<number> {
  const kv = await getKV()
  if (kv) return kv.zcard(key)
  return getSorted(key).length
}
async function kvLpush(key: string, value: string) {
  const kv = await getKV()
  if (kv) return kv.lpush(key, value)
  getList(key).unshift(value)
}
async function kvLtrim(key: string, start: number, end: number) {
  const kv = await getKV()
  if (kv) return kv.ltrim(key, start, end)
  const list = getList(key)
  memLists.set(key, list.slice(start, end + 1))
}
async function kvLrange(key: string, start: number, end: number): Promise<unknown[]> {
  const kv = await getKV()
  if (kv) return kv.lrange(key, start, end)
  return getList(key).slice(start, end + 1)
}

// ============================================================================
// JOB QUEUE CRUD
// ============================================================================

export async function enqueueJob(job: PendingSyncJob): Promise<void> {
  const { id, idempotencyKey, state, batchCanonical, figmaFileKey, createdAt } = job
  
  // Store job data
  await kvSet(`heimdall:job:${id}`, JSON.stringify(job))
  
  // Add to global sorted set (score = timestamp)
  await kvZadd('heimdall:jobs:all', { score: new Date(createdAt).getTime(), member: id })
  
  // Add to state index
  await kvSadd(`heimdall:jobs:state:${state}`, id)
  
  // Add to batch index
  await kvSadd(`heimdall:jobs:batch:${batchCanonical}`, id)
  
  // Add to file key index
  if (figmaFileKey) {
    await kvSadd(`heimdall:jobs:fileKey:${figmaFileKey}`, id)
  }
  
  // Store idempotency mapping
  await kvSet(`heimdall:jobs:idempotency:${idempotencyKey}`, id)
}

export async function getJobById(id: string): Promise<PendingSyncJob | null> {
  const data = await kvGet(`heimdall:job:${id}`)
  return data ? JSON.parse(data) : null
}

export async function getJobByIdempotencyKey(key: string): Promise<PendingSyncJob | null> {
  const id = await kvGet(`heimdall:jobs:idempotency:${key}`)
  return id ? getJobById(id) : null
}

export async function getAllJobs(limit = 100): Promise<PendingSyncJob[]> {
  const ids = await kvZrange('heimdall:jobs:all', 0, limit - 1, { rev: true })
  const jobs = await Promise.all(ids.map((id: string) => getJobById(id)))
  return jobs.filter((j): j is PendingSyncJob => j !== null)
}

export async function getJobsByState(state: PendingSyncJobState, limit = 100): Promise<PendingSyncJob[]> {
  const ids = await kvSmembers(`heimdall:jobs:state:${state}`)
  const jobs = await Promise.all(ids.slice(0, limit).map((id: string) => getJobById(id)))
  return jobs.filter((j): j is PendingSyncJob => j !== null)
}

export async function getJobsByFileKey(fileKey: string, limit = 100): Promise<PendingSyncJob[]> {
  const ids = await kvSmembers(`heimdall:jobs:fileKey:${fileKey}`)
  const jobs = await Promise.all(ids.slice(0, limit).map((id: string) => getJobById(id)))
  return jobs.filter((j): j is PendingSyncJob => j !== null)
}

export async function getJobsByBatch(batchCanonical: string, limit = 100): Promise<PendingSyncJob[]> {
  const ids = await kvSmembers(`heimdall:jobs:batch:${batchCanonical}`)
  const jobs = await Promise.all(ids.slice(0, limit).map((id: string) => getJobById(id)))
  return jobs.filter((j): j is PendingSyncJob => j !== null)
}

export async function updateJobState(
  id: string,
  newState: PendingSyncJobState,
  updates?: Partial<PendingSyncJob>
): Promise<void> {
  const job = await getJobById(id)
  if (!job) return
  
  const oldState = job.state
  const updatedJob: PendingSyncJob = {
    ...job,
    ...updates,
    state: newState,
    updatedAt: new Date().toISOString(),
  }
  
  // Update job data
  await kvSet(`heimdall:job:${id}`, JSON.stringify(updatedJob))
  
  // Update state indices
  if (oldState !== newState) {
    await kvSrem(`heimdall:jobs:state:${oldState}`, id)
    await kvSadd(`heimdall:jobs:state:${newState}`, id)
  }
}

export async function deleteJob(id: string): Promise<void> {
  const job = await getJobById(id)
  if (!job) return
  
  // Remove from all indices
  await kvDel(`heimdall:job:${id}`)
  await kvZrem('heimdall:jobs:all', id)
  await kvSrem(`heimdall:jobs:state:${job.state}`, id)
  await kvSrem(`heimdall:jobs:batch:${job.batchCanonical}`, id)
  if (job.figmaFileKey) {
    await kvSrem(`heimdall:jobs:fileKey:${job.figmaFileKey}`, id)
  }
  await kvDel(`heimdall:jobs:idempotency:${job.idempotencyKey}`)
}

// ============================================================================
// SETTINGS CRUD
// ============================================================================

export interface RoutingMap {
  [canonicalKey: string]: string // e.g. "2026-03" -> "figmaFileKey..."
}

export interface FilterSettings {
  enforceFilters: boolean
  allowedStatuses: string[]
  allowedTeams: string[]
}

export async function getRoutingMap(): Promise<RoutingMap> {
  const data = await kvGet('heimdall:settings:routing')
  return data ? JSON.parse(data) : {}
}

export async function setRoutingMap(map: RoutingMap): Promise<void> {
  await kvSet('heimdall:settings:routing', JSON.stringify(map))
}

export async function getFilterSettings(): Promise<FilterSettings> {
  const data = await kvGet('heimdall:settings:filters')
  return data
    ? JSON.parse(data)
    : { enforceFilters: false, allowedStatuses: [], allowedTeams: [] }
}

export async function setFilterSettings(settings: FilterSettings): Promise<void> {
  await kvSet('heimdall:settings:filters', JSON.stringify(settings))
}

export async function getFrontifyIntakeSettings(): Promise<FrontifyIntakeSettings> {
  const data = await kvGet('heimdall:settings:frontify-intake')
  if (!data) return frontifyIntakeSettingsSchema.parse({})
  try {
    return frontifyIntakeSettingsSchema.parse(JSON.parse(data))
  } catch {
    return frontifyIntakeSettingsSchema.parse({})
  }
}

export async function setFrontifyIntakeSettings(settings: FrontifyIntakeSettings): Promise<void> {
  const normalized = frontifyIntakeSettingsSchema.parse(settings)
  await kvSet('heimdall:settings:frontify-intake', JSON.stringify(normalized))
}

// ============================================================================
// WEBHOOK LOG
// ============================================================================

export interface WebhookLogEntry {
  timestamp: string
  mondayItemId: string
  itemName: string
  outcome: 'queued' | 'filtered' | 'error'
  reason?: string
  errorMessage?: string
}

export async function logWebhook(entry: WebhookLogEntry): Promise<void> {
  await kvLpush('heimdall:webhooks:log', JSON.stringify(entry))
  // Cap at 200 entries
  await kvLtrim('heimdall:webhooks:log', 0, 199)
}

export async function getWebhookLog(limit = 20): Promise<WebhookLogEntry[]> {
  const entries = await kvLrange('heimdall:webhooks:log', 0, limit - 1)
  if (!entries || !Array.isArray(entries)) return []
  return entries.map((e) => JSON.parse(String(e)))
}

// ============================================================================
// STRUCTURED LOGS (for error logging / audit)
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogCategory = 'webhook' | 'mapping' | 'queue' | 'figma' | 'api' | 'system' | 'integration'

export interface LogEntry {
  id: string
  timestamp: string
  level: LogLevel
  category: LogCategory
  message: string
  context?: Record<string, unknown>
  error?: { message: string; stack?: string; code?: string }
  duration?: number
}

const LOG_CAP = 500

export async function appendLog(entry: LogEntry): Promise<void> {
  await kvLpush('heimdall:logs', JSON.stringify(entry))
  await kvLtrim('heimdall:logs', 0, LOG_CAP - 1)
}

export async function getLogs(opts: {
  level?: LogLevel
  category?: LogCategory
  limit?: number
}): Promise<LogEntry[]> {
  const limit = opts.limit ?? 50
  const raw = await kvLrange('heimdall:logs', 0, limit - 1)
  if (!raw || !Array.isArray(raw)) return []
  const entries = raw.map((e) => JSON.parse(String(e)) as LogEntry)
  let result = entries
  if (opts.level) result = result.filter((e) => e.level === opts.level)
  if (opts.category) result = result.filter((e) => e.category === opts.category)
  return result
}

export async function getLogById(id: string): Promise<LogEntry | null> {
  const raw = await kvLrange('heimdall:logs', 0, LOG_CAP - 1)
  if (!raw || !Array.isArray(raw)) return null
  for (const e of raw) {
    const entry = JSON.parse(String(e)) as LogEntry
    if (entry.id === id) return entry
  }
  return null
}

// ============================================================================
// QUEUE STATS
// ============================================================================

export async function getQueueStats() {
  const [queued, running, completed, failed, totalCount] = await Promise.all([
    kvScard(`heimdall:jobs:state:queued`),
    kvScard(`heimdall:jobs:state:running`),
    kvScard(`heimdall:jobs:state:completed`),
    kvScard(`heimdall:jobs:state:failed`),
    kvZcard('heimdall:jobs:all'),
  ])
  
  return { queued, running, completed, failed, total: totalCount }
}

// ============================================================================
// BATCH STATS (jobs grouped by batch for dashboard)
// ============================================================================

export interface BatchStats {
  batchCanonical: string
  queued: number
  running: number
  completed: number
  failed: number
  total: number
}

export async function getBatchStats(): Promise<BatchStats[]> {
  const allJobs = await getAllJobs(500)
  const byBatch = new Map<string, { queued: number; running: number; completed: number; failed: number }>()
  for (const job of allJobs) {
    const key = job.batchCanonical
    if (!byBatch.has(key)) byBatch.set(key, { queued: 0, running: 0, completed: 0, failed: 0 })
    const b = byBatch.get(key)!
    if (job.state === 'queued') b.queued++
    else if (job.state === 'running') b.running++
    else if (job.state === 'completed') b.completed++
    else b.failed++
  }
  return Array.from(byBatch.entries())
    .map(([batchCanonical, counts]) => ({
      batchCanonical,
      ...counts,
      total: counts.queued + counts.running + counts.completed + counts.failed,
    }))
    .sort((a, b) => b.batchCanonical.localeCompare(a.batchCanonical))
}
