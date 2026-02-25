'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LayoutGrid,
  Play,
  ExternalLink,
  Download,
  Plus,
  X,
  Check,
  FileDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'pending' | 'in_review' | 'approved' | 'synced'

const STATUS_TAB_MAP: Record<StatusFilter, string[]> = {
  all: [],
  pending: ['draft', 'queued'],
  in_review: ['edited'],
  approved: ['approved'],
  synced: ['synced_to_monday'],
}

const STATUS_TAB_LABELS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_review', label: 'In Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'synced', label: 'Synced' },
]

function downloadAssignmentsCsv(rows: { briefName: string; productOrUseCase: string; source?: string; format: string; funnel: string; agencyRef: string; assetCount: number; status?: string }[]) {
  const header = ['Name', 'Product', 'Source', 'Format', 'Funnel', 'Agency', 'Assets', 'Status'].join(',')
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const body = rows.map((r) => [esc(r.briefName), esc(r.productOrUseCase), esc(r.source ?? 'split'), esc(r.format), esc(r.funnel), esc(r.agencyRef), r.assetCount, esc(r.status ?? 'draft')].join(',')).join('\n')
  const csv = `${header}\n${body}`
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `briefing-assignments-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
import { BriefingGeneratorPanel } from './BriefingGeneratorPanel'
import { BriefingWorkingDocPanel } from './BriefingWorkingDocPanel'
import { BriefingAssignmentsTable, type AssignmentRow, type AssignmentPatch } from './BriefingAssignmentsTable'
import type { BriefingAssignment, WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import type { SplitOutput } from '@/src/domain/briefingAssistant/split'

const DEFAULT_BATCH_KEY = '2026-01'
const DEFAULT_BATCH_LABEL = 'January 2026'
const DEFAULT_TOTAL_ASSETS = 210
const DEFAULT_MAX_BRIEFS = 53

export interface SprintBatch {
  batch_key: string
  batch_label: string
  batch_type?: string
  monday_board_id: string | null
  figma_file_key: string | null
}

interface PersistedAssignment {
  id: string
  batchKey: string
  briefName: string
  productOrUseCase: string
  agencyRef: string
  assetCount: number
  format: string
  funnel: string
  contentBucket: string
  mondayItemId?: string
  figmaPageUrl?: string
  status?: string
  source?: string
  targetBoardId?: string | null
  workingDocSections?: WorkingDocSections
}

interface MondayBoardItem {
  id: string
  name: string
  group: string | null
  columnValues: Record<string, string>
}

export interface BriefingAssistantSheetProps {
  sprintId?: string
  sprintData?: { name: string; batches: SprintBatch[] } | null
  initialAssignments?: PersistedAssignment[] | null
  onSprintUpdated?: () => void
}

export function BriefingAssistantSheet({
  sprintId,
  sprintData,
  initialAssignments,
  onSprintUpdated,
}: BriefingAssistantSheetProps = {}) {
  const [splitResult, setSplitResult] = useState<SplitOutput | null>(null)
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null)
  const [workingDocOpen, setWorkingDocOpen] = useState(false)
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importDrawerOpen, setImportDrawerOpen] = useState(false)
  const [importBatchKey, setImportBatchKey] = useState<string | null>(null)
  const [boardItems, setBoardItems] = useState<MondayBoardItem[]>([])
  const [boardItemsLoading, setBoardItemsLoading] = useState(false)
  const [selectedMondayIds, setSelectedMondayIds] = useState<Set<string>>(new Set())
  const [importSaving, setImportSaving] = useState(false)
  const [feedbackStatusMap, setFeedbackStatusMap] = useState<Record<string, { hasExperiment: boolean; roles: string[]; sentToMonday: boolean }>>({})
  const [activeTab, setActiveTab] = useState<'split' | 'briefings'>('briefings')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  /** Last datasource IDs used in the toolbar (for generate-briefing so both flows use same sources). */
  const [lastUsedDatasources, setLastUsedDatasources] = useState<string[]>([])

  const firstBatch = sprintData?.batches?.[0]
  const [batchKey, setBatchKey] = useState(firstBatch?.batch_key ?? DEFAULT_BATCH_KEY)
  const [batchLabel, setBatchLabel] = useState(firstBatch?.batch_label ?? DEFAULT_BATCH_LABEL)
  const [totalAssets, setTotalAssets] = useState(DEFAULT_TOTAL_ASSETS)
  const [maxBriefs, setMaxBriefs] = useState(DEFAULT_MAX_BRIEFS)

  const runSplit = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/briefing-assistant/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchKey,
          batchLabel,
          totalAssets,
          maxBriefs,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Split failed')
        return
      }
      setSplitResult(data)
      setSelectedAssignmentId(data.assignments?.[0]?.id ?? null)

      if (sprintId && data.assignments?.length) {
        const saveRes = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_key: batchKey,
            batch_label: batchLabel,
            assignments: data.assignments,
          }),
        })
        if (saveRes.ok) onSprintUpdated?.()
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [batchKey, batchLabel, totalAssets, maxBriefs, sprintId, onSprintUpdated])

  const batchesWithBoard = (sprintData?.batches ?? []).filter((b) => b.monday_board_id)
  const fetchBoardItems = useCallback(async (boardId: string) => {
    setBoardItemsLoading(true)
    setBoardItems([])
    setSelectedMondayIds(new Set())
    try {
      const res = await fetch(`/api/briefing-assistant/board-items?board_id=${encodeURIComponent(boardId)}`)
      const data = await res.json()
      if (res.ok && Array.isArray(data.items)) {
        setBoardItems(data.items)
      } else {
        setBoardItems([])
      }
    } catch {
      setBoardItems([])
    } finally {
      setBoardItemsLoading(false)
    }
  }, [])

  const existingMondayIds = new Set((initialAssignments ?? []).map((a) => a.mondayItemId).filter(Boolean) as string[])

  const normalizeBucket = (v: string): 'bau' | 'native_style' | 'experimental' => {
    const s = (v ?? 'bau').toString().toLowerCase().replace(/\s+/g, '_')
    if (s === 'native_style' || s === 'experimental') return s
    return 'bau'
  }

  const handleImportConfirm = useCallback(async () => {
    const batch = sprintData?.batches?.find((b) => b.batch_key === importBatchKey)
    if (!sprintId || !batch || selectedMondayIds.size === 0) return
    setImportSaving(true)
    try {
      const existingForBatch = (initialAssignments ?? []).filter((a) => a.batchKey === importBatchKey)
      const newRows = boardItems
        .filter((item) => selectedMondayIds.has(item.id))
        .map((item) => {
          const cv = item.columnValues
          return {
            id: crypto.randomUUID(),
            contentBucket: normalizeBucket(cv.content_bucket ?? cv.bucket ?? 'bau'),
            ideationStarter: '',
            productOrUseCase: cv.product ?? cv.product_or_use_case ?? cv.use_case ?? item.name ?? '—',
            briefOwner: '',
            agencyRef: cv.agency ?? cv.agency_ref ?? '',
            assetCount: Math.max(1, parseInt(cv.asset_count ?? cv.assets ?? '4', 10) || 4),
            format: cv.format ?? 'static',
            funnel: (cv.funnel ?? 'tof').toLowerCase(),
            batchKey: importBatchKey,
            briefName: item.name,
            source: 'imported' as const,
            mondayItemId: item.id,
            targetBoardId: batch.monday_board_id,
          }
        })
      const toSave = [
        ...existingForBatch.map((a) => ({
          id: a.id,
          contentBucket: a.contentBucket as 'bau' | 'native_style' | 'experimental',
          ideationStarter: '',
          productOrUseCase: a.productOrUseCase,
          briefOwner: '',
          agencyRef: a.agencyRef,
          assetCount: a.assetCount,
          format: a.format,
          funnel: a.funnel,
          batchKey: a.batchKey,
          briefName: a.briefName,
          source: (a.source ?? 'split') as 'split' | 'imported' | 'manual',
          mondayItemId: a.mondayItemId,
          targetBoardId: a.targetBoardId ?? null,
        })),
        ...newRows.map((a) => ({
          id: a.id,
          contentBucket: a.contentBucket,
          ideationStarter: a.ideationStarter,
          productOrUseCase: a.productOrUseCase,
          briefOwner: a.briefOwner,
          agencyRef: a.agencyRef,
          assetCount: a.assetCount,
          format: a.format,
          funnel: a.funnel,
          batchKey: a.batchKey,
          briefName: a.briefName,
          source: 'imported' as const,
          mondayItemId: a.mondayItemId,
          targetBoardId: a.targetBoardId,
        })),
      ]
      const res = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch_key: importBatchKey,
          batch_label: batch.batch_label,
          assignments: toSave.map((a) => ({
            id: a.id,
            contentBucket: a.contentBucket,
            ideationStarter: a.ideationStarter,
            productOrUseCase: a.productOrUseCase,
            briefOwner: a.briefOwner,
            agencyRef: a.agencyRef,
            assetCount: a.assetCount,
            format: a.format,
            funnel: a.funnel,
            batchKey: a.batchKey,
            briefName: a.briefName,
            source: a.source ?? 'split',
            mondayItemId: a.mondayItemId ?? undefined,
            targetBoardId: a.targetBoardId ?? undefined,
          })),
        }),
      })
      if (res.ok) {
        setImportDrawerOpen(false)
        setSelectedMondayIds(new Set())
        onSprintUpdated?.()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Import failed')
      }
    } catch {
      setError('Import failed')
    } finally {
      setImportSaving(false)
    }
  }, [sprintId, importBatchKey, selectedMondayIds, boardItems, sprintData?.batches, initialAssignments, onSprintUpdated])

  const handleNewBrief = useCallback(async () => {
    const batch = sprintData?.batches?.find((b) => b.batch_key === batchKey) ?? firstBatch
    const useBatchKey = batch?.batch_key ?? batchKey
    const useBatchLabel = batch?.batch_label ?? batchLabel
    if (!sprintId) return
    const newRow: BriefingAssignment = {
      id: crypto.randomUUID(),
      contentBucket: 'bau',
      ideationStarter: '',
      productOrUseCase: '—',
      briefOwner: '',
      agencyRef: '',
      assetCount: 4,
      format: 'static',
      funnel: 'tof',
      batchKey: useBatchKey,
      briefName: `New brief ${(initialAssignments?.length ?? 0) + 1}`,
      source: 'manual',
    }
    const existingForBatch = (initialAssignments ?? []).filter((a) => a.batchKey === useBatchKey)
    const toSave = [...existingForBatch, { ...newRow, source: 'manual' as const, targetBoardId: batch?.monday_board_id ?? null }]
    const res = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batch_key: useBatchKey,
        batch_label: useBatchLabel,
        assignments: toSave.map((a) => ({
          id: a.id,
          contentBucket: a.contentBucket,
          ideationStarter: '',
          productOrUseCase: a.productOrUseCase,
          briefOwner: '',
          agencyRef: a.agencyRef,
          assetCount: a.assetCount,
          format: a.format,
          funnel: a.funnel,
          batchKey: a.batchKey,
          briefName: a.briefName,
          source: a.source ?? 'split',
          mondayItemId: a.mondayItemId,
          targetBoardId: a.targetBoardId ?? null,
        })),
      }),
    })
    if (res.ok) onSprintUpdated?.()
    else setError('Failed to add brief')
  }, [sprintId, batchKey, batchLabel, firstBatch, sprintData?.batches, initialAssignments, onSprintUpdated])

  const fromInitial = (initialAssignments ?? []).map((a) => ({
    id: a.id,
    contentBucket: a.contentBucket as 'bau' | 'native_style' | 'experimental',
    ideationStarter: '',
    productOrUseCase: a.productOrUseCase,
    briefOwner: '',
    agencyRef: a.agencyRef,
    assetCount: a.assetCount,
    format: a.format,
    funnel: a.funnel,
    batchKey: a.batchKey,
    briefName: a.briefName,
    source: (a.source ?? 'split') as 'split' | 'imported' | 'manual',
    targetBoardId: a.targetBoardId ?? undefined,
  }))
  const fromSplit = splitResult?.assignments ?? []
  const assignments: BriefingAssignment[] = fromSplit.length > 0 ? fromSplit : fromInitial
  const initialMap = new Map((initialAssignments ?? []).map((a) => [a.id, a]))
  const assignmentsWithLinks: AssignmentRow[] = assignments.map((a) => {
    const ext = initialMap.get(a.id)
    return {
      ...a,
      mondayItemId: ext?.mondayItemId,
      figmaPageUrl: ext?.figmaPageUrl,
      targetBoardId: ext?.targetBoardId ?? a.targetBoardId,
      workingDocSections: ext?.workingDocSections,
    }
  })
  const batchBoardMap: Record<string, string> = {}
  for (const b of sprintData?.batches ?? []) {
    if (b.monday_board_id) batchBoardMap[b.batch_key] = b.monday_board_id
  }
  const availableBoards = (sprintData?.batches ?? []).filter((b) => b.monday_board_id).map((b) => ({ batch_key: b.batch_key, label: b.batch_label, board_id: b.monday_board_id! }))
  const selected = assignmentsWithLinks.find((a) => a.id === selectedAssignmentId)

  const statusCounts: Record<StatusFilter, number> = {
    all: assignmentsWithLinks.length,
    pending: assignmentsWithLinks.filter((a) => !a.status || a.status === 'draft' || a.status === 'queued').length,
    in_review: assignmentsWithLinks.filter((a) => a.status === 'edited').length,
    approved: assignmentsWithLinks.filter((a) => a.status === 'approved').length,
    synced: assignmentsWithLinks.filter((a) => a.status === 'synced_to_monday').length,
  }

  const filteredAssignments = statusFilter === 'all'
    ? assignmentsWithLinks
    : assignmentsWithLinks.filter((a) => {
        const s = a.status ?? 'draft'
        return STATUS_TAB_MAP[statusFilter].includes(s) || (statusFilter === 'pending' && !a.status)
      })

  const mondayItemIdsForFeedback = (initialAssignments ?? [])
    .map((a) => a.mondayItemId)
    .filter(Boolean) as string[]
  const feedbackIdsKey = [...new Set(mondayItemIdsForFeedback)].sort().join(',')
  useEffect(() => {
    if (!feedbackIdsKey) {
      setFeedbackStatusMap({})
      return
    }
    const ids = feedbackIdsKey.split(',').filter(Boolean)
    let cancelled = false
    fetch('/api/briefing-assistant/feedback-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monday_item_ids: ids }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.statusByItem) setFeedbackStatusMap(data.statusByItem)
      })
      .catch(() => { if (!cancelled) setFeedbackStatusMap({}) })
    return () => { cancelled = true }
  }, [feedbackIdsKey])

  useEffect(() => {
    if (assignments.length > 0 && (!selectedAssignmentId || !assignments.some((a) => a.id === selectedAssignmentId))) {
      setSelectedAssignmentId(assignments[0].id)
    }
  }, [assignments, selectedAssignmentId])

  const handleGenerateBriefing = useCallback(
    async (assignmentId: string) => {
      const row = assignmentsWithLinks.find((a) => a.id === assignmentId)
      if (!row) return
      setSelectedAssignmentId(assignmentId)
      setGeneratingIds((prev) => new Set(prev).add(assignmentId))
      setError(null)
      try {
        const res = await fetch('/api/briefing-assistant/generate-briefing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            assignmentId,
            briefName: row.briefName,
            productOrUseCase: row.productOrUseCase,
            format: row.format,
            funnel: row.funnel,
            agencyRef: row.agencyRef,
            assetCount: row.assetCount,
            sourceIds: lastUsedDatasources.length > 0 ? lastUsedDatasources : undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Briefing generation failed')
          return
        }
        const sections = data.sections
        if (!sections || typeof sections !== 'object') {
          setError('Invalid response from briefing generator')
          return
        }
        if (sprintId) {
          const patchRes = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments/${assignmentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ working_doc_sections: sections }),
          })
          if (patchRes.ok) {
            onSprintUpdated?.()
            setWorkingDocOpen(true)
          } else {
            setError('Failed to save working doc')
          }
        } else {
          setWorkingDocOpen(true)
        }
      } catch {
        setError('Briefing generation request failed')
      } finally {
        setGeneratingIds((prev) => {
          const next = new Set(prev)
          next.delete(assignmentId)
          return next
        })
      }
    },
    [assignmentsWithLinks, sprintId, onSprintUpdated, lastUsedDatasources]
  )

  return (
    <TooltipProvider>
      <div className="h-full flex flex-col bg-background text-foreground">

        {/* Import modal */}
        {importDrawerOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-card border border-border rounded-xl shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Import from Monday</h2>
                <button type="button" onClick={() => { setImportDrawerOpen(false); setSelectedMondayIds(new Set()); }} className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                <label className="text-sm text-muted-foreground">Board (batch):</label>
                <select
                  value={importBatchKey ?? ''}
                  onChange={(e) => {
                    const key = e.target.value || null
                    setImportBatchKey(key)
                    const batch = sprintData?.batches?.find((b) => b.batch_key === key)
                    if (batch?.monday_board_id) fetchBoardItems(batch.monday_board_id)
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  {batchesWithBoard.map((b) => (
                    <option key={b.batch_key} value={b.batch_key}>{b.batch_label}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-h-0 overflow-auto p-4">
                {boardItemsLoading ? (
                  <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                ) : boardItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8">No items on this board, or board not accessible.</p>
                ) : (
                  <ul className="space-y-1">
                    {boardItems.map((item) => {
                      const alreadyImported = existingMondayIds.has(item.id)
                      const checked = selectedMondayIds.has(item.id)
                      return (
                        <li key={item.id} className={cn('flex items-center gap-2 py-2 px-2 rounded-md', alreadyImported && 'opacity-60')}>
                          <input
                            type="checkbox"
                            id={`import-${item.id}`}
                            checked={alreadyImported || checked}
                            disabled={alreadyImported}
                            onChange={() => {
                              if (alreadyImported) return
                              setSelectedMondayIds((prev) => {
                                const next = new Set(prev)
                                if (next.has(item.id)) next.delete(item.id)
                                else next.add(item.id)
                                return next
                              })
                            }}
                            className="rounded border-border"
                          />
                          <label htmlFor={`import-${item.id}`} className="flex-1 text-sm cursor-pointer truncate">
                            {item.name}
                            {item.group ? <span className="text-muted-foreground ml-1">({item.group})</span> : null}
                            {alreadyImported ? <span className="text-muted-foreground ml-1">— already imported</span> : null}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
                <Button variant="outline" onClick={() => { setImportDrawerOpen(false); setSelectedMondayIds(new Set()); }}>Cancel</Button>
                <Button onClick={handleImportConfirm} disabled={selectedMondayIds.size === 0 || importSaving}>
                  {importSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span className="ml-2">Import {selectedMondayIds.size > 0 ? selectedMondayIds.size : ''} selected</span>
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Header — spacious with branding + stats + export */}
        <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Link
                  href={sprintId ? '/briefing-assistant' : '/sheets'}
                  className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                  aria-label={sprintId ? 'Back to Briefing Assistant' : 'Back to sheets'}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className="text-lg font-semibold tracking-tight text-foreground">Heimdall</span>
                  <span className="text-xs text-muted-foreground/40 font-medium">Briefing</span>
                </div>

                <div className="h-5 w-px bg-border/60 flex-shrink-0" />

                <div className="min-w-0">
                  <h1 className="text-sm font-medium text-foreground truncate" title={sprintData?.name ?? 'Sprint'}>
                    {sprintData?.name ?? 'Sprint'}
                  </h1>
                  {sprintData?.batches?.length ? (
                    <div className="flex items-center gap-2">
                      {sprintData.batches.map((b) => (
                        <span key={b.batch_key} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                          {b.batch_label}
                          {b.monday_board_id ? (
                            <a href={`https://loopearplugs.monday.com/boards/${b.monday_board_id}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground"><LayoutGrid className="h-2.5 w-2.5" /></a>
                          ) : null}
                          {b.figma_file_key ? (
                            <a href={`https://www.figma.com/design/${b.figma_file_key}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground"><ExternalLink className="h-2.5 w-2.5" /></a>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="h-3 w-3" />
                    {assignments.length} assignment{assignments.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => downloadAssignmentsCsv(assignmentsWithLinks)}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium',
                        'border border-border text-muted-foreground',
                        'hover:bg-muted/50 hover:text-foreground transition-colors'
                      )}
                    >
                      <FileDown className="h-3.5 w-3.5" />
                      CSV
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Export assignments as CSV</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </header>

        {/* Toolbar row 1: Mode tabs + Status filter tabs */}
        <div className="flex-shrink-0 flex items-center gap-4 px-6 py-3 border-b border-border">
          <div className="flex items-center gap-1 rounded-md border border-border/40 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab('split')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                activeTab === 'split'
                  ? 'text-foreground bg-muted/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              Split
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('briefings')}
              className={cn(
                'px-3 py-1.5 text-sm font-medium rounded transition-colors',
                activeTab === 'briefings'
                  ? 'text-foreground bg-muted/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
              )}
            >
              Briefings
            </button>
          </div>

          <Separator orientation="vertical" className="h-5" />

          <div className="flex items-center gap-1">
            {STATUS_TAB_LABELS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
                  statusFilter === tab.key
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                )}
              >
                {tab.label}
                {statusCounts[tab.key] > 0 ? (
                  <span className={cn(
                    'ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full px-1 text-[10px] font-semibold',
                    statusFilter === tab.key
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/60 text-muted-foreground'
                  )}>
                    {statusCounts[tab.key]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Toolbar row 2: Generate controls + Actions */}
        <div className="flex-shrink-0 flex items-center gap-3 px-6 py-3 border-b border-border/60 bg-card/40">
          <BriefingGeneratorPanel
            onGenerate={async (product, datasources) => {
              setLastUsedDatasources(datasources)
              setError(null)
              try {
                const res = await fetch('/api/briefing-assistant/angles', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    assignmentId: selectedAssignmentId ?? 'generate',
                    productOrUseCase: product,
                    sourceIds: datasources,
                  }),
                })
                const data = await res.json()
                if (!res.ok) {
                  setError(data.error ?? 'Angle generation failed')
                  return
                }
                const count = data.angles?.length ?? 0
                setError(null)
                window.alert(`Generated ${count} angle${count !== 1 ? 's' : ''} for ${product}.\n\n${data.angles?.map((a: { title: string; hook: string }) => `${a.title}: ${a.hook}`).join('\n') ?? '(none)'}`)
              } catch {
                setError('Angle generation request failed')
              }
            }}
          />

          <Separator orientation="vertical" className="h-5" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/30"
              >
                <Play className="h-3.5 w-3.5" />
                Split
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 p-4">
              <DropdownMenuLabel className="px-0 pb-3 text-xs text-muted-foreground">Split configuration</DropdownMenuLabel>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-muted-foreground text-xs">Batch</label>
                  <input type="text" value={batchKey} onChange={(e) => setBatchKey(e.target.value)} placeholder="2026-01" className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-muted-foreground text-xs">Assets</label>
                  <input type="number" min={1} value={totalAssets} onChange={(e) => setTotalAssets(Number(e.target.value) || 210)} className="w-20 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-muted-foreground text-xs">Max briefs</label>
                  <input type="number" min={1} value={maxBriefs} onChange={(e) => setMaxBriefs(Number(e.target.value) || 53)} className="w-16 rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
                </div>
                <Button onClick={() => runSplit()} disabled={loading} size="sm">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  <span className="ml-2">Run</span>
                </Button>
              </div>
              {assignmentsWithLinks.length > 0 ? (
                <>
                  <DropdownMenuSeparator className="my-3" />
                  <DropdownMenuItem onClick={() => downloadAssignmentsCsv(assignmentsWithLinks)}>
                    <FileDown className="h-3.5 w-3.5 mr-2" />
                    Export CSV
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          {sprintId && batchesWithBoard.length > 0 ? (
            <>
              <Separator orientation="vertical" className="h-5" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => { setImportDrawerOpen(true); setImportBatchKey(batchesWithBoard[0]?.batch_key ?? null); if (batchesWithBoard[0]?.monday_board_id) fetchBoardItems(batchesWithBoard[0].monday_board_id); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Import
                  </button>
                </TooltipTrigger>
                <TooltipContent>Import from Monday</TooltipContent>
              </Tooltip>
            </>
          ) : null}
          {sprintId && (sprintData?.batches?.length ?? 0) > 0 ? (
            <Button variant="default" size="sm" onClick={handleNewBrief}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New brief
            </Button>
          ) : null}
        </div>

        {/* Error / split result */}
        {error || splitResult ? (
          <div className="flex-shrink-0 px-6 py-2">
            {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
            {splitResult ? <p className="text-[11px] text-muted-foreground/70">{splitResult.allocation.briefCount} briefs · {splitResult.allocation.totalAssets} assets</p> : null}
          </div>
        ) : null}

        {/* Content based on active tab */}
        {activeTab === 'split' ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">Split view placeholder. Coming soon.</p>
          </div>
        ) : (
          <div className="flex flex-1 min-h-0 gap-0">
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <BriefingAssignmentsTable
                assignments={filteredAssignments}
                selectedId={selectedAssignmentId}
                onSelect={setSelectedAssignmentId}
                loading={loading}
                batchBoardMap={batchBoardMap}
                availableBoards={availableBoards}
                onBoardChange={sprintId ? async (assignmentId, boardId) => {
                  try {
                    await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments/${assignmentId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ target_board_id: boardId || null }),
                    })
                    onSprintUpdated?.()
                  } catch {
                    setError('Failed to update board')
                  }
                } : undefined}
                onPatch={sprintId ? async (assignmentId, patch) => {
                  try {
                    const body: Record<string, unknown> = {}
                    if (patch.briefName !== undefined) body.brief_name = patch.briefName
                    if (patch.productOrUseCase !== undefined) body.product_or_use_case = patch.productOrUseCase
                    if (patch.format !== undefined) body.format = patch.format
                    if (patch.funnel !== undefined) body.funnel = patch.funnel
                    if (patch.agencyRef !== undefined) body.agency_ref = patch.agencyRef
                    if (patch.assetCount !== undefined) body.asset_count = patch.assetCount
                    if (patch.mondayItemId !== undefined) body.monday_item_id = patch.mondayItemId
                    if (patch.targetBoardId !== undefined) body.target_board_id = patch.targetBoardId
                    if (Object.keys(body).length === 0) return
                    const res = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments/${assignmentId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(body),
                    })
                    if (res.ok) onSprintUpdated?.()
                    else setError('Failed to save')
                  } catch {
                    setError('Failed to save')
                  }
                } : undefined}
                onAddRow={undefined}
                feedbackStatusMap={feedbackStatusMap}
                onGenerateBriefing={sprintId ? handleGenerateBriefing : undefined}
                generatingIds={generatingIds}
              />
              <footer className="flex-shrink-0 border-t border-border/50 px-6 py-2 bg-card/20">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid className="h-3 w-3" />
                    {filteredAssignments.length}{statusFilter !== 'all' ? ` of ${assignments.length}` : ''} assignment{filteredAssignments.length !== 1 ? 's' : ''}
                  </span>
                  <span>Powered by Heimdall</span>
                </div>
              </footer>
            </div>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setWorkingDocOpen((v) => !v)}
                  className={cn(
                    'flex-shrink-0 flex items-center justify-center w-5 hover:bg-muted/40 transition-colors',
                    'text-muted-foreground/40 hover:text-muted-foreground/70',
                    'border-r border-border/30'
                  )}
                  aria-label={workingDocOpen ? 'Hide working doc panel' : 'Show working doc panel'}
                >
                  {workingDocOpen ? (
                    <ChevronLeft className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {workingDocOpen ? 'Hide working doc' : 'Show working doc'}
              </TooltipContent>
            </Tooltip>

            <aside
              className={cn(
                'flex-shrink-0 border-l border-border/40 bg-primary/[0.03] flex flex-col transition-[width] duration-300 ease-in-out overflow-hidden',
                workingDocOpen ? 'w-[480px]' : 'w-0 overflow-hidden border-l-0'
              )}
            >
              {workingDocOpen && (
                <div className="flex-1 flex flex-col min-h-0 w-[480px] border-l border-border bg-card m-0 overflow-hidden">
                  <BriefingWorkingDocPanel
                    assignmentId={selected?.id ?? null}
                    briefName={selected?.briefName}
                    sections={selected?.workingDocSections}
                    readOnly={!sprintId}
                    onClose={() => setWorkingDocOpen(false)}
                    onSaveSections={sprintId ? async (assignmentId, nextSections) => {
                      try {
                        const res = await fetch(`/api/briefing-assistant/sprints/${sprintId}/assignments/${assignmentId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ working_doc_sections: nextSections }),
                        })
                        if (res.ok) onSprintUpdated?.()
                        else setError('Failed to save working doc')
                      } catch {
                        setError('Failed to save working doc')
                      }
                    } : undefined}
                  />
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
