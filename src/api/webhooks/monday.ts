/**
 * Monday webhook handler logic: verify challenge, filter by status, map to briefing, create or queue.
 */

import { getEnv } from '../../config/env.js'
import { logger } from '../../../lib/logger.js'
import type { SyncOutcome } from '../../contracts/integrations.js'
import { buildToolIdempotencyKey, buildMondayScopePayload } from '../../services/integrationExecutionGuard.js'
import { recordIntegrationCall } from '../../services/integrationTelemetry.js'
import { mondayGraphql } from '../../integrations/monday/client.js'
import type { MondayItem } from '../../integrations/monday/client.js'
import { mondayItemToBriefing } from '../../domain/briefing/mondayToBriefing.js'
import { createOrQueueFigmaPage } from '../../orchestration/createOrQueueFigmaPage.js'
import { resolveFigmaTarget } from '../../orchestration/resolveFigmaTarget.js'
import { getTemplateNodeTree } from '../../integrations/figma/templateCache.js'
import { computeNodeMapping } from '../../agents/mappingAgent.js'
import { getDocContent, getDocIdFromColumnValue, getDocImages } from '../../integrations/monday/docReader.js'
import { columnMap, getCol } from '../../integrations/monday/client.js'
import { linkFrontifyAsset, isAssetsColumnEmpty } from '../../services/frontifyAssetLinker.js'
import { getBoardByMondayId, updateItemPipelineStatus, getItemByMondayId } from '../../services/opsBoardStore.js'
import { getSupabase } from '../../../lib/supabase.js'

export interface MondayWebhookPayload {
  challenge?: string
  event?: { type?: string }
  pulseId?: string
  boardId?: string
  userId?: string
  timestamp?: string
  /** Status column update may include new value */
  columnId?: string
  value?: unknown
}

function isEnabled(v: string | undefined): boolean {
  return v === 'true' || v === '1'
}

