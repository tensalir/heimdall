import { NextRequest, NextResponse } from 'next/server'
import { getEnv } from '@/src/config/env'
import { readMondayBoardItems } from '@/src/services/mondayBoardReader'
import type { MondayBoardItemRow } from '@/src/services/mondayBoardReader'
import { parseBatchToCanonical } from '@/src/domain/routing/batchToFile'
import {
  appendImportEvent,
  getSyncsForFile,
  upsertSync,
} from '@/src/services/briefingSyncStore'
import { getProjectFiles } from '@/src/integrations/figma/restClient'
import { updateItemPipelineStatus } from '@/src/services/opsBoardStore'
import {
  coerceLegacyPageSummaries,
  matchLegacyBriefingPages,
} from '@/src/services/briefingLegacyPageMatcher'

export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '9147622374'

function buildSyncFileRef(fileKey: string, fileName: string): string {
  const key = fileKey.trim()
  if (key) return key
  const name = fileName.trim().toLowerCase()
  if (!name) return ''
  return `name:${name}`
}

const PERF_ADS_PROJECT_ID = '387033831'

function loadBatchFileMap(): Record<string, string> {
  const raw = getEnv().HEIMDALL_BATCH_FILE_MAP
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

/**
 * Build a batch→fileKey map by combining Figma project auto-discovery with env overrides.
 * Project files are matched by expected file name ("MONTH YEAR - PerformanceAds").
 */
async function loadCombinedBatchMap(): Promise<Record<string, string>> {
  const envMap = loadBatchFileMap()
  try {
    const files = await getProjectFiles(PERF_ADS_PROJECT_ID)
    for (const f of files) {
      const p = parseBatchToCanonical(f.name.replace(/\s*-\s*PerformanceAds\s*$/i, '').trim())
      if (p && !envMap[p.canonicalKey]) {
        envMap[p.canonicalKey] = f.key
      }
    }
  } catch {
    // Figma API unavailable; env map is the fallback
  }
  return envMap
}

/** Build column map from board row (title -> value). */
function rowToColumnMap(row: MondayBoardItemRow): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const cv of row.column_values ?? []) {
    const title = cv.title ?? (cv as { column?: { title?: string } }).column?.title ?? cv.id
    const key = String(title).toLowerCase().replace(/\s+/g, '_')
    let val: string | null = null
    if (cv.text != null && String(cv.text).trim() !== '') {
      val = String(cv.text).trim()
    } else if (cv.value != null) {
      try {
        const p = JSON.parse(cv.value) as { text?: string }
        if (p && typeof p === 'object' && p.text != null) val = String(p.text).trim()
        else if (typeof p === 'string') val = p
      } catch {
        val = String(cv.value)
      }
    }
    if (val !== null) out[key] = val
  }
  return out
}

