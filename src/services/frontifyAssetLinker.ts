/**
 * Orchestrates Frontify asset linking: generate URL from experiment code,
 * optionally check/create folder in Frontify, write URL to Monday Assets column.
 */

import { logger } from '../../lib/logger.js'
import { getMondayItem } from '../api/webhooks/monday.js'
import { updateColumnValue } from '../integrations/monday/client.js'
import { columnMap, getCol } from '../integrations/monday/client.js'
import { frontifyProvider } from '../integrations/providers/frontifyProvider.js'
import { isDryRun } from '../config/env.js'

function parseCsv(input: string | undefined): string[] {
  return String(input ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function isBoardEnabledForAssetLinking(boardId: string): boolean {
  const allowed = process.env.MONDAY_ASSETS_BOARD_IDS
  if (!allowed) return true
  const ids = parseCsv(allowed)
  return ids.length === 0 || ids.includes(boardId)
}

/** Normalized status that triggers the Assets link only. Not used by Monday→Figma flow. */
function normalizedApprovedStatus(): string {
  return (process.env.MONDAY_ASSETS_STATUS_APPROVED ?? 'approved').trim().toLowerCase()
}

/**
 * Extract experiment code from item name.
 * Item names follow "EXP-LM148.TargetRepurposing-Mix-Mix" format;
 * the code is the prefix before the first dot (e.g. "EXP-LM148").
 * Items that don't start with "EXP-" or "CAM-" are skipped.
 */
function experimentCodeFromItemName(itemName: string): string | null {
  const name = itemName.trim()
  if (!name) return null
  const upper = name.toUpperCase()
  if (!upper.startsWith('EXP-') && !upper.startsWith('CAM-')) return null
  const dotIndex = name.indexOf('.')
  return dotIndex > 0 ? name.slice(0, dotIndex) : name
}

/**
 * Link Frontify asset URL for a Monday item: build URL from item name,
 * optionally ensure folder exists in Frontify, write URL to Assets column.
 */
export async function linkFrontifyAsset(
  boardId: string,
  itemId: string
): Promise<{ ok: boolean; url?: string; message?: string }> {
  const assetsColumnId = process.env.MONDAY_ASSETS_COLUMN_ID
  if (!assetsColumnId) {
    logger.info('integration', 'Asset linking skipped: MONDAY_ASSETS_COLUMN_ID not set', {
      boardId,
      itemId,
    })
    return { ok: false, message: 'MONDAY_ASSETS_COLUMN_ID not set' }
  }

  if (!isBoardEnabledForAssetLinking(boardId)) {
    return { ok: false, message: 'Board not in MONDAY_ASSETS_BOARD_IDS' }
  }

  const item = await getMondayItem(boardId, itemId)
  if (!item) {
    logger.warn('integration', 'Monday item not found', { boardId, itemId })
    return { ok: false, message: 'Item not found' }
  }

  const col = columnMap(item)
  const statusValue = (getCol(col, 'status') ?? '').trim().toLowerCase()
  const approvedStatus = normalizedApprovedStatus()
  if (statusValue !== approvedStatus) {
    logger.info('integration', 'Asset linking skipped: status is not Approved', {
      boardId,
      itemId,
      status: statusValue || '(empty)',
    })
    return { ok: false, message: 'Status is not Approved' }
  }

  const experimentCode = experimentCodeFromItemName(item.name)
  if (!experimentCode) {
    return { ok: false, message: 'Item name empty' }
  }

  const url = frontifyProvider.buildAssetUrl(experimentCode)

  if (frontifyProvider.isConfigured()) {
    try {
      const existing = await frontifyProvider.searchFolder(experimentCode)
      if (!existing) {
        const created = await frontifyProvider.createFolder(experimentCode)
        if (created) {
          logger.info('integration', 'Created Frontify folder', {
            experimentCode,
            folderId: created.id,
          })
        }
      }
    } catch (err) {
      logger.error('integration', 'Frontify folder check/create failed', err as Error, {
        experimentCode,
      })
      // Continue to write URL to Monday
    }
  }

  if (isDryRun()) {
    logger.info('integration', 'Dry run: would set Assets column', { itemId, url })
    return { ok: true, url }
  }

  const linkJson = JSON.stringify({ url, text: experimentCode })
  const updated = await updateColumnValue(boardId, itemId, assetsColumnId, linkJson)
  if (!updated) {
    logger.error('integration', 'Failed to update Monday Assets column', new Error('updateColumnValue returned false'), {
      boardId,
      itemId,
    })
    return { ok: false, message: 'Failed to update column' }
  }

  logger.info('integration', 'Assets column updated', { itemId, url })
  return { ok: true, url }
}

/**
 * Return true if the item's Assets column (by title or configured column id) is empty.
 */
export function isAssetsColumnEmpty(item: { column_values?: Array<{ id: string; title?: string; text?: string; value?: string }> }): boolean {
  const col = columnMap(item as import('../integrations/monday/client.js').MondayItem)
  const assetsValue = getCol(col, 'frontify_assets', 'assets', 'asset')
  if (assetsValue && String(assetsValue).trim() !== '') return false
  const columnId = process.env.MONDAY_ASSETS_COLUMN_ID
  if (!columnId || !item.column_values) return true
  const cv = item.column_values.find((c) => c.id === columnId)
  if (!cv) return true
  const text = cv.text ?? ''
  if (text.trim() !== '') return false
  const raw = cv.value ? String(cv.value).trim() : ''
  if (!raw || raw === '{}' || raw === '""' || raw === 'null') return true
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return !parsed.url || String(parsed.url).trim() === ''
  } catch {
    return !raw
  }
}
