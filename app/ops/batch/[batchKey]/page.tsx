'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
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
  Users,
  ChevronDown,
  ChevronRight,
  Check,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { BriefingDocModal } from '@/components/ops/BriefingDocModal'

interface OpsBoard {
  id: string
  monday_board_id: string
  board_name: string
  default_creative_partners: string[]
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

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function batchLabel(key: string): string {
  const [y, m] = key.split('-')
  const month = MONTH_NAMES[parseInt(m, 10)] ?? m
  return `${month} ${y}`
}

export default function BatchKanbanPage() {
  const { batchKey } = useParams<{ batchKey: string }>()
  const router = useRouter()
  const [board, setBoard] = useState<OpsBoard | null>(null)
  const [items, setItems] = useState<OpsBoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [filterPartners, setFilterPartners] = useState<Set<string>>(new Set())
  const [showOtherLane, setShowOtherLane] = useState(false)
  const [filtersInitialized, setFiltersInitialized] = useState(false)
  const [selectedItem, setSelectedItem] = useState<OpsBoardItem | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ops/batch/${batchKey}`)
      if (res.ok) {
        const data = await res.json()
        setBoard(data.board ?? null)
        setItems(data.items ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [batchKey])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const t = setInterval(fetchData, 20_000)
    return () => clearInterval(t)
  }, [fetchData])

  const RELEVANT_PARTNERS = ['Studio', 'Content Creation']

  useEffect(() => {
    if (filtersInitialized || !board) return
    const defaults = board.default_creative_partners?.length
      ? board.default_creative_partners
      : RELEVANT_PARTNERS
    setFilterPartners(new Set(defaults))
    setFiltersInitialized(true)
  }, [board, filtersInitialized])

  const handleSync = async () => {
    if (!board) return
    setSyncing(true)
    try {
      await fetch(`/api/ops/boards/${board.id}/sync`, { method: 'POST' })
      await fetchData()
    } finally {
      setSyncing(false)
    }
  }

  const handleQueueEligible = async () => {
    if (!board) return
    await fetch(`/api/ops/boards/${board.id}/queue-eligible`, { method: 'POST' })
    await fetchData()
  }

  const creativePartners = useMemo(
    () => [...new Set(items.map(i => i.creative_partner).filter(Boolean))].sort() as string[],
    [items]
  )

  const filteredItems = useMemo(() => items.filter(i => {
    if (filterPartners.size > 0 && !filterPartners.has(i.creative_partner ?? '')) return false
    return true
  }), [items, filterPartners])

  const readyCount = filteredItems.filter(
    i => getKanbanLane(i.monday_status, i.pipeline_status) === 'ready_for_figma'
  ).length

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push('/ops')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight truncate">{batchLabel(batchKey)}</h1>
            <p className="text-xs text-muted-foreground">
              {filteredItems.length} briefings
              {board && ` · ${board.board_name}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Creative partner filter */}
          {creativePartners.length > 0 && (() => {
            const primaryPartners = creativePartners.filter(cp => RELEVANT_PARTNERS.includes(cp))
            const agencyPartners = creativePartners.filter(cp => !RELEVANT_PARTNERS.includes(cp))
            const activeAgencyCount = agencyPartners.filter(cp => filterPartners.has(cp)).length
            return (
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-1">
                  {primaryPartners.map(cp => {
                    const active = filterPartners.has(cp)
                    return (
                      <button
                        key={cp}
                        onClick={() => setFilterPartners(prev => {
                          const next = new Set(prev)
                          if (next.has(cp)) next.delete(cp)
                          else next.add(cp)
                          return next
                        })}
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
                          className={cn(
                            'h-6 rounded-md px-2 text-[11px] font-medium transition-colors border inline-flex items-center gap-1',
                            activeAgencyCount > 0
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
                              onClick={() => setFilterPartners(prev => {
                                const next = new Set(prev)
                                if (next.has(cp)) next.delete(cp)
                                else next.add(cp)
                                return next
                              })}
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
          })()}

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

          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          </Button>
          {readyCount > 0 && (
            <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleQueueEligible}>
              <Play className="h-3 w-3" />
              Queue {readyCount}
            </Button>
          )}
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-4 py-2 border-b border-border shrink-0">
        <PipelineProgress
          total={filteredItems.length}
          synced={filteredItems.filter(i => i.pipeline_status === 'synced').length}
          queued={filteredItems.filter(i => i.pipeline_status === 'queued' || i.pipeline_status === 'syncing').length}
          eligible={readyCount}
          failed={filteredItems.filter(i => i.pipeline_status === 'failed').length}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === 'kanban' ? (
          <KanbanView
            items={filteredItems}
            showOther={showOtherLane}
            onToggleOther={() => setShowOtherLane(!showOtherLane)}
            onQueueReady={handleQueueEligible}
            onItemClick={setSelectedItem}
          />
        ) : (
          <TableView items={filteredItems} onItemClick={setSelectedItem} />
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

// ── Kanban ──────────────────────────────────────────────────────────────────

function KanbanView({
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
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 h-full">
        {WORKFLOW_LANES.map(lane => {
          const columnItems = laneItems[lane]
          return (
            <div key={lane} className="flex flex-col space-y-2">
              <div className="flex items-center justify-between px-1 shrink-0">
                <LanePill lane={lane} count={columnItems.length} />
                {lane === 'ready_for_figma' && columnItems.length > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 gap-1 text-[10px] px-1.5" onClick={onQueueReady}>
                    <Play className="h-2.5 w-2.5" /> Queue All
                  </Button>
                )}
              </div>
              <div className="flex-1 space-y-2 rounded-lg bg-muted/40 p-2 min-h-[200px] overflow-y-auto">
                {columnItems.length === 0 ? (
                  <p className="py-8 text-center text-[11px] text-muted-foreground/50">Empty</p>
                ) : (
                  columnItems.map(item => <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />)
                )}
              </div>
            </div>
          )
        })}
      </div>

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
              {laneItems.other.map(item => <KanbanCard key={item.id} item={item} onClick={() => onItemClick(item)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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

// ── Table ───────────────────────────────────────────────────────────────────

function TableView({ items, onItemClick }: { items: OpsBoardItem[]; onItemClick: (item: OpsBoardItem) => void }) {
  const [sortKey, setSortKey] = useState<'name' | 'status' | 'updated'>('updated')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = [...items].sort((a, b) => {
    const dir = sortAsc ? 1 : -1
    switch (sortKey) {
      case 'name':
        return dir * (a.item_name ?? '').localeCompare(b.item_name ?? '')
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
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Section</th>
              <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Partner</th>
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
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.section_name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {item.creative_partner ?? '—'}
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
          <p className="py-8 text-center text-sm text-muted-foreground">No briefings for this batch.</p>
        )}
      </div>
    </Card>
  )
}
