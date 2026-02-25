'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { BriefingAssignment, WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import { LayoutGrid, ExternalLink, Sparkles, Loader2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export type AssignmentRow = BriefingAssignment & {
  mondayItemId?: string
  figmaPageUrl?: string
  targetBoardId?: string | null
  status?: string
  workingDocSections?: WorkingDocSections
}

interface BoardOption {
  batch_key: string
  label: string
  board_id: string
}

export interface FeedbackStatusItem {
  hasExperiment: boolean
  roles: string[]
  sentToMonday: boolean
}

const PRODUCT_OPTIONS = ['quiet', 'engage', 'experience', 'dream', 'switch', 'bundles', 'engage kids', 'earplugs collection']
const FORMAT_OPTIONS = ['static', 'video', 'static_carousel', 'video_carousel']
const FUNNEL_OPTIONS = ['tof', 'bof', 'retention']
const AGENCY_OPTIONS = ['Studio', 'Gain', 'Statiq', 'Goodo']

const STATUS_LABELS: Record<string, string> = {
  draft: 'draft',
  edited: 'edited',
  approved: 'approved',
  synced_to_monday: 'synced',
  queued: 'queued',
}

export type AssignmentPatch = Partial<{
  briefName: string
  productOrUseCase: string
  format: string
  funnel: string
  agencyRef: string
  assetCount: number
  mondayItemId: string | null
  targetBoardId: string | null
}>

function AutoResizeTextarea({
  defaultValue,
  onSave,
  className,
}: {
  defaultValue: string
  onSave: (value: string) => void
  className?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 28)}px`
  }, [])

  useEffect(() => {
    resize()
  }, [resize])

  return (
    <textarea
      ref={ref}
      autoFocus
      defaultValue={defaultValue}
      rows={1}
      className={cn(
        'w-full rounded-md border border-primary/30 bg-background px-2 py-1.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40',
        className
      )}
      onInput={resize}
      onChange={() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => {
          if (ref.current) onSave(ref.current.value)
        }, 1500)
      }}
      onBlur={() => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        if (ref.current) onSave(ref.current.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault()
          ref.current?.blur()
        }
      }}
    />
  )
}

function FieldDetailPopover({
  label,
  value,
  children,
  onSave,
  metadata,
}: {
  label: string
  value: string
  children: React.ReactNode
  onSave?: (value: string) => void
  metadata?: React.ReactNode
}) {
  const [localValue, setLocalValue] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, 60)}px`
  }, [])

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" sideOffset={4}>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
            <Maximize2 className="h-3 w-3 text-muted-foreground/40" />
          </div>
          {onSave ? (
            <textarea
              ref={ref}
              value={localValue}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary/40"
              onChange={(e) => { setLocalValue(e.target.value); resize() }}
              onBlur={() => onSave(localValue)}
            />
          ) : (
            <p className="text-sm text-foreground">{value || '—'}</p>
          )}
          {metadata ? <div className="border-t border-border/40 pt-2">{metadata}</div> : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status ?? 'draft'
  return (
    <Badge
      variant="outline"
      className={cn(
        'text-[10px] font-semibold px-2 py-0.5 rounded-md border',
        label === 'synced' && 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30',
        label === 'approved' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
        label === 'edited' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
        label === 'queued' && 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
        (label === 'draft') && 'bg-muted/40 text-muted-foreground border-border/60'
      )}
    >
      {label}
    </Badge>
  )
}

function BriefingPreviewCell({
  row,
  onGenerate,
  generating,
  onOpenDoc,
}: {
  row: AssignmentRow
  onGenerate?: () => void
  generating: boolean
  onOpenDoc?: () => void
}) {
  const sections = row.workingDocSections
  if (sections && typeof sections === 'object') {
    const values = Object.values(sections).filter((v): v is string => typeof v === 'string' && v.length > 0)
    const preview = values[0]?.slice(0, 120)
    return (
      <button
        type="button"
        onClick={onOpenDoc}
        className="text-left w-full group"
      >
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 group-hover:text-foreground transition-colors">
          {preview}{preview && preview.length >= 120 ? '...' : ''}
        </p>
        <span className="text-[10px] text-primary/70 group-hover:text-primary mt-0.5 inline-block">Open doc</span>
      </button>
    )
  }

  if (!onGenerate) return <span className="text-muted-foreground/40">—</span>

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onGenerate}
      disabled={generating}
      className="h-7 text-xs"
    >
      {generating ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      ) : (
        <Sparkles className="h-3 w-3 shrink-0" />
      )}
      Generate
    </Button>
  )
}

