'use client'

import { cn } from '@/lib/utils'

interface PipelineProgressProps {
  total: number
  synced: number
  queued: number
  failed: number
  eligible: number
  className?: string
}

export function PipelineProgress({
  total,
  synced,
  queued,
  failed,
  eligible,
  className,
}: PipelineProgressProps) {
  if (total === 0) return null

  const pct = (n: number) => Math.max((n / total) * 100, n > 0 ? 2 : 0)

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="bg-[hsl(var(--status-synced))] transition-all duration-500"
          style={{ width: `${pct(synced)}%` }}
        />
        <div
          className="bg-[hsl(var(--status-queued))] transition-all duration-500"
          style={{ width: `${pct(queued)}%` }}
        />
        <div
          className="bg-[hsl(var(--status-eligible))] transition-all duration-500"
          style={{ width: `${pct(eligible)}%` }}
        />
        <div
          className="bg-[hsl(var(--status-failed))] transition-all duration-500"
          style={{ width: `${pct(failed)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {synced}/{total} synced
        {queued > 0 && <span> &middot; {queued} queued</span>}
        {eligible > 0 && <span> &middot; {eligible} eligible</span>}
        {failed > 0 && <span> &middot; {failed} failed</span>}
      </p>
    </div>
  )
}
