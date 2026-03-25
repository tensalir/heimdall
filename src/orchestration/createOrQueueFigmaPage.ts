/**
 * Capability-gated orchestration: attempt server-write path or enqueue for plugin sync.
 * Figma REST API does not support creating/duplicating pages; V1 always queues and uses plugin.
 */

import { logger } from '../../lib/logger.js'
import { getEnv, isDryRun } from '../config/env.js'
import type { BriefingDTO } from '../domain/briefing/schema.js'
import { formatExperimentPageName } from '../domain/briefing/schema.js'
import { resolveFigmaTarget } from './resolveFigmaTarget.js'
import { hasFigmaReadAccess } from '../integrations/figma/restClient.js'
import {
  enqueuePendingSyncJob,
  getJobByIdempotencyKey,
  type PendingSyncJob,
} from '../jobs/pendingFigmaSyncQueue.js'
import {
  buildToolIdempotencyKey,
  buildMondayScopePayload,
} from '../services/integrationExecutionGuard.js'

export type CreateOrQueueOutcome = 'created' | 'queued' | 'skipped' | 'failed'

export interface CreateOrQueueResult {
  outcome: CreateOrQueueOutcome
  idempotencyKey: string
  job?: PendingSyncJob
  /** Human message for logs */
  message: string
  /** Resolved file key if known */
  figmaFileKey: string | null
  expectedFileName: string
}

/**
 * Build idempotency key for Monday status transition. Namespaced under briefing tool.
 */
export function buildIdempotencyKey(mondayItemId: string, statusTransitionId?: string): string {
  const payload = buildMondayScopePayload(mondayItemId, statusTransitionId)
  return buildToolIdempotencyKey('briefing', 'monday', payload)
}

/**
 * Create Figma experiment page (server path) or queue for plugin.
 * V1: server path is disabled (REST cannot create pages); we always queue.
 * When nodeMapping/frameRenames are provided (from mapping agent), the plugin applies them by node name.
 */
export async function createOrQueueFigmaPage(
  briefing: BriefingDTO,
  options: {
    mondayBoardId: string
    idempotencyKey?: string
    statusTransitionId?: string
    nodeMapping?: Array<{ nodeName: string; value: string }>
    frameRenames?: Array<{ oldName: string; newName: string }>
    images?: Array<{ url: string; name: string; source: string; assetId?: string }>
    referenceLinks?: Array<{ url: string; label?: string; source: string }>
    figmaFileKeyOverride?: string
  }
): Promise<CreateOrQueueResult> {
  const idempotencyKey = options.idempotencyKey ?? buildIdempotencyKey(briefing.mondayItemId, options.statusTransitionId)

  const existing = await getJobByIdempotencyKey(idempotencyKey)
  if (existing) {
    logger.info('queue', 'Idempotency hit', {
      idempotencyKey,
      jobId: existing.id,
      state: existing.state,
    })
    return {
      outcome: existing.state === 'completed' ? 'skipped' : 'queued',
      idempotencyKey,
      job: existing,
      message: existing.state === 'completed' ? 'Already completed' : 'Already queued',
      figmaFileKey: existing.figmaFileKey,
      expectedFileName: existing.expectedFileName,
    }
  }

  const target = resolveFigmaTarget(briefing.batchRaw ?? briefing.batchCanonical)
  if (!target) {
    logger.warn('queue', 'Could not resolve batch to monthly file', {
      idempotencyKey,
      batchRaw: briefing.batchRaw,
      batchCanonical: briefing.batchCanonical,
    })
    return {
      outcome: 'failed',
      idempotencyKey,
      message: 'Could not resolve batch to monthly file',
      figmaFileKey: null,
      expectedFileName: '',
    }
  }
  const effectiveFigmaFileKey = options.figmaFileKeyOverride ?? target.figmaFileKey

  if (isDryRun()) {
    return {
      outcome: 'queued',
      idempotencyKey,
      message: '[DRY RUN] Would queue plugin sync',
      figmaFileKey: effectiveFigmaFileKey,
      expectedFileName: target.expectedFileName,
    }
  }

  const serverWriteAvailable = false
  if (serverWriteAvailable && hasFigmaReadAccess()) {
    return {
      outcome: 'created',
      idempotencyKey,
      message: 'Server write path not implemented in V1',
      figmaFileKey: effectiveFigmaFileKey,
      expectedFileName: target.expectedFileName,
    }
  }

  // Merge images from briefing DTO and explicit options (dedup by URL or assetId)
  const allImages = [...(briefing.images ?? []), ...(options.images ?? [])]
  const seenKeys = new Set<string>()
  const dedupImages = allImages.filter((img) => {
    const key = (img.url || img.assetId || '').trim()
    if (key && seenKeys.has(key)) return false
    if (key) seenKeys.add(key)
    return true
  })
  const seenReferenceUrls = new Set<string>()
  const dedupReferenceLinks = (options.referenceLinks ?? []).filter((ref) => {
    const key = (ref.url || '').trim()
    if (!key || seenReferenceUrls.has(key)) return false
    seenReferenceUrls.add(key)
    return true
  })

  const job = await enqueuePendingSyncJob({
    idempotencyKey,
    mondayItemId: briefing.mondayItemId,
    mondayBoardId: options.mondayBoardId,
    batchCanonical: target.batchCanonical,
    figmaFileKey: effectiveFigmaFileKey,
    expectedFileName: target.expectedFileName,
    experimentPageName: formatExperimentPageName(briefing),
    briefingPayload: briefing,
    nodeMapping: options.nodeMapping,
    frameRenames: options.frameRenames,
    images: dedupImages.length > 0 ? dedupImages : undefined,
    referenceLinks: dedupReferenceLinks.length > 0 ? dedupReferenceLinks : undefined,
  })

  logger.info('queue', 'Job enqueued', {
    jobId: job.id,
    mondayItemId: briefing.mondayItemId,
    batchCanonical: target.batchCanonical,
    figmaFileKey: effectiveFigmaFileKey,
  })

  return {
    outcome: 'queued',
    idempotencyKey,
    job,
    message: 'Queued for plugin sync; open the monthly file and run Sync queued briefings',
    figmaFileKey: effectiveFigmaFileKey,
    expectedFileName: target.expectedFileName,
  }
}
