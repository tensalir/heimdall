'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  type PipelineStatus,
  type KanbanLane,
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

const WORKFLOW_LANES: KanbanLane[] = ['upcoming', 'ready_for_figma', 'imported', 'exported']

export default function BoardDetailPage() {
  const { boardId } = useParams<{ boardId: string }>()
  const [board, setBoard] = useState<OpsBoard | null>(null)
  const [items, setItems] = useState<OpsBoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [filterBatch, setFilterBatch] = useState<string | 'all'>('all')
  const [filterCreativePartner, setFilterCreativePartner] = useState<string | 'all'>('all')
  const [showOtherLane, setShowOtherLane] = useState(false)
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ops/boards/${boardId}`)
      if (res.ok) {
        const data = await res.json()
        setBoard(data.board ?? null)
        setItems(data.items ?? [])
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

  // Initialize default filters from board config + data once loaded
  useEffect(() => {
    if (filtersInitialized || !board || items.length === 0) return

    if (board.default_creative_partners?.length > 0) {
      setFilterCreativePartner(board.default_creative_partners[0])
    }

    const batches = [...new Set(items.map(i => i.batch_canonical).filter(Boolean))] as string[]
    if (batches.length > 0) {
      const sorted = batches.sort()
      setFilterBatch(sorted[sorted.length - 1])
    }

    setFiltersInitialized(true)
  }, [board, items, filtersInitialized])

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
    if (filterCreativePartner !== 'all' && i.creative_partner !== filterCreativePartner) return false
    return true
  }), [items, filterBatch, filterCreativePartner])

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
    <div className="space-y-6">
      {/* Header */}
      <div>
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
            <Button variant="outline" size="icon" onClick={handleSync} disabled={syncing}>
              <RefreshCw className={cn('h-4 w-4', syncing && 'animate-spin')} />
            </Button>
            {readyForFigmaCount > 0 && (
              <Button size="sm" className="gap-1.5" onClick={handleQueueEligible}>
                <Play className="h-3.5 w-3.5" />
                Queue {readyForFigmaCount} Ready
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {board && (
        <PipelineProgress
          total={filteredItems.length}
          synced={filteredItems.filter(i => i.pipeline_status === 'synced').length}
          queued={filteredItems.filter(i => i.pipeline_status === 'queued' || i.pipeline_status === 'syncing').length}
          eligible={filteredItems.filter(i => getKanbanLane(i.monday_status, i.pipeline_status) === 'ready_for_figma').length}
          failed={filteredItems.filter(i => i.pipeline_status === 'failed').length}
        />
      )}

      {/* Filters + view toggle */}
      <div className="flex items-center justify-between gap-4">
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
                <option key={b} value={b}>{b} ({items.filter(i => i.batch_canonical === b).length})</option>
              ))}
            </select>
          </div>
          {/* Creative partner filter */}
          {creativePartners.length > 0 && (
            <div className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                className="h-7 rounded-md border border-input bg-background px-2 text-xs"
                value={filterCreativePartner}
                onChange={(e) => setFilterCreativePartner(e.target.value)}
              >
                <option value="all">All partners</option>
                {creativePartners.map(cp => (
                  <option key={cp} value={cp}>{cp}</option>
                ))}
              </select>
            </div>
          )}
          {(filterBatch !== 'all' || filterCreativePartner !== 'all') && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => { setFilterBatch('all'); setFilterCreativePartner('all') }}
            >
              Clear filters
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
      {viewMode === 'kanban' ? (
        <KanbanView
          items={filteredItems}
          showOther={showOtherLane}
          onToggleOther={() => setShowOtherLane(!showOtherLane)}
          onQueueReady={handleQueueEligible}
        />
      ) : (
        <TableView items={filteredItems} />
      )}
    </div>
  )
}

// ── Kanban ──────────────────────────────────────────────────────────────────

function KanbanView({
  items,
  showOther,
  onToggleOther,
  onQueueReady,
}: {
  items: OpsBoardItem[]
  showOther: boolean
  onToggleOther: () => void
  onQueueReady: () => void
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {WORKFLOW_LANES.map(lane => {
          const columnItems = laneItems[lane]
          return (
            <div key={lane} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <LanePill lane={lane} count={columnItems.length} />
                {lane === 'ready_for_figma' && columnItems.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] px-1.5" onClick={onQueueReady}>
                    <Play className="h-2.5 w-2.5" /> Queue All
                  </Button>
                )}
              </div>
              <div className="space-y-2 rounded-lg bg-muted/40 p-2 min-h-[120px]">
                {columnItems.length === 0 ? (
                  <p className="py-6 text-center text-[11px] text-muted-foreground/50">Empty</p>
                ) : (
                  columnItems.map(item => <KanbanCard key={item.id} item={item} />)
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Other lane (collapsible) */}
      {laneItems.other.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={onToggleOther}
          >
            {showOther ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Other statuses ({laneItems.other.length})
          </button>
          {showOther && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {laneItems.other.map(item => <KanbanCard key={item.id} item={item} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function KanbanCard({ item }: { item: OpsBoardItem }) {
  return (
    <Card className="p-2.5 space-y-1.5 text-xs">
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
            >
              Figma
            </a>
          </>
        )}
      </div>
    </Card>
  )
}

// ── Table ───────────────────────────────────────────────────────────────────

function TableView({ items }: { items: OpsBoardItem[] }) {
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
              <tr key={item.id} className="hover:bg-muted/30 transition-colors">
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
                <td className="px-3 py-2.5">
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
