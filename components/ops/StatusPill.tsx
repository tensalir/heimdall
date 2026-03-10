'use client'

import { cn } from '@/lib/utils'

export type PipelineStatus =
  | 'new'
  | 'eligible'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'skipped'

export type KanbanLane = 'upcoming' | 'ready_for_figma' | 'imported' | 'exported' | 'other'

const STATUS_CONFIG: Record<PipelineStatus, { label: string; bg: string; text: string; dot: string }> = {
  new:      { label: 'New',      bg: 'bg-[hsl(var(--status-new)/0.12)]',      text: 'text-[hsl(var(--status-new))]',      dot: 'bg-[hsl(var(--status-new))]' },
  eligible: { label: 'Eligible', bg: 'bg-[hsl(var(--status-eligible)/0.12)]', text: 'text-[hsl(var(--status-eligible))]', dot: 'bg-[hsl(var(--status-eligible))]' },
  queued:   { label: 'Queued',   bg: 'bg-[hsl(var(--status-queued)/0.12)]',   text: 'text-[hsl(var(--status-queued))]',   dot: 'bg-[hsl(var(--status-queued))]' },
  syncing:  { label: 'Syncing',  bg: 'bg-[hsl(var(--status-syncing)/0.12)]',  text: 'text-[hsl(var(--status-syncing))]',  dot: 'bg-[hsl(var(--status-syncing))] animate-pulse' },
  synced:   { label: 'Synced',   bg: 'bg-[hsl(var(--status-synced)/0.12)]',   text: 'text-[hsl(var(--status-synced))]',   dot: 'bg-[hsl(var(--status-synced))]' },
  failed:   { label: 'Failed',   bg: 'bg-[hsl(var(--status-failed)/0.12)]',   text: 'text-[hsl(var(--status-failed))]',   dot: 'bg-[hsl(var(--status-failed))]' },
  skipped:  { label: 'Skipped',  bg: 'bg-[hsl(var(--status-skipped)/0.12)]',  text: 'text-[hsl(var(--status-skipped))]',  dot: 'bg-[hsl(var(--status-skipped))]' },
}

const LANE_CONFIG: Record<KanbanLane, { label: string; bg: string; text: string; dot: string }> = {
  upcoming:        { label: 'Upcoming',          bg: 'bg-[hsl(var(--status-new)/0.12)]',      text: 'text-[hsl(var(--status-new))]',      dot: 'bg-[hsl(var(--status-new))]' },
  ready_for_figma: { label: 'Ready for Figma',   bg: 'bg-[hsl(var(--status-eligible)/0.12)]', text: 'text-[hsl(var(--status-eligible))]', dot: 'bg-[hsl(var(--status-eligible))]' },
  imported:        { label: 'Imported',           bg: 'bg-[hsl(var(--status-synced)/0.12)]',   text: 'text-[hsl(var(--status-synced))]',   dot: 'bg-[hsl(var(--status-synced))]' },
  exported:        { label: 'Exported to Frontify', bg: 'bg-[hsl(var(--status-queued)/0.12)]', text: 'text-[hsl(var(--status-queued))]',   dot: 'bg-[hsl(var(--status-queued))]' },
  other:           { label: 'Other',              bg: 'bg-[hsl(var(--status-skipped)/0.12)]',  text: 'text-[hsl(var(--status-skipped))]',  dot: 'bg-[hsl(var(--status-skipped))]' },
}

export function StatusPill({
  status,
  count,
  className,
}: {
  status: PipelineStatus
  count?: number
  className?: string
}) {
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </span>
  )
}

export function LanePill({
  lane,
  count,
  className,
}: {
  lane: KanbanLane
  count?: number
  className?: string
}) {
  const config = LANE_CONFIG[lane]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bg,
        config.text,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
      {config.label}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </span>
  )
}

export function SyncBadge({ status, className }: { status: PipelineStatus; className?: string }) {
  if (status === 'synced' || status === 'new' || status === 'eligible') return null
  const config = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
        config.bg,
        config.text,
        className
      )}
      title={`Sync: ${config.label}`}
    >
      <span className={cn('h-1 w-1 rounded-full', config.dot)} />
      {config.label}
    </span>
  )
}

export function StatusDot({ status, className }: { status: PipelineStatus; className?: string }) {
  const config = STATUS_CONFIG[status]
  return <span className={cn('inline-block h-2 w-2 rounded-full', config.dot, className)} />
}

export function getKanbanLane(mondayStatus: string | null, pipelineStatus: PipelineStatus): KanbanLane {
  if (pipelineStatus === 'failed' || pipelineStatus === 'skipped') return 'other'
  if (pipelineStatus === 'synced' || pipelineStatus === 'queued' || pipelineStatus === 'syncing') {
    const status = (mondayStatus ?? '').toLowerCase().trim()
    if (status === 'exported to frontify') return 'exported'
    return 'imported'
  }
  const status = (mondayStatus ?? '').toLowerCase().trim()
  if (status === 'brief wip') return 'upcoming'
  if (status === 'brief ready / approved') return 'ready_for_figma'
  if (status === 'exported to frontify') return 'exported'
  return 'other'
}
