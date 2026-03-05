/**
 * Shared routing service: batch → canonical key, Monday board, Figma file.
 * Single place for resolution rules used by Briefing Assistant, webhook, and plugin.
 */

import { getEnv } from '../config/env.js'
import {
  parseBatchToCanonical,
  expectedFileNameFromCanonicalKey,
  type BatchParseResult,
} from '../domain/routing/batchToFile.js'
import type { ResolvedBatchTarget, BatchRef } from '../contracts/integrations.js'
import { figmaProvider } from '../integrations/providers/index.js'

/** Resolved target plus parse detail for callers that need it (e.g. FigmaTargetResult). */
export type ResolvedBatchTargetWithParse = ResolvedBatchTarget & { batchParse: BatchParseResult }

const PERF_ADS_PROJECT_ID = '387033831'
const PROJECT_CACHE_TTL_MS = 60_000

let projectFileCache: { files: Array<{ key: string; name: string }>; ts: number } | null = null

/**
 * Fetch project files with a 60s in-memory cache.
 * Returns an empty array on error so callers can fall through gracefully.
 */
async function getProjectFilesCached(): Promise<Array<{ key: string; name: string }>> {
  if (projectFileCache && Date.now() - projectFileCache.ts < PROJECT_CACHE_TTL_MS) {
    return projectFileCache.files
  }
  if (!figmaProvider.hasReadAccess()) return []
  try {
    const files = await figmaProvider.getProjectFiles(PERF_ADS_PROJECT_ID)
    projectFileCache = { files, ts: Date.now() }
    return files
  } catch {
    return projectFileCache?.files ?? []
  }
}

/**
 * Synchronous read of the project file cache (populated by async calls).
 * Returns null when the cache is cold; callers should fall through to env map.
 */
function getProjectFileCacheSync(): Array<{ key: string; name: string }> | null {
  if (!projectFileCache) return null
  return projectFileCache.files
}

function loadBatchFileMap(): Record<string, string> {
  const env = getEnv()
  const raw = env.HEIMDALL_BATCH_FILE_MAP
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v
      }
      return out
    }
  } catch {
    // ignore
  }
  return {}
}

/** Monday board ID for briefing/workflows. Prefer briefing-specific, then generic. */
export function getMondayBoardId(): string {
  return (
    process.env.MONDAY_BRIEFING_BOARD_ID ??
    process.env.MONDAY_BOARD_ID ??
    ''
  )
}

/**
 * Resolve a batch string to canonical batch + Monday board + Figma file key.
 * Precedence for file key: (1) explicit overrides (2) Figma filename match (3) env HEIMDALL_BATCH_FILE_MAP.
 */
export async function resolveBatchTarget(
  batch: string | null | undefined,
  options?: { yearHint?: number; fileKeyOverrides?: Record<string, string> }
): Promise<ResolvedBatchTarget | null> {
  const parse = parseBatchToCanonical(batch, options?.yearHint)
  if (!parse) return null

  const batchLabel = parse.expectedFileName.replace(/\s*-\s*PerformanceAds\s*$/i, '').trim()
  const batchRef: BatchRef = {
    batchKey: parse.canonicalKey,
    batchLabel,
    expectedFileName: parse.expectedFileName,
  }

  const boardId = getMondayBoardId() || null

  // 1) Explicit overrides (e.g. from UI)
  const override = options?.fileKeyOverrides?.[parse.canonicalKey]
  if (override) {
    return { batch: batchRef, boardId, fileKey: override }
  }

  // 2) Auto-discover from PerformanceAds project
  const projectFiles = await getProjectFilesCached()
  const projectMatch = projectFiles.find(
    (f) => f.name.trim().toUpperCase() === parse.expectedFileName.toUpperCase()
  )
  if (projectMatch) {
    return { batch: batchRef, boardId, fileKey: projectMatch.key }
  }

  // 3) Exact Figma filename match across configured teams
  if (figmaProvider.hasReadAccess()) {
    const teamIdsRaw = process.env.FIGMA_TEAM_IDS
    if (teamIdsRaw) {
      const teamIds = teamIdsRaw.split(',').map((id) => id.trim()).filter(Boolean)
      for (const teamId of teamIds) {
        try {
          const projects = await figmaProvider.getTeamProjects(teamId)
          for (const project of projects) {
            const files = await figmaProvider.getProjectFiles(project.id)
            const match = files.find(
              (f: { name: string; key: string }) => f.name.trim().toUpperCase() === parse.expectedFileName.toUpperCase()
            )
            if (match) {
              return { batch: batchRef, boardId, fileKey: match.key }
            }
          }
        } catch {
          // skip team/project on error
        }
      }
    }
  }

  // 4) Fallback env map
  const map = loadBatchFileMap()
  const fileKey = map[parse.canonicalKey] ?? null

  return { batch: batchRef, boardId, fileKey }
}

/**
 * Synchronous resolve using only env map (no Figma API). Use when async is not possible.
 */
export function resolveBatchTargetSync(
  batch: string | null | undefined,
  options?: { yearHint?: number }
): ResolvedBatchTargetWithParse | null {
  const parse = parseBatchToCanonical(batch, options?.yearHint)
  if (!parse) return null

  const batchLabel = parse.expectedFileName.replace(/\s*-\s*PerformanceAds\s*$/i, '').trim()
  const batchRef: BatchRef = {
    batchKey: parse.canonicalKey,
    batchLabel,
    expectedFileName: parse.expectedFileName,
  }
  const boardId = getMondayBoardId() || null

  // Try warm project file cache first (populated by async resolveBatchTarget calls)
  const cached = getProjectFileCacheSync()
  if (cached) {
    const match = cached.find(
      (f) => f.name.trim().toUpperCase() === parse.expectedFileName.toUpperCase()
    )
    if (match) {
      return { batch: batchRef, boardId, fileKey: match.key, batchParse: parse }
    }
  }

  const map = loadBatchFileMap()
  const fileKey = map[parse.canonicalKey] ?? null
  return { batch: batchRef, boardId, fileKey, batchParse: parse }
}

/**
 * Resolve by canonical key only (when batch already normalized).
 */
export function resolveBatchTargetByCanonicalKey(canonicalKey: string): ResolvedBatchTargetWithParse {
  const [y, m] = canonicalKey.split('-').map(Number)
  const expectedFileName = expectedFileNameFromCanonicalKey(canonicalKey)
  const batchLabel = expectedFileName.replace(/\s*-\s*PerformanceAds\s*$/i, '').trim()
  const batchRef: BatchRef = {
    batchKey: canonicalKey,
    batchLabel,
    expectedFileName,
  }
  const boardId = getMondayBoardId() || null
  const batchParse: BatchParseResult = {
    canonicalKey,
    expectedFileName,
    year: y,
    month: m,
  }

  const cached = getProjectFileCacheSync()
  if (cached) {
    const match = cached.find(
      (f) => f.name.trim().toUpperCase() === expectedFileName.toUpperCase()
    )
    if (match) {
      return { batch: batchRef, boardId, fileKey: match.key, batchParse }
    }
  }

  const map = loadBatchFileMap()
  const fileKey = map[canonicalKey] ?? null
  return { batch: batchRef, boardId, fileKey, batchParse }
}