function parseCsvLower(input: string | undefined): string[] {
  return String(input ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

function normalizeText(v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase()
}

/** Fetch single item by board + item id. Uses Monday API v2 column_values schema. */
export async function getMondayItem(boardId: string, itemId: string): Promise<MondayItem | null> {
  const data = await mondayGraphql<{
    items?: Array<{
      id: string
      name: string
      created_at?: string
      column_values: Array<{
        id: string
        text: string | null
        value: string | null
        type: string
        column: { title: string }
      }>
      assets?: Array<{
        id: string
        name: string
        url?: string
        public_url?: string
        file_extension?: string
        file_size?: number
      }>
    }>
  }>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        created_at
        column_values {
          id
          text
          value
          type
          column { title }
        }
        assets {
          id
          name
          url
          public_url
          file_extension
          file_size
        }
      }
    }`,
    { ids: [itemId] }
  )
  const raw = data?.items?.[0]
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    created_at: raw.created_at ?? undefined,
    column_values: raw.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column.title,
      text: cv.text,
      value: cv.value,
      type: cv.type,
    })),
    assets: raw.assets,
  } as MondayItem
}

/**
 * Verify webhook signature (HMAC) if MONDAY_SIGNING_SECRET is set.
 */
export async function verifyMondayWebhookSignature(payload: string, signature: string | null): Promise<boolean> {
  const secret = getEnv().MONDAY_SIGNING_SECRET
  if (!secret || !signature) return true
  try {
    const crypto = await import('node:crypto')
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Handle Monday webhook body. Returns response shape and outcome.
 */
export async function handleMondayWebhook(body: MondayWebhookPayload): Promise<{
  challenge?: string
  received: boolean
  inserted?: boolean
  outcome?: string
  message?: string
  error?: string
}> {
  if (body.challenge != null) {
    return { challenge: body.challenge, received: true }
  }

  const boardId = String((body as Record<string, string>).boardId ?? (body as Record<string, string>).board_id ?? '')
  const itemId = String((body as Record<string, string>).pulseId ?? (body as Record<string, string>).pulse_id ?? (body as Record<string, string>).item_id ?? '')
  if (!boardId || !itemId) {
    logger.info('webhook', 'Webhook missing boardId or itemId', { boardId: boardId || '-', itemId: itemId || '-' })
    return { received: true }
  }
  const webhookStart = Date.now()
  logger.info('webhook', 'Webhook received', { boardId, itemId })

  const env = getEnv()
  if (env.MONDAY_BOARD_ID && env.MONDAY_BOARD_ID !== boardId) {
    return { received: true }
  }

  const eventType = body.event?.type
  const statusFigmaReady = env.MONDAY_STATUS_FIGMA_READY ?? 'figma_ready'
  const isStatusChange = eventType === 'update' || eventType === 'status_change'
  const isItemCreate = eventType === 'create_pulse'

  if (isItemCreate) {
    const linkResult = await linkFrontifyAsset(boardId, itemId)
    return {
      received: true,
      message: linkResult.ok ? 'Asset link generated' : linkResult.message ?? 'Asset link skipped',
    }
  }

  if (!isStatusChange) {
    return { received: true }
  }

  const item = await getMondayItem(boardId, itemId)
  if (!item) {
    logger.warn('webhook', 'Monday item not found', { boardId, itemId })
    return { received: true, error: 'Item not found' }
  }

  const col = columnMap(item)
  // Frontify asset link: only when status matches MONDAY_ASSETS_STATUS_APPROVED (independent of Figma flow below)
  const approvedStatus = (env.MONDAY_ASSETS_STATUS_APPROVED ?? 'approved').trim().toLowerCase()
  if (
    isAssetsColumnEmpty(item) &&
    normalizeText(getCol(col, 'status')) === approvedStatus
  ) {
    await linkFrontifyAsset(boardId, itemId)
  }

  // Figma flow: uses MONDAY_STATUS_FIGMA_READY / MONDAY_ALLOWED_STATUS_VALUES only
  const enforceFilters = isEnabled(env.MONDAY_ENFORCE_FILTERS)
  if (enforceFilters) {
    const allowedStatuses = parseCsvLower(env.MONDAY_ALLOWED_STATUS_VALUES)
    if (allowedStatuses.length === 0) {
      allowedStatuses.push(normalizeText(statusFigmaReady))
    }
    const allowedTeams = parseCsvLower(env.MONDAY_ALLOWED_TEAM_VALUES)

    const statusValue = normalizeText(getCol(col, 'status'))
    const teamValue = normalizeText(
      getCol(col, 'creation_team', 'creative_team', 'assigned_team', 'team', 'assignee_team')
    )

    if (!statusValue || !allowedStatuses.includes(statusValue)) {
      const msg = `Ignored: status "${statusValue || '-'}" not eligible`
      logger.info('webhook', msg, { mondayItemId: itemId, itemName: item.name })
      return { received: true, message: msg }
    }
    if (allowedTeams.length > 0 && (!teamValue || !allowedTeams.includes(teamValue))) {
      const msg = `Ignored: team "${teamValue || '-'}" not eligible`
      logger.info('webhook', msg, { mondayItemId: itemId, itemName: item.name })
      return { received: true, message: msg }
    }
  }

  // Extract doc images alongside doc content
  const briefRaw = getCol(col, 'brief', 'briefing', 'doc')
  const docId = getDocIdFromColumnValue(briefRaw ?? null)
  let docImages: Awaited<ReturnType<typeof getDocImages>> = []
  if (docId) {
    try {
      docImages = await getDocImages(docId)
    } catch (err) {
      logger.error('webhook', 'Failed to fetch doc images', err as Error, { docId, mondayItemId: itemId })
    }
  }

  const briefing = mondayItemToBriefing(item, { docImages })
  if (!briefing) {
    logger.warn('webhook', 'Batch missing or unparseable', { mondayItemId: itemId, itemName: item.name })
    return { received: true, message: 'Batch missing or unparseable' }
  }

  const timestamp = (body as Record<string, string>).timestamp ?? new Date().toISOString()
  const idempotencyKey = buildToolIdempotencyKey(
    'briefing',
    'monday',
    buildMondayScopePayload(itemId, timestamp)
  )

  let nodeMapping: Array<{ nodeName: string; value: string }> | undefined
  let frameRenames: Array<{ oldName: string; newName: string }> | undefined
  const target = resolveFigmaTarget(briefing.batchRaw ?? briefing.batchCanonical)
  if (target?.figmaFileKey) {
    const mappingTimer = logger.time('mapping', 'Webhook mapping agent')
    try {
      const tree = await getTemplateNodeTree(target.figmaFileKey)
      let mondayDocContent: string | null = null
      if (docId) mondayDocContent = await getDocContent(docId)
      const mapping = await computeNodeMapping(item, tree, {
        mondayDocContent: mondayDocContent ?? undefined,
      })
      nodeMapping = mapping.textMappings
      frameRenames = mapping.frameRenames
      mappingTimer.done({
        mondayItemId: itemId,
        textMappingsCount: mapping.textMappings.length,
        frameRenamesCount: mapping.frameRenames.length,
      })
    } catch (err) {
      logger.error('mapping', 'Mapping agent failed; using briefing fallback', err as Error, {
        mondayItemId: itemId,
        figmaFileKey: target.figmaFileKey,
      })
    }
  }

  const result = await createOrQueueFigmaPage(briefing, {
    mondayBoardId: boardId,
    idempotencyKey,
    statusTransitionId: timestamp,
    nodeMapping,
    frameRenames,
  })

  logger.info('queue', 'Webhook job outcome', {
    mondayItemId: itemId,
    outcome: result.outcome,
    jobId: result.job?.id,
    experimentPageName: result.job?.experimentPageName,
  })

  const syncOutcome: SyncOutcome = {
    status: result.outcome,
    idempotencyKey,
    message: result.message ?? '',
    fileKey: result.figmaFileKey,
    jobId: result.job?.id,
  }
  recordIntegrationCall({
    tool: 'briefing',
    provider: 'monday',
    operation: 'webhook_process',
    durationMs: Date.now() - webhookStart,
    outcome: result.outcome === 'queued' || result.outcome === 'created' ? 'ok' : result.outcome === 'skipped' ? 'skipped' : 'error',
    idempotencyKey,
    resourceId: itemId,
  })

  // Update ops_board_items if this board is tracked
  try {
    const opsBoard = await getBoardByMondayId(boardId)
    if (opsBoard) {
      const pipelineStatus =
        result.outcome === 'queued' || result.outcome === 'created' ? 'queued' as const
        : result.outcome === 'skipped' ? 'synced' as const
        : 'failed' as const

      const existing = await getItemByMondayId(itemId, boardId)
      if (existing) {
        await updateItemPipelineStatus(itemId, boardId, pipelineStatus, {
          figma_file_key: result.figmaFileKey ?? undefined,
          queued_at: pipelineStatus === 'queued' ? new Date().toISOString() : undefined,
        })
      } else {
        const db = getSupabase()
        if (db) {
          await db.from('ops_board_items').upsert({
            board_id: opsBoard.id,
            monday_item_id: itemId,
            monday_board_id: boardId,
            item_name: item.name,
            experiment_name: briefing.experimentName,
            batch_canonical: briefing.batchCanonical,
            batch_raw: briefing.batchRaw,
            section_name: briefing.sectionName ?? null,
            monday_status: getCol(col, 'status'),
            pipeline_status: pipelineStatus,
            figma_file_key: result.figmaFileKey ?? null,
            queued_at: pipelineStatus === 'queued' ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'monday_item_id,monday_board_id' })
        }
      }
    }
  } catch (err) {
    logger.error('webhook', 'Failed to update ops_board_items', err as Error, { itemId, boardId })
  }

  return {
    received: true,
    inserted: result.outcome === 'queued' || result.outcome === 'created',
    outcome: syncOutcome.status,
    message: syncOutcome.message,
  }
}

/**
 * Queue a briefing for a Monday item. Used by webhook and manual API.
 * Returns createOrQueue result for API responses.
 */
export async function queueMondayItem(
  boardId: string,
  itemId: string,
  options?: { idempotencySuffix?: string; disableAiMapping?: boolean }
): Promise<{
  outcome: string
  message: string
  job?: { id: string; experimentPageName: string; figmaFileKey?: string }
  error?: string
}> {
  const item = await getMondayItem(boardId, itemId)
  if (!item) {
    return { outcome: 'failed', message: 'Item not found', error: 'Item not found' }
  }

  // Extract doc images alongside doc content
  const qCol = columnMap(item)
  const qBriefRaw = getCol(qCol, 'brief', 'briefing', 'doc')
  const qDocId = getDocIdFromColumnValue(qBriefRaw ?? null)
  let qDocImages: Awaited<ReturnType<typeof getDocImages>> = []
  if (qDocId) {
    try {
      qDocImages = await getDocImages(qDocId)
    } catch (err) {
      logger.error('webhook', 'Manual queue: failed to fetch doc images', err as Error, { docId: qDocId, itemId })
    }
  }

  const briefing = mondayItemToBriefing(item, { docImages: qDocImages })
  if (!briefing) {
    return { outcome: 'failed', message: 'Batch missing or unparseable', error: 'Batch missing' }
  }

  const suffix = options?.idempotencySuffix ?? `manual-${Date.now()}`
  const idempotencyKey = buildToolIdempotencyKey(
    'briefing',
    'monday',
    buildMondayScopePayload(itemId, suffix)
  )

  let nodeMapping: Array<{ nodeName: string; value: string }> | undefined
  let frameRenames: Array<{ oldName: string; newName: string }> | undefined
  const target = resolveFigmaTarget(briefing.batchRaw ?? briefing.batchCanonical)
  if (target?.figmaFileKey) {
    try {
      const tree = await getTemplateNodeTree(target.figmaFileKey)
      const mondayDocContent = qDocId ? await getDocContent(qDocId) : null
      const mapping = await computeNodeMapping(item, tree, {
        mondayDocContent: mondayDocContent ?? undefined,
        disableAi: options?.disableAiMapping === true,
      })
      nodeMapping = mapping.textMappings
      frameRenames = mapping.frameRenames
    } catch (err) {
      logger.error('mapping', 'Manual queue: mapping agent failed', err as Error, { itemId })
    }
  }

  const result = await createOrQueueFigmaPage(briefing, {
    mondayBoardId: boardId,
    idempotencyKey,
    statusTransitionId: suffix,
    nodeMapping,
    frameRenames,
  })

  return {
    outcome: result.outcome,
    message: result.message ?? '',
    job: result.job
      ? {
          id: result.job.id,
          experimentPageName: result.job.experimentPageName,
          figmaFileKey: result.figmaFileKey ?? undefined,
        }
      : undefined,
  }
}
