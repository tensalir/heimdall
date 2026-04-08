'use client'

import { useMemo } from 'react'
import { ChevronRight, Layers, ClipboardList, CheckCircle, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExperimentRow } from '@/components/feedback/ExperimentRow'
import type { FeedbackExperimentRow } from '@/app/api/feedback/route'
import { useResizableColumns, type ColumnDef } from '@/lib/hooks/use-resizable-columns'

const STAKEHOLDER_COLUMN_DEFS: ColumnDef[] = [
  { key: 'experiment', defaultWidth: 160, minWidth: 80, maxWidth: 400 },
  { key: 'brief', defaultWidth: 130, minWidth: 60, maxWidth: 300 },
  { key: 'urgent', defaultWidth: 70, minWidth: 40, maxWidth: 120 },
  { key: 'strategy', defaultWidth: 160, minWidth: 80, maxWidth: 500 },
  { key: 'design', defaultWidth: 160, minWidth: 80, maxWidth: 500 },
  { key: 'copy', defaultWidth: 160, minWidth: 80, maxWidth: 500 },
  { key: 'summary', defaultWidth: 160, minWidth: 80, maxWidth: 500 },
  { key: 'actions', defaultWidth: 130, minWidth: 80, maxWidth: 250 },
]

const COLUMN_LABELS = [
  'Experiment', 'Brief link', 'Urgent', 'Strategy', 'Design', 'Copy', 'Summary', 'Actions',
] as const

const COLUMN_KEYS = STAKEHOLDER_COLUMN_DEFS.map((c) => c.key)
const STORAGE_KEY = 'heimdall:stakeholder-col-widths'

interface StakeholderTableProps {
  byAgency: Record<string, FeedbackExperimentRow[]>
  orderedAgencies: string[]
  selectedAgency: string | null
  onSelectAgency: (agency: string | null) => void
  onEntrySaved: () => void
  onSummaryGenerated: () => void
}

export function StakeholderTable({
  byAgency,
  orderedAgencies,
  selectedAgency,
  onSelectAgency,
  onEntrySaved,
  onSummaryGenerated,
}: StakeholderTableProps) {
  const { widths, getHandleProps, isResizing } = useResizableColumns(STAKEHOLDER_COLUMN_DEFS, STORAGE_KEY)

  const colgroup = useMemo(() => (
    <colgroup>
      {COLUMN_KEYS.map((key) => (
        <col key={key} style={{ width: widths[key] }} />
      ))}
    </colgroup>
  ), [widths])

  if (orderedAgencies.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center text-muted-foreground/40">
        <ClipboardList className="h-8 w-8 mb-2" />
        <p className="text-sm">No experiments in this round</p>
      </div>
    )
  }

  const tableMinWidth = STAKEHOLDER_COLUMN_DEFS.reduce((s, c) => s + (c.minWidth ?? 60), 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-shrink-0 pt-4">
        <table className={cn('w-full border-collapse table-fixed', isResizing && 'select-none')} style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <thead>
            <tr className="border-y border-border">
              {COLUMN_LABELS.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'relative px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                    i < COLUMN_LABELS.length - 1 && 'border-r border-border/50'
                  )}
                >
                  {label}
                  <div {...getHandleProps(COLUMN_KEYS[i])} />
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      <div className="flex-1 overflow-auto">
        <table className={cn('w-full border-collapse table-fixed', isResizing && 'select-none')} style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <tbody>
            {orderedAgencies.map((agency) => (
              <AgencyGroup
                key={agency}
                agency={agency}
                experiments={byAgency[agency] ?? []}
                isSelected={selectedAgency === agency}
                onSelect={() => onSelectAgency(selectedAgency === agency ? null : agency)}
                onEntrySaved={onEntrySaved}
                onSummaryGenerated={onSummaryGenerated}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface AgencyGroupProps {
  agency: string
  experiments: FeedbackExperimentRow[]
  isSelected: boolean
  onSelect: () => void
  onEntrySaved: () => void
  onSummaryGenerated: () => void
}

function AgencyGroup({
  agency,
  experiments,
  isSelected,
  onSelect,
  onEntrySaved,
  onSummaryGenerated,
}: AgencyGroupProps) {
  const withSummary = experiments.filter((e) => e.summary_cache).length
  const sentCount = experiments.filter((e) => e.sent_to_monday).length

  return (
    <>
      <tr
        onClick={onSelect}
        className={cn(
          'cursor-pointer transition-colors border-b border-border/40',
          isSelected ? 'bg-primary/8 hover:bg-primary/10' : 'bg-muted/20 hover:bg-muted/30'
        )}
      >
        <td colSpan={8} className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground/50 transition-transform flex-shrink-0',
                isSelected && 'rotate-90 text-primary/70'
              )}
            />
            <Layers className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
            <span
              className={cn(
                'text-sm font-medium truncate',
                isSelected ? 'text-primary' : 'text-foreground'
              )}
            >
              {agency}
            </span>
            <span className="text-xs text-muted-foreground/50 flex-shrink-0">
              {experiments.length} experiment{experiments.length !== 1 ? 's' : ''}
            </span>
            {withSummary > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground/60 flex-shrink-0">
                <CheckCircle className="h-3 w-3" />
                {withSummary} with summary
              </span>
            )}
            {sentCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-emerald-400/60 flex-shrink-0">
                <Send className="h-3 w-3" />
                {sentCount} sent
              </span>
            )}
          </div>
        </td>
      </tr>

      {experiments.map((exp) => (
        <ExperimentRow
          key={exp.id}
          experiment={exp}
          onEntrySaved={onEntrySaved}
          onSummaryGenerated={onSummaryGenerated}
        />
      ))}
    </>
  )
}
