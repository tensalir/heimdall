'use client'

import Link from 'next/link'
import { LanePill, type KanbanLane } from './StatusPill'

interface FileCounts {
  upcoming: number
  ready: number
  imported: number
  exported: number
  failed: number
}

interface FileCardProps {
  fileKey: string
  name: string
  thumbnailUrl: string | null
  lastModified: string | null
  batchCanonical: string | null
  counts: FileCounts
}

function extractMonthLabel(name: string): string | null {
  const match = name.match(/^([A-Z]+)\s+(\d{4})/i)
  if (!match) return null
  const month = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase()
  return `${month} ${match[2]}`
}

export function FileCard({ fileKey, name, thumbnailUrl, lastModified, batchCanonical, counts }: FileCardProps) {
  const monthLabel = extractMonthLabel(name)
  const total = counts.upcoming + counts.ready + counts.imported + counts.exported
  const href = batchCanonical ? `/ops/batch/${batchCanonical}` : '#'

  const laneCounts: { lane: KanbanLane; count: number; key: string }[] = [
    { lane: 'ready_for_figma', count: counts.ready, key: 'ready' },
    { lane: 'imported', count: counts.imported, key: 'imported' },
    { lane: 'exported', count: counts.exported, key: 'exported' },
  ].filter(l => l.count > 0)

  return (
    <Link href={href} className="group block">
      <div className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-primary/40 hover:shadow-lg">
        {/* Thumbnail */}
        <div className="relative aspect-[16/10] bg-muted/60 overflow-hidden">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-3xl font-bold text-muted-foreground/20 uppercase tracking-wider">
                {monthLabel ?? name.slice(0, 3)}
              </span>
            </div>
          )}
          {/* Month badge overlay */}
          {monthLabel && (
            <div className="absolute top-2.5 left-2.5 rounded-md bg-background/85 backdrop-blur-sm px-2.5 py-1">
              <span className="text-sm font-bold tracking-tight">{monthLabel}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground truncate" title={name}>
            {name}
          </p>

          {total > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {laneCounts.map(({ lane, count, key }) => (
                <LanePill key={key} lane={lane} count={count} />
              ))}
              {counts.failed > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[hsl(var(--status-failed)/0.12)] text-[hsl(var(--status-failed))]">
                  {counts.failed} failed
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground/50">No briefings synced</p>
          )}

          {lastModified && (
            <p className="text-[10px] text-muted-foreground/60">
              Edited {formatRelative(lastModified)}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