interface BriefingAssignmentsTableProps {
  assignments: AssignmentRow[]
  selectedId: string | null
  onSelect: (id: string) => void
  loading?: boolean
  batchBoardMap?: Record<string, string>
  availableBoards?: BoardOption[]
  onBoardChange?: (assignmentId: string, boardId: string | null) => void
  feedbackStatusMap?: Record<string, FeedbackStatusItem>
  onPatch?: (assignmentId: string, patch: AssignmentPatch) => void | Promise<void>
  onAddRow?: () => void
  onGenerateBriefing?: (assignmentId: string) => void | Promise<void>
  generatingIds?: Set<string>
}

export function BriefingAssignmentsTable({
  assignments,
  selectedId,
  onSelect,
  loading = false,
  batchBoardMap = {},
  availableBoards = [],
  onBoardChange,
  feedbackStatusMap = {},
  onPatch,
  onAddRow,
  onGenerateBriefing,
  generatingIds = new Set(),
}: BriefingAssignmentsTableProps) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)

  const handleSave = useCallback(
    async (rowId: string, field: string, value: string | number) => {
      setEditingCell(null)
      if (!onPatch) return
      const payload: AssignmentPatch = {}
      if (field === 'briefName') payload.briefName = String(value)
      if (field === 'productOrUseCase') payload.productOrUseCase = String(value)
      if (field === 'format') payload.format = String(value)
      if (field === 'funnel') payload.funnel = String(value)
      if (field === 'agencyRef') payload.agencyRef = String(value)
      if (field === 'assetCount') payload.assetCount = Number(value)
      if (Object.keys(payload).length === 0) return
      await onPatch(rowId, payload)
    },
    [onPatch]
  )

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  const columnCount = 10 + (onGenerateBriefing ? 1 : 0) + (availableBoards.length > 0 ? 1 : 0)

  const thBase = 'px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 border-r border-border/15 last:border-r-0'
  const tdBase = 'px-4 py-3.5 text-xs border-r border-border/15 last:border-r-0 align-top'
  const stickyFirst = 'sticky left-0 z-10 bg-card after:content-[""] after:absolute after:right-0 after:top-0 after:h-full after:w-px after:bg-border/30'

  return (
    <div className="flex-1 min-h-0 overflow-auto flex flex-col">
      <table className="w-full border-collapse text-left table-fixed">
        <thead className="sticky top-0 bg-card/95 backdrop-blur border-b border-border z-10">
          <tr>
            <th className={cn(thBase, stickyFirst)} style={{ width: '18%' }}>Name</th>
            <th className={thBase} style={{ width: '10%' }}>Product</th>
            <th className={thBase} style={{ width: '7%' }}>Source</th>
            <th className={thBase} style={{ width: '9%' }}>Format</th>
            <th className={thBase} style={{ width: '7%' }}>Funnel</th>
            <th className={thBase} style={{ width: '8%' }}>Agency</th>
            <th className={thBase} style={{ width: '5%' }}>Assets</th>
            <th className={thBase} style={{ width: '8%' }}>Experiment</th>
            <th className={thBase} style={{ width: '7%' }}>Status</th>
            {onGenerateBriefing ? (
              <th className={thBase} style={{ width: '12%' }}>Briefing</th>
            ) : null}
            {availableBoards.length > 0 ? (
              <th className={thBase} style={{ width: '9%' }}>Board</th>
            ) : null}
            <th className={thBase} style={{ width: '6%' }}>Links</th>
          </tr>
        </thead>
        <tbody>
          {assignments.length === 0 ? (
            <tr>
              <td colSpan={columnCount} className="px-4 py-16 text-center border-r-0">
                <div className="flex flex-col items-center gap-4">
                  <LayoutGrid className="h-12 w-12 text-muted-foreground/20" aria-hidden />
                  <p className="text-sm text-muted-foreground">
                    Run a split, import from Monday, or add a new brief to get started.
                  </p>
                  {onAddRow ? (
                    <button type="button" onClick={onAddRow} className="mt-1 text-sm text-primary hover:underline">
                      Add first brief
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ) : (
          assignments.map((row, index) => {
            const isSelected = row.id === selectedId
            const resolvedBoardId = row.targetBoardId ?? batchBoardMap[row.batchKey]
            const defaultBoardId = batchBoardMap[row.batchKey]
            const isOverridden = row.targetBoardId != null && row.targetBoardId !== defaultBoardId
            const sourceLabel = row.source ?? 'split'
            const statusRaw = row.status ?? 'draft'
            return (
              <tr
                key={row.id}
                onClick={() => onSelect(row.id)}
                style={{ animationDelay: `${index * 20}ms` }}
                className={cn(
                  'border-b border-border/40 transition-colors duration-100 cursor-pointer group',
                  'hover:bg-muted/20',
                  isSelected && 'bg-primary/8 hover:bg-primary/10',
                  'animate-in fade-in-0 slide-in-from-bottom-1 duration-200'
                )}
              >
                {/* Name — editable with popover */}
                <td
                  className={cn(
                    tdBase,
                    stickyFirst,
                    isSelected && 'bg-primary/8 border-l-2 border-l-primary'
                  )}
                  onClick={(e) => e.stopPropagation()}
                >
                  {editingCell?.id === row.id && editingCell?.field === 'briefName' ? (
                    <AutoResizeTextarea
                      defaultValue={row.briefName}
                      onSave={(v) => handleSave(row.id, 'briefName', v)}
                    />
                  ) : (
                    <FieldDetailPopover
                      label="Brief name"
                      value={row.briefName}
                      onSave={onPatch ? (v) => handleSave(row.id, 'briefName', v) : undefined}
                      metadata={
                        <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                          {row.mondayItemId ? <span>Monday: {row.mondayItemId}</span> : null}
                          <span>Batch: {row.batchKey}</span>
                        </div>
                      }
                    >
                      <button
                        type="button"
                        className="text-left w-full truncate text-sm font-medium text-foreground hover:bg-muted/40 rounded-md px-1.5 py-1 -mx-1.5 -my-1 transition-colors"
                        onDoubleClick={() => setEditingCell({ id: row.id, field: 'briefName' })}
                      >
                        {row.briefName}
                      </button>
                    </FieldDetailPopover>
                  )}
                </td>

                {/* Product */}
                <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.productOrUseCase}
                    onChange={(e) => onPatch && handleSave(row.id, 'productOrUseCase', e.target.value)}
                    className="w-full rounded-md border-0 bg-transparent px-0 py-0 text-xs text-foreground hover:bg-muted/40 focus:bg-muted/40 focus:ring-0 cursor-pointer transition-colors"
                  >
                    {PRODUCT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {!PRODUCT_OPTIONS.includes(row.productOrUseCase) ? (
                      <option value={row.productOrUseCase}>{row.productOrUseCase}</option>
                    ) : null}
                  </select>
                </td>

                {/* Source */}
                <td className={tdBase}>
                  <Badge variant="outline" className="text-[10px] font-medium bg-muted/30 text-muted-foreground border-border/40">
                    {sourceLabel}
                  </Badge>
                </td>

                {/* Format */}
                <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.format}
                    onChange={(e) => onPatch && handleSave(row.id, 'format', e.target.value)}
                    className="w-full rounded-md border-0 bg-transparent px-0 py-0 text-xs text-foreground hover:bg-muted/40 focus:bg-muted/40 focus:ring-0 cursor-pointer transition-colors"
                  >
                    {FORMAT_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                {/* Funnel */}
                <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.funnel}
                    onChange={(e) => onPatch && handleSave(row.id, 'funnel', e.target.value)}
                    className="w-full rounded-md border-0 bg-transparent px-0 py-0 text-xs text-foreground hover:bg-muted/40 focus:bg-muted/40 focus:ring-0 cursor-pointer transition-colors"
                  >
                    {FUNNEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </td>

                {/* Agency */}
                <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                  <select
                    value={row.agencyRef}
                    onChange={(e) => onPatch && handleSave(row.id, 'agencyRef', e.target.value)}
                    className="w-full rounded-md border-0 bg-transparent px-0 py-0 text-xs text-foreground hover:bg-muted/40 focus:bg-muted/40 focus:ring-0 cursor-pointer transition-colors"
                  >
                    {AGENCY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {row.agencyRef && !AGENCY_OPTIONS.includes(row.agencyRef) ? (
                      <option value={row.agencyRef}>{row.agencyRef}</option>
                    ) : null}
                  </select>
                </td>

                {/* Assets */}
                <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                  {editingCell?.id === row.id && editingCell?.field === 'assetCount' ? (
                    <input
                      type="number"
                      min={1}
                      autoFocus
                      defaultValue={row.assetCount}
                      className="w-14 rounded-md border border-primary/30 bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                      onBlur={(e) => handleSave(row.id, 'assetCount', Number(e.target.value) || 1)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="text-foreground hover:bg-muted/40 rounded-md px-1.5 py-0.5 -mx-1 transition-colors"
                      onClick={() => setEditingCell({ id: row.id, field: 'assetCount' })}
                    >
                      {row.assetCount}
                    </button>
                  )}
                </td>

                {/* Experiment */}
                <td className={cn(tdBase, 'text-muted-foreground/50')} onClick={(e) => e.stopPropagation()}>
                  <span>—</span>
                </td>

                {/* Status */}
                <td className={cn(tdBase)}>
                  <StatusBadge status={statusRaw} />
                </td>

                {/* Briefing preview / generate */}
                {onGenerateBriefing ? (
                  <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                    <BriefingPreviewCell
                      row={row}
                      onGenerate={() => onGenerateBriefing(row.id)}
                      generating={generatingIds.has(row.id)}
                      onOpenDoc={() => onSelect(row.id)}
                    />
                  </td>
                ) : null}

                {/* Board */}
                {availableBoards.length > 0 ? (
                  <td className={cn(tdBase)} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={row.targetBoardId ?? defaultBoardId ?? ''}
                      onChange={(e) => onBoardChange?.(row.id, e.target.value || null)}
                      className={cn(
                        'w-full rounded-md border-0 bg-transparent px-0 py-0 text-[11px] text-foreground hover:bg-muted/40 focus:ring-0 cursor-pointer',
                        isOverridden && 'text-amber-500'
                      )}
                    >
                      {availableBoards.map((b) => (
                        <option key={b.batch_key} value={b.board_id}>{b.label}</option>
                      ))}
                    </select>
                  </td>
                ) : null}

                {/* Links */}
                <td className={cn(tdBase)}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {resolvedBoardId && row.mondayItemId ? (
                      <a
                        href={`https://loopearplugs.monday.com/boards/${resolvedBoardId}/pulses/${row.mondayItemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                        aria-label="Open Monday item"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {row.figmaPageUrl ? (
                      <a
                        href={row.figmaPageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground p-0.5 rounded transition-colors"
                        aria-label="Open Figma page"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                    {row.mondayItemId && feedbackStatusMap[row.mondayItemId]?.hasExperiment ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-medium px-1.5 py-0',
                          feedbackStatusMap[row.mondayItemId].sentToMonday
                            ? 'bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30'
                            : 'bg-muted/40 text-muted-foreground border-border/40'
                        )}
                        title={`Feedback: ${feedbackStatusMap[row.mondayItemId].roles.length}/3 roles${feedbackStatusMap[row.mondayItemId].sentToMonday ? ', sent to Monday' : ''}`}
                      >
                        {feedbackStatusMap[row.mondayItemId].sentToMonday ? 'Sent' : `${feedbackStatusMap[row.mondayItemId].roles.length}/3`}
                      </Badge>
                    ) : null}
                  </div>
                </td>
              </tr>
            )
          })
          )}
        </tbody>
      </table>
    </div>
  )
}
