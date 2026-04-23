'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  StatusPill,
  LanePill,
  SyncBadge,
  getKanbanLane,
  getFeedbackLane,
  FeedbackLanePill,
  FEEDBACK_WORKFLOW_LANES,
  type PipelineStatus,
  type KanbanLane,
  type FeedbackLane,
  type BoardMode,
} from '@/components/ops/StatusPill'
import { PipelineProgress } from '@/components/ops/PipelineProgress'
import {
  RefreshCw,
  ArrowLeft,
  Play,
  LayoutGrid,
  List,
  ExternalLink,
  Calendar,
  Users,
  ChevronDown,
  ChevronRight,
  Check,
  ArrowLeftRight,
  MessageSquare,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BriefingDocModal } from '@/components/ops/BriefingDocModal'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsFeedbackReviewer } from '@/lib/roles'

interface OpsBoard {
  id: string
  monday_board_id: string
  board_name: string
  figma_project_id: string | null
  figma_project_name: string | null
  auto_queue: boolean
  eligible_statuses: string[]
  default_creative_partners: string[]
  last_board_sync_at: string | null
}

interface OpsBoardItem {
  id: string
  monday_item_id: string
  monday_board_id: string
  item_name: string
  experiment_name: string | null
  batch_canonical: string | null
  batch_raw: string | null
  section_name: string | null
  monday_status: string | null
  pipeline_status: PipelineStatus
  creative_partner: string | null
  figma_file_key: string | null
  figma_page_id: string | null
  figma_page_url: string | null
  queued_at: string | null
  synced_at: string | null
  updated_at: string
}

type ViewMode = 'kanban' | 'table'

const SYNC_WORKFLOW_LANES: KanbanLane[] = ['upcoming', 'ready_for_figma', 'imported', 'exported']

const RELEVANT_PARTNERS = ['Studio', 'Content Creation']

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function batchLabel(key: string): string {
  const [y, m] = key.split('-')
  const month = MONTH_NAMES[parseInt(m, 10)] ?? m
  return `${month} ${y}`
}

