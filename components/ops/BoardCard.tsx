'use client'

import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { LanePill, type KanbanLane } from './StatusPill'
import { PipelineProgress } from './PipelineProgress'
import { ExternalLink, RefreshCw, Play, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BoardSummary {
  id: string
  monday_board_id: string
  board_name: string
  figma_project_id: string | null
  figma_project_name: string | null
  auto_queue: boolean
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

export function BoardCard({
  board,
  onSync,
  onQueueEligible,
  syncing,
}: {
  board: BoardSummary
  onSync: (id: string) => void
  onQueueEligible: (id: string) => void
  syncing: boolean
}) {
  const laneCounts: { lane: KanbanLane; count: number }[] = [
    { lane: 'upcoming', count: board.upcoming_count },
    { lane: 'ready_for_figma', count: board.ready_for_figma_count },
    { lane: 'imported', count: board.imported_count },
    { lane: 'exported', count: board.exported_count },
  ].filter(s => s.count > 0)

  const router = useRouter()

  return (
    <Card
      className="group relative transition-colors hover:border-primary/30 cursor-pointer"
      onClick={() => router.push(`/ops/board/${board.id}`)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base font-semibold leading-tight group-hover:text-primary transition-colors">
              {board.board_name}
            </CardTitle>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>Board {board.monday_board_id}</span>
              {board.figma_project_name && (
                <>
                  <span className="text-border">&middot;</span>
                  <span className="truncate">{board.figma_project_name}</span>
                </>
              )}
            </div>
          </div>
          {board.auto_queue && (
            <span className="shrink-0 rounded border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Auto
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <PipelineProgress
          total={board.total_items}
          synced={board.synced_count}
          queued={board.queued_count + board.syncing_count}
          eligible={board.ready_for_figma_count}
          failed={board.failed_count}
        />

        {laneCounts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {laneCounts.map(({ lane, count }) => (
              <LanePill key={lane} lane={lane} count={count} />
            ))}
            {board.failed_count > 0 && (
              <LanePill lane="other" count={board.failed_count} className="!text-[hsl(var(--status-failed))] !bg-[hsl(var(--status-failed)/0.12)]" />
            )}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-border" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => onSync(board.id)}
            disabled={syncing}
          >
            <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
            Sync
          </Button>
          {board.ready_for_figma_count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-[hsl(var(--status-eligible))]"
              onClick={() => onQueueEligible(board.id)}
            >
              <Play className="h-3 w-3" />
              Queue {board.ready_for_figma_count}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3">
            {board.last_board_sync_at && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-2.5 w-2.5" />
                {formatRelative(board.last_board_sync_at)}
              </span>
            )}
            {board.figma_project_id && (
              <a
                href={`https://www.figma.com/files/project/${board.figma_project_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Open in Figma"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
