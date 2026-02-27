'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BoardCard } from '@/components/ops/BoardCard'
import { RegisterBoardDialog } from '@/components/ops/RegisterBoardDialog'
import { RefreshCw, Layers, CheckCircle2, AlertTriangle, FileInput, PackageCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BoardSummary {
  id: string
  monday_board_id: string
  board_name: string
  figma_project_id: string | null
  figma_project_name: string | null
  auto_queue: boolean
  default_creative_partners: string[]
  last_board_sync_at: string | null
  total_items: number
  upcoming_count: number
  ready_for_figma_count: number
  imported_count: number
  exported_count: number
  queued_count: number
  syncing_count: number
  failed_count: number
  synced_count: number
}

function MetricCard({
  title,
  value,
  icon: Icon,
  accent,
}: {
  title: string
  value: number | string
  icon: React.ElementType
  accent?: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn('h-4 w-4 text-muted-foreground', accent)} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}

export default function OpsPage() {
  const [boards, setBoards] = useState<BoardSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingBoard, setSyncingBoard] = useState<string | null>(null)

  const fetchBoards = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ops/boards')
      if (res.ok) {
        const data = await res.json()
        setBoards(data.boards ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchBoards()
  }, [fetchBoards])

  useEffect(() => {
    const interval = setInterval(fetchBoards, 30_000)
    return () => clearInterval(interval)
  }, [fetchBoards])

  const handleSync = async (boardId: string) => {
    setSyncingBoard(boardId)
    try {
      await fetch(`/api/ops/boards/${boardId}/sync`, { method: 'POST' })
      await fetchBoards()
    } finally {
      setSyncingBoard(null)
    }
  }

  const handleQueueEligible = async (boardId: string) => {
    await fetch(`/api/ops/boards/${boardId}/queue-eligible`, { method: 'POST' })
    await fetchBoards()
  }

  const totals = boards.reduce(
    (acc, b) => ({
      items: acc.items + b.total_items,
      readyForFigma: acc.readyForFigma + b.ready_for_figma_count,
      imported: acc.imported + b.imported_count,
      exported: acc.exported + b.exported_count,
      failed: acc.failed + b.failed_count,
    }),
    { items: 0, readyForFigma: 0, imported: 0, exported: 0, failed: 0 }
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Briefing Pipeline</h1>
          <p className="text-muted-foreground">
            Monday boards, sync status, and Figma routing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchBoards} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <RegisterBoardDialog onRegistered={fetchBoards} />
        </div>
      </div>

      {/* Global metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          title="Total Briefings"
          value={totals.items}
          icon={Layers}
        />
        <MetricCard
          title="Ready for Figma"
          value={totals.readyForFigma}
          icon={FileInput}
          accent="text-[hsl(var(--status-eligible))]"
        />
        <MetricCard
          title="Imported"
          value={totals.imported}
          icon={CheckCircle2}
          accent="text-[hsl(var(--status-synced))]"
        />
        <MetricCard
          title="Exported"
          value={totals.exported}
          icon={PackageCheck}
          accent="text-[hsl(var(--status-queued))]"
        />
        <MetricCard
          title="Failed"
          value={totals.failed}
          icon={AlertTriangle}
          accent={totals.failed > 0 ? 'text-[hsl(var(--status-failed))]' : undefined}
        />
      </div>

      {/* Board grid */}
      {boards.length === 0 && !loading ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/40 mb-4" />
            <p className="text-sm font-medium">No boards registered</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">
              Register a Monday board to start tracking briefing sync status.
            </p>
            <RegisterBoardDialog onRegistered={fetchBoards} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <BoardCard
              key={board.id}
              board={board}
              onSync={handleSync}
              onQueueEligible={handleQueueEligible}
              syncing={syncingBoard === board.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