export default function BoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const isFeedbackReviewer = useIsFeedbackReviewer()

  const [board, setBoard] = useState<OpsBoard | null>(null)
  const [items, setItems] = useState<OpsBoardItem[]>([])
  const [feedbackSyncedIds, setFeedbackSyncedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')

  const modeStorageKey = `heimdall:ops:board-mode:${boardId}`
  const [boardMode, _setBoardMode] = useState<BoardMode>(() => {
    if (typeof window === 'undefined') return 'sync'
    const stored = localStorage.getItem(modeStorageKey)
    return stored === 'feedback' ? 'feedback' : 'sync'
  })
  const setBoardMode = useCallback((m: BoardMode) => {
    _setBoardMode(m)
    try { localStorage.setItem(modeStorageKey, m) } catch {}
  }, [modeStorageKey])

  const prevModeRef = useRef(boardMode)

  const batchStorageKey = `heimdall:ops:last-batch:${boardId}`
  const [filterBatch, _setFilterBatch] = useState<string | 'all'>(() => {
    if (typeof window === 'undefined') return 'all'
    return localStorage.getItem(batchStorageKey) ?? 'all'
  })
  const setFilterBatch = useCallback((v: string | 'all') => {
    _setFilterBatch(v)
    try { localStorage.setItem(batchStorageKey, v) } catch {}
  }, [batchStorageKey])
  const [filterPartners, setFilterPartners] = useState<Set<string>>(new Set())
  const [showOtherLane, setShowOtherLane] = useState(false)
  const [filtersInitialized, setFiltersInitialized] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OpsBoardItem | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ops/boards/${boardId}`)
      if (res.ok) {
        const data = await res.json()
        setBoard(data.board ?? null)
        setItems(data.items ?? [])
        setFeedbackSyncedIds(new Set(data.feedbackSyncedItemIds ?? []))
      }
    } finally {
      setLoading(false)
    }
  }, [boardId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const t = setInterval(fetchData, 20_000)
    return () => clearInterval(t)
  }, [fetchData])

  useEffect(() => {
    if (filtersInitialized || !board || items.length === 0) return

    if (boardMode === 'feedback') {
      const agencies = [...new Set(items.map(i => i.creative_partner).filter(Boolean))] as string[]
      const external = agencies.filter(cp => !RELEVANT_PARTNERS.includes(cp))
      setFilterPartners(new Set(external.length > 0 ? external : agencies))
    } else {
      const defaults = board.default_creative_partners?.length
        ? board.default_creative_partners
        : RELEVANT_PARTNERS
      setFilterPartners(new Set(defaults))
    }

    const batchValues = [...new Set(items.map(i => i.batch_canonical).filter(Boolean))] as string[]
    if (batchValues.length > 0) {
      const sorted = batchValues.sort()
      const persisted = filterBatch !== 'all' && sorted.includes(filterBatch) ? filterBatch : null
      if (!persisted) {
        setFilterBatch(sorted[sorted.length - 1])
      }
    }

    setFiltersInitialized(true)
  }, [board, items, filtersInitialized, boardMode])

  useEffect(() => {
    if (prevModeRef.current === boardMode) return
    prevModeRef.current = boardMode
    if (!board || items.length === 0) return

    if (boardMode === 'feedback') {
      const agencies = [...new Set(items.map(i => i.creative_partner).filter(Boolean))] as string[]
      const external = agencies.filter(cp => !RELEVANT_PARTNERS.includes(cp))
      setFilterPartners(new Set(external.length > 0 ? external : agencies))
    } else {
      const defaults = board.default_creative_partners?.length
        ? board.default_creative_partners
        : RELEVANT_PARTNERS
      setFilterPartners(new Set(defaults))
    }
  }, [boardMode, board, items])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch(`/api/ops/boards/${boardId}/sync`, { method: 'POST' })
      await fetchData()
    } finally {
      setSyncing(false)
    }
  }

  const handleQueueEligible = async () => {
    await fetch(`/api/ops/boards/${boardId}/queue-eligible`, { method: 'POST' })
    await fetchData()
  }

  const batches = useMemo(
    () => [...new Set(items.map(i => i.batch_canonical).filter(Boolean))].sort() as string[],
    [items]
  )
  const creativePartners = useMemo(
    () => [...new Set(items.map(i => i.creative_partner).filter(Boolean))].sort() as string[],
    [items]
  )

  const filteredItems = useMemo(() => items.filter(i => {
    if (filterBatch !== 'all' && i.batch_canonical !== filterBatch) return false
    if (filterPartners.size > 0 && !filterPartners.has(i.creative_partner ?? '')) return false
    return true
  }), [items, filterBatch, filterPartners])

  const readyForFigmaCount = filteredItems.filter(
    i => getKanbanLane(i.monday_status, i.pipeline_status) === 'ready_for_figma'
  ).length

  if (!board && !loading) {
    return (
      <div className="space-y-4">
        <Link href="/ops" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <p className="text-muted-foreground">Board not found.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="shrink-0">
        <Link href="/ops" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> All Boards
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{board?.board_name ?? 'Loading...'}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {board?.monday_board_id ? `Board ${board.monday_board_id}` : ''}
              {board?.figma_project_name && ` · ${board.figma_project_name}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            {isFeedbackReviewer && (
              <div className="flex rounded-md border border-input overflow-hidden mr-1">
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                    boardMode === 'sync' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
                  )}
                  onClick={() => setBoardMode('sync')}
                >
                  <ArrowLeftRight className="h-3 w-3" />
                  Briefing Sync
                </button>
                <button
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l border-input',
                    boardMode === 'feedback' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
                  )}
                  onClick={() => setBoardMode('feedback')}
                >
                  <MessageSquare className="h-3 w-3" />
                  Feedback
                </button>
              </div>
            )}
            <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            </Button>
            {boardMode === 'sync' && readyForFigmaCount > 0 && (
              <Button size="sm" className="gap-1.5" onClick={handleQueueEligible}>
                <Play className="h-3.5 w-3.5" />
                Queue {readyForFigmaCount} Ready
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar (sync mode only) */}
      {boardMode === 'sync' && board && (
        <PipelineProgress className="shrink-0"
          total={filteredItems.length}
          synced={filteredItems.filter(i => i.pipeline_status === 'synced').length}
          queued={filteredItems.filter(i => i.pipeline_status === 'queued' || i.pipeline_status === 'syncing').length}
          eligible={filteredItems.filter(i => getKanbanLane(i.monday_status, i.pipeline_status) === 'ready_for_figma').length}
          failed={filteredItems.filter(i => i.pipeline_status === 'failed').length}
        />
      )}

      {/* Filters + view toggle */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Batch filter */}
          <div className="flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
              value={filterBatch}
              onChange={(e) => setFilterBatch(e.target.value)}
            >
              <option value="all">All batches ({items.length})</option>
              {batches.map(b => (
                <option key={b} value={b}>{batchLabel(b)} ({items.filter(i => i.batch_canonical === b).length})</option>
              ))}
            </select>
          </div>
          {/* Agency / partner filter — promoted to dropdown in feedback mode */}
          <AgencyFilter
            creativePartners={creativePartners}
            filterPartners={filterPartners}
            setFilterPartners={setFilterPartners}
            boardMode={boardMode}
          />
          {filterBatch !== 'all' && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setFilterBatch('all')}
            >
              Clear batch
            </button>
          )}
        </div>
        {/* View toggle */}
        <div className="flex rounded-md border border-input overflow-hidden">
          <button
            className={cn('flex items-center gap-1 px-2.5 py-1 text-xs transition-colors', viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid className="h-3 w-3" /> Board
          </button>
          <button
            className={cn('flex items-center gap-1 px-2.5 py-1 text-xs transition-colors border-l border-input', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
            onClick={() => setViewMode('table')}
          >
            <List className="h-3 w-3" /> Table
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {boardMode === 'sync' ? (
          viewMode === 'kanban' ? (
            <SyncKanbanView
              items={filteredItems}
              showOther={showOtherLane}
              onToggleOther={() => setShowOtherLane(!showOtherLane)}
              onQueueReady={handleQueueEligible}
              onItemClick={setSelectedItem}
            />
          ) : (
            <SyncTableView items={filteredItems} onItemClick={setSelectedItem} />
          )
        ) : (
          viewMode === 'kanban' ? (
            <FeedbackKanbanView items={filteredItems} onItemClick={setSelectedItem} showOther={showOtherLane} onToggleOther={() => setShowOtherLane(!showOtherLane)} feedbackSyncedIds={feedbackSyncedIds} />
          ) : (
            <FeedbackTableView items={filteredItems} onItemClick={setSelectedItem} feedbackSyncedIds={feedbackSyncedIds} />
          )
        )}
      </div>

      <BriefingDocModal
        open={selectedItem !== null}
        onOpenChange={(open) => { if (!open) setSelectedItem(null) }}
        mondayItemId={selectedItem?.monday_item_id ?? null}
        mondayBoardId={selectedItem?.monday_board_id ?? null}
        itemName={selectedItem?.experiment_name ?? selectedItem?.item_name}
      />
    </div>
  )
}

// ── Agency Filter ───────────────────────────────────────────────────────────

function AgencyFilter({
  creativePartners,
  filterPartners,
  setFilterPartners,
  boardMode,
}: {
  creativePartners: string[]
  filterPartners: Set<string>
  setFilterPartners: React.Dispatch<React.SetStateAction<Set<string>>>
  boardMode: BoardMode
}) {
  if (creativePartners.length === 0) return null

  const toggle = (cp: string) => setFilterPartners(prev => {
    const next = new Set(prev)
    if (next.has(cp)) next.delete(cp)
    else next.add(cp)
    return next
  })

  if (boardMode === 'feedback') {
    return (
      <div className="flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <select
          className="h-7 rounded-md border border-input bg-background px-2 text-xs min-w-[140px]"
          value={filterPartners.size === creativePartners.length || filterPartners.size === 0 ? '__all__' : [...filterPartners][0] ?? '__all__'}
          onChange={(e) => {
            const v = e.target.value
            if (v === '__all__') {
              setFilterPartners(new Set(creativePartners))
            } else {
              setFilterPartners(new Set([v]))
            }
          }}
        >
          <option value="__all__">All agencies ({creativePartners.length})</option>
          {creativePartners.map(cp => (
            <option key={cp} value={cp}>{cp}</option>
          ))}
        </select>
      </div>
    )
  }

  const primaryPartners = creativePartners.filter(cp => RELEVANT_PARTNERS.includes(cp))
  const agencyPartners = creativePartners.filter(cp => !RELEVANT_PARTNERS.includes(cp))
  const activeAgencyCount = agencyPartners.filter(cp => filterPartners.has(cp)).length
  const isSyncMode = boardMode === 'sync'

  return (
    <div className="flex items-center gap-1.5">
      <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <div className="flex items-center gap-1">
        {primaryPartners.map(cp => {
          const active = filterPartners.has(cp)
          return (
            <button
              key={cp}
              onClick={() => toggle(cp)}
              className={cn(
                'h-6 rounded-md px-2 text-[11px] font-medium transition-colors border',
                active
                  ? 'bg-primary/15 text-primary border-primary/30'
                  : 'bg-transparent text-muted-foreground border-transparent hover:bg-muted/50'
              )}
            >
              {cp}
            </button>
          )
        })}
        {agencyPartners.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                disabled={isSyncMode}
                className={cn(
                  'h-6 rounded-md px-2 text-[11px] font-medium transition-colors border inline-flex items-center gap-1',
                  isSyncMode
                    ? 'bg-transparent text-muted-foreground/40 border-transparent cursor-not-allowed'
                    : activeAgencyCount > 0
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-transparent text-muted-foreground border-transparent hover:bg-muted/50'
                )}
              >
                Agencies{activeAgencyCount > 0 ? ` (${activeAgencyCount})` : ''}
                <ChevronDown className="h-3 w-3" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-44 p-1" align="end" sideOffset={4}>
              {agencyPartners.map(cp => {
                const active = filterPartners.has(cp)
                return (
                  <button
                    key={cp}
                    onClick={() => toggle(cp)}
                    className="flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                  >
                    <div className={cn(
                      'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                      active ? 'bg-primary border-primary' : 'border-input'
                    )}>
                      {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </div>
                    <span className={active ? 'text-foreground' : 'text-muted-foreground'}>{cp}</span>
                  </button>
                )
              })}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

// ── Shared card ─────────────────────────────────────────────────────────────

function KanbanCard({ item, onClick }: { item: OpsBoardItem; onClick?: () => void }) {
  return (
    <Card
      className="p-2.5 space-y-1.5 text-xs cursor-pointer hover:ring-1 hover:ring-primary/30 transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="font-medium leading-snug line-clamp-2 flex-1" title={item.item_name}>
          {item.experiment_name ?? item.item_name}
        </p>
        <SyncBadge status={item.pipeline_status} />
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {item.batch_canonical && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {item.batch_canonical}
          </Badge>
        )}
        {item.section_name && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {item.section_name}
          </Badge>
        )}
        {item.creative_partner && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 opacity-60">
            {item.creative_partner}
          </Badge>
        )}
      </div>
      {item.monday_status && (
        <p className="text-[10px] text-muted-foreground truncate" title={item.monday_status}>
          {item.monday_status}
        </p>
      )}
      <div className="flex items-center gap-1.5 pt-0.5">
        <a
          href={`https://loopearplugs.monday.com/boards/${item.monday_board_id}/pulses/${item.monday_item_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Monday
        </a>
        {item.figma_page_url && (
          <>
            <span className="text-border">&middot;</span>
            <a
              href={item.figma_page_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Figma
            </a>
          </>
        )}
      </div>
    </Card>
  )
}

// ── Sync Kanban ─────────────────────────────────────────────────────────────

const LANE_PAGE_SIZE = 15

function SyncLaneColumn({
  lane,
  items,
  onItemClick,
  headerAction,
}: {
  lane: KanbanLane
  items: OpsBoardItem[]
  onItemClick: (item: OpsBoardItem) => void
  headerAction?: React.ReactNode
}) {
  const [visibleCount, setVisibleCount] = useState(LANE_PAGE_SIZE)
  const visible = items.slice(0, visibleCount)
  const remaining = items.length - visibleCount

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 shrink-0 mb-2">
        <LanePill lane={lane} count={items.length} />
        {headerAction}
      </div>
      <div className="flex-1 min-h-[120px] overflow-y-auto scrollbar-subtle rounded-lg bg-muted/40 p-2 space-y-2 max-h-[calc(100vh-280px)]">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground/50">Empty</p>
        ) : (
          <>
            {visible.map(item => (
              <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />
            ))}
            {remaining > 0 && (
              <button
                className="w-full rounded-md border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                onClick={() => setVisibleCount(c => c + LANE_PAGE_SIZE)}
              >
                Load more ({remaining} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function SyncKanbanView({
  items,
  showOther,
  onToggleOther,
  onQueueReady,
  onItemClick,
}: {
  items: OpsBoardItem[]
  showOther: boolean
  onToggleOther: () => void
  onQueueReady: () => void
  onItemClick: (item: OpsBoardItem) => void
}) {
  const laneItems = useMemo(() => {
    const map: Record<KanbanLane, OpsBoardItem[]> = {
      upcoming: [], ready_for_figma: [], imported: [], exported: [], other: [],
    }
    for (const item of items) {
      const lane = getKanbanLane(item.monday_status, item.pipeline_status)
      map[lane].push(item)
    }
    return map
  }, [items])

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 items-start flex-1 min-h-0">
        {SYNC_WORKFLOW_LANES.map(lane => (
          <SyncLaneColumn
            key={lane}
            lane={lane}
            items={laneItems[lane]}
            onItemClick={onItemClick}
            headerAction={
              lane === 'ready_for_figma' && laneItems[lane].length > 0 ? (
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] px-1.5" onClick={onQueueReady}>
                  <Play className="h-2.5 w-2.5" /> Queue All
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>

      {laneItems.other.length > 0 && (
        <div className="space-y-2 shrink-0">
          <button
            className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onToggleOther}
          >
            {showOther ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Other statuses ({laneItems.other.length})
          </button>
          {showOther && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {laneItems.other.map(item => <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Feedback Kanban ─────────────────────────────────────────────────────────

function FeedbackLaneColumn({
  lane,
  items,
  onItemClick,
}: {
  lane: FeedbackLane
  items: OpsBoardItem[]
  onItemClick: (item: OpsBoardItem) => void
}) {
  const [visibleCount, setVisibleCount] = useState(LANE_PAGE_SIZE)
  const visible = items.slice(0, visibleCount)
  const remaining = items.length - visibleCount

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between px-1 shrink-0 mb-2">
        <FeedbackLanePill lane={lane} count={items.length} />
      </div>
      <div className="flex-1 min-h-[120px] overflow-y-auto scrollbar-subtle rounded-lg bg-muted/40 p-2 space-y-2 max-h-[calc(100vh-280px)]">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground/50">Empty</p>
        ) : (
          <>
            {visible.map(item => (
              <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />
            ))}
            {remaining > 0 && (
              <button
                className="w-full rounded-md border border-dashed border-border py-2 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                onClick={() => setVisibleCount(c => c + LANE_PAGE_SIZE)}
              >
                Load more ({remaining} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FeedbackKanbanView({
  items,
  onItemClick,
  showOther,
  onToggleOther,
  feedbackSyncedIds,
}: {
  items: OpsBoardItem[]
  onItemClick: (item: OpsBoardItem) => void
  showOther: boolean
  onToggleOther: () => void
  feedbackSyncedIds: Set<string>
}) {
  const laneItems = useMemo(() => {
    const map: Record<FeedbackLane, OpsBoardItem[]> = {
      ready_for_review: [], pending_review: [], feedback_given: [], other: [],
    }
    for (const item of items) {
      const lane = getFeedbackLane(item.monday_status, feedbackSyncedIds.has(item.monday_item_id))
      map[lane].push(item)
    }
    return map
  }, [items, feedbackSyncedIds])

  return (
    <div className="flex flex-col gap-4 flex-1 min-h-0">
      <div className="grid grid-cols-2 gap-3 items-start flex-1 min-h-0">
        {FEEDBACK_WORKFLOW_LANES.map(lane => (
          <FeedbackLaneColumn
            key={lane}
            lane={lane}
            items={laneItems[lane]}
            onItemClick={onItemClick}
          />
        ))}
      </div>

      {laneItems.other.length > 0 && (
        <div className="space-y-2 shrink-0">
          <button
            className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onToggleOther}
          >
            {showOther ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Other statuses ({laneItems.other.length})
          </button>
          {showOther && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {laneItems.other.map(item => <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sync Table ──────────────────────────────────────────────────────────────

function SyncTableView({ items, onItemClick }: { items: OpsBoardItem[]; onItemClick: (item: OpsBoardItem) => void }) {
  const [sortKey, setSortKey] = useState<'name' | 'batch' | 'status' | 'updated'>('updated')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...items].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    switch (sortKey) {
      case 'name':
        return dir * (a.item_name ?? '').localeCompare(b.item_name ?? '')
      case 'batch':
        return dir * (a.batch_canonical ?? '').localeCompare(b.batch_canonical ?? '')
      case 'status': {
        const laneA = getKanbanLane(a.monday_status, a.pipeline_status)
        const laneB = getKanbanLane(b.monday_status, b.pipeline_status)
        return dir * laneA.localeCompare(laneB)
      }
      case 'updated':
        return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      default:
        return 0
    }
  })

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortHeader = ({ label, field }: { label: string; field: typeof sortKey }) => (
    <th
      className="text-left text-xs font-medium text-muted-foreground px-3 py-2 cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field && (sortAsc ? '↑' : '↓')}
    </th>
  )

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <SortHeader label="Name" field="name" />
              <SortHeader label="Batch" field="batch" />
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Section</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Monday Status</th>
              <SortHeader label="Workflow" field="status" />
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Sync</th>
              <SortHeader label="Updated" field="updated" />
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(item => (
              <tr key={item.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onItemClick(item)}>
                <td className="px-3 py-2.5 max-w-[280px]">
                  <p className="truncate font-medium" title={item.item_name}>
                    {item.experiment_name ?? item.item_name}
                  </p>
                  {item.creative_partner && (
                    <p className="text-[10px] text-muted-foreground">{item.creative_partner}</p>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {item.batch_canonical ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.section_name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.monday_status ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  <LanePill lane={getKanbanLane(item.monday_status, item.pipeline_status)} />
                </td>
                <td className="px-3 py-2.5">
                  <SyncBadge status={item.pipeline_status} />
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(item.updated_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://loopearplugs.monday.com/boards/${item.monday_board_id}/pulses/${item.monday_item_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="Open in Monday"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {item.figma_page_url && (
                      <a
                        href={item.figma_page_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                        title="Open in Figma"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No items match filters.</p>
        )}
      </div>
    </Card>
  )
}

// ── Feedback Table ──────────────────────────────────────────────────────────

function FeedbackTableView({ items, onItemClick, feedbackSyncedIds }: { items: OpsBoardItem[]; onItemClick: (item: OpsBoardItem) => void; feedbackSyncedIds: Set<string> }) {
  const [sortKey, setSortKey] = useState<'name' | 'batch' | 'status' | 'updated'>('updated')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...items].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    switch (sortKey) {
      case 'name':
        return dir * (a.item_name ?? '').localeCompare(b.item_name ?? '')
      case 'batch':
        return dir * (a.batch_canonical ?? '').localeCompare(b.batch_canonical ?? '')
      case 'status': {
        const laneA = getFeedbackLane(a.monday_status, feedbackSyncedIds.has(a.monday_item_id))
        const laneB = getFeedbackLane(b.monday_status, feedbackSyncedIds.has(b.monday_item_id))
        return dir * laneA.localeCompare(laneB)
      }
      case 'updated':
        return dir * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      default:
        return 0
    }
  })

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const SortHeader = ({ label, field }: { label: string; field: typeof sortKey }) => (
    <th
      className="text-left text-xs font-medium text-muted-foreground px-3 py-2 cursor-pointer hover:text-foreground select-none"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field && (sortAsc ? '↑' : '↓')}
    </th>
  )

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr>
              <SortHeader label="Name" field="name" />
              <SortHeader label="Batch" field="batch" />
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Agency</th>
              <SortHeader label="Review Status" field="status" />
              <SortHeader label="Updated" field="updated" />
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(item => (
              <tr key={item.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onItemClick(item)}>
                <td className="px-3 py-2.5 max-w-[280px]">
                  <p className="truncate font-medium" title={item.item_name}>
                    {item.experiment_name ?? item.item_name}
                  </p>
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {item.batch_canonical ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.creative_partner ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  <FeedbackLanePill lane={getFeedbackLane(item.monday_status, feedbackSyncedIds.has(item.monday_item_id))} />
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(item.updated_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={`https://loopearplugs.monday.com/boards/${item.monday_board_id}/pulses/${item.monday_item_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                    title="Open in Monday"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">No items match filters.</p>
        )}
      </div>
    </Card>
  )
}