function getColFromRow(col: Record<string, string | null>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = col[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

function parseCsvLower(value: string | undefined): string[] {
  if (!value || !value.trim()) return []
  return value
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/** Parse fileName to batch canonical (e.g. "APRIL 2026 - PerformanceAds" -> "2026-04"). */
function parseFileNameToBatch(fileName: string): string | null {
  const beforeSuffix = fileName.split(/\s*-\s*/)[0]?.trim() ?? fileName
  const parsed = parseBatchToCanonical(beforeSuffix)
  return parsed?.canonicalKey ?? null
}

function hasConcretePageId(value: { figma_page_id: string | null } | undefined): boolean {
  return value?.figma_page_id != null && String(value.figma_page_id).trim() !== ''
}

/**
 * POST /api/plugin/briefings
 * Body: { fileName: string, fileKey: string, batch?: string }
 * Returns filtered Monday items for the detected (or selected) batch, with sync status.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const fileName = String(body.fileName ?? '').trim()
    const fileKey = String(body.fileKey ?? '').trim()
    const syncFileRef = buildSyncFileRef(fileKey, fileName)
    const explicitBatch = body.batch ? String(body.batch).trim() : undefined
    const legacyPages = coerceLegacyPageSummaries(body.pages)

    const env = getEnv()
    const statusAllowlist = parseCsvLower(env.PLUGIN_FILTER_STATUS ?? 'brief ready,approved,ready')
    const partnerAllowlist = parseCsvLower(
      env.PLUGIN_FILTER_CREATIVE_PARTNER ?? 'studio,content creation'
    )

    let batchCanonical: string | null = null
    let availableBatches: string[] = []

    if (explicitBatch) {
      batchCanonical = explicitBatch
    } else {
      const fromFileName = parseFileNameToBatch(fileName)
      if (fromFileName) {
        batchCanonical = fromFileName
      } else {
        const map = await loadCombinedBatchMap()
        const matching = fileKey
          ? Object.entries(map)
              .filter(([, v]) => v === fileKey)
              .map(([k]) => k)
          : Object.keys(map)
        if (matching.length === 1) {
          batchCanonical = matching[0]
        } else if (matching.length > 1) {
          availableBatches = matching.sort()
          return NextResponse.json({
            needsBatchSelection: true,
            availableBatches,
            batchLabels: availableBatches.map((k) => {
              const p = parseBatchToCanonical(k)
              return p ? `${p.expectedFileName.split(' - ')[0] ?? k}` : k
            }),
          })
        } else {
          const allMapKeys = Object.keys(map).sort()
          if (allMapKeys.length > 0) {
            return NextResponse.json({
              needsBatchSelection: true,
              availableBatches: allMapKeys,
              batchLabels: allMapKeys.map((k) => {
                const p = parseBatchToCanonical(k)
                return p ? `${p.expectedFileName.split(' - ')[0] ?? k}` : k
              }),
            })
          }
          return NextResponse.json({
            needsBatchSelection: true,
            availableBatches: [],
            error: 'Could not detect batch for this file. Select a batch or use a file named like "APRIL 2026 - PerformanceAds".',
          })
        }
      }
    }

    const allItems = await readMondayBoardItems(BOARD_ID)
    const parsedRows = allItems.map((row) => {
      const col = rowToColumnMap(row)
      const batchRaw = getColFromRow(col, 'batch', 'batch_name')
      const parsed = batchRaw ? parseBatchToCanonical(batchRaw) : null

      const statusVal = getColFromRow(col, 'status')
      const statusNorm = statusVal?.toLowerCase() ?? ''
      const statusMatch =
        statusAllowlist.length === 0 ||
        statusAllowlist.some((a) => statusNorm.includes(a) || a.includes(statusNorm))

      const partnerVal = getColFromRow(
        col,
        'creative_partner',
        'creatives',
        'creation_team',
        'creative_team',
        'assigned_team',
        'team',
        'assignee_team'
      )
      const partnerNorm = partnerVal?.toLowerCase() ?? ''
      const partnerMatch =
        partnerAllowlist.length === 0 ||
        partnerAllowlist.some((a) => partnerNorm.includes(a) || a.includes(partnerNorm))

      return {
        row,
        parsed,
        statusVal,
        statusMatch,
        partnerMatch,
      }
    })

    if (fileKey && legacyPages.length > 0) {
      const existingSyncs = await getSyncsForFile(fileKey)
      const syncedItemIds = new Set(
        existingSyncs
          .filter((sync) => hasConcretePageId(sync))
          .map((sync) => sync.monday_item_id)
      )
      const backfillCandidates = parsedRows
        .filter((entry) => entry.parsed && entry.statusMatch && entry.partnerMatch)
        .map((entry) => ({
          mondayItemId: entry.row.id,
          mondayBoardId: BOARD_ID,
          mondayItemName: entry.row.name,
          batchCanonical: entry.parsed!.canonicalKey,
        }))

      const matches = matchLegacyBriefingPages(backfillCandidates, legacyPages).filter(
        (match) => !syncedItemIds.has(match.item.mondayItemId)
      )

      if (matches.length > 0) {
        await Promise.allSettled(
          matches.map(async (match) => {
            const sync = await upsertSync({
              mondayItemId: match.item.mondayItemId,
              mondayBoardId: match.item.mondayBoardId,
              mondayItemName: match.item.mondayItemName,
              batchCanonical: match.item.batchCanonical,
              figmaFileKey: fileKey,
              figmaPageId: match.page.pageId,
              figmaPageName: match.page.pageName,
            })
            if (!sync) return

            await appendImportEvent({
              mondayItemId: match.item.mondayItemId,
              mondayBoardId: match.item.mondayBoardId,
              mondayItemName: match.item.mondayItemName,
              batchCanonical: match.item.batchCanonical,
              figmaFileKey: fileKey,
              figmaPageId: match.page.pageId,
              figmaPageName: match.page.pageName,
              source: 'plugin_sync',
              outcome: 'completed',
              reason:
                match.matchType === 'plugin_data'
                  ? 'Backfilled existing populated page using Heimdall plugin data'
                  : 'Backfilled existing populated page using exact page name match',
            })

            await updateItemPipelineStatus(match.item.mondayItemId, match.item.mondayBoardId, 'synced', {
              figma_file_key: fileKey,
              figma_page_id: match.page.pageId,
              synced_at: new Date().toISOString(),
            })
          })
        )
      }
    }

    const syncs = syncFileRef ? await getSyncsForFile(syncFileRef) : []
    const syncByItemId = new Map(syncs.map((s) => [s.monday_item_id, s]))

    const items: Array<{
      id: string
      name: string
      batch: string
      status: string
      syncState: 'new' | 'synced' | 'changed'
    }> = []

    for (const entry of parsedRows) {
      const { row, parsed, statusVal, statusMatch, partnerMatch } = entry
      if (!parsed || parsed.canonicalKey !== batchCanonical) continue
      if (!statusMatch || !partnerMatch) continue

      const existing = syncByItemId.get(row.id)
      let syncState: 'new' | 'synced' | 'changed' = 'new'
      if (existing && hasConcretePageId(existing)) {
        syncState = 'synced'
        // TODO: compare monday_snapshot for "changed" when versioning is implemented
      }

      items.push({
        id: row.id,
        name: row.name,
        batch: parsed.canonicalKey,
        status: statusVal ?? '',
        syncState,
      })
    }

    const batchLabel =
      batchCanonical && parseBatchToCanonical(batchCanonical)
        ? parseBatchToCanonical(batchCanonical)!.expectedFileName.split(' - ')[0] ?? batchCanonical
        : batchCanonical ?? ''
    return NextResponse.json({
      batch: batchCanonical,
      batchLabel,
      itemCount: items.length,
      items,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
