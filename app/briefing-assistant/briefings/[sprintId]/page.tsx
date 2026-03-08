'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  LayoutGrid,
  Calendar,
  ExternalLink,
  FileText,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface SprintBatch {
  id: string
  batch_key: string
  batch_label: string
  batch_type: string
  monday_board_id: string | null
  figma_file_key: string | null
}

interface AssignmentRow {
  id: string
  briefName: string
  productOrUseCase: string
  format: string
  funnel: string
  agencyRef: string
  assetCount: number
  status?: string
  batchKey: string
  mondayItemId?: string
}

interface SprintDetail {
  id: string
  name: string
  created_at: string
  updated_at: string
  batches: SprintBatch[]
  assignments: AssignmentRow[]
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted/60 text-muted-foreground',
  edited: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  synced_to_monday: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  queued: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
}

export default function SprintDetailPage() {
  const params = useParams<{ sprintId: string }>()
  const [sprint, setSprint] = useState<SprintDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSprint = useCallback(async () => {
    try {
      const res = await fetch(`/api/briefing-assistant/sprints/${params.sprintId}`)
      const data = await res.json()
      setSprint(data.sprint ?? null)
    } catch {
      setSprint(null)
    } finally {
      setLoading(false)
    }
  }, [params.sprintId])

  useEffect(() => {
    fetchSprint()
  }, [fetchSprint])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!sprint) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <p className="text-sm text-muted-foreground">Sprint not found.</p>
        <Link href="/briefing-assistant/briefings" className="text-xs text-primary mt-2 hover:underline">
          Back to Briefings
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/briefing-assistant/briefings"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
              {sprint.name}
            </h1>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 mt-0.5">
              <span className="flex items-center gap-1">
                <LayoutGrid className="h-3 w-3" />
                {sprint.assignments.length} brief{sprint.assignments.length !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(sprint.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
              {sprint.batches.map((b) => (
                <span key={b.batch_key} className="flex items-center gap-1">
                  {b.batch_label}
                  {b.monday_board_id && (
                    <a
                      href={`https://loopearplugs.monday.com/boards/${b.monday_board_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-foreground"
                    >
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-subtle p-6">
        {sprint.assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <FileText className="h-10 w-10 text-muted-foreground/15 mb-4" />
            <p className="text-sm text-muted-foreground">No assignments in this sprint yet.</p>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Name</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Product</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Format</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Funnel</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Assets</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Status</th>
                </tr>
              </thead>
              <tbody>
                {sprint.assignments.map((a) => {
                  const statusLabel = (a.status ?? 'draft').replace(/_/g, ' ')
                  const statusClass = STATUS_STYLES[a.status ?? 'draft'] ?? STATUS_STYLES.draft
                  return (
                    <tr key={a.id} className="border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-2.5 font-medium text-foreground truncate max-w-[200px]">{a.briefName}</td>
                      <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[160px]">{a.productOrUseCase}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.format}</td>
                      <td className="px-4 py-2.5 text-muted-foreground uppercase text-xs">{a.funnel}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{a.assetCount}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn('inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize', statusClass)}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
