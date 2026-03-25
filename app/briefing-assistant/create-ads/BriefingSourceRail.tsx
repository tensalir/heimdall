'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  ImageIcon,
  FileText,
  MessageCircle,
  TrendingUp,
  Workflow,
  ChevronDown,
  Sparkles,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { SourceItem, SourceType } from './createBriefingTypes'
import { SourcePickerDialog } from './SourcePickerDialog'

const SOURCE_TYPE_ORDER: SourceType[] = [
  'meta-ad',
  'trend',
  'social-comment',
  'workflow-output',
  'manual',
]

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; icon: React.ElementType }> = {
  'meta-ad': { label: 'Ads', icon: ImageIcon },
  trend: { label: 'Trend', icon: TrendingUp },
  'social-comment': { label: 'Social', icon: MessageCircle },
  'workflow-output': { label: 'Flow', icon: Workflow },
  manual: { label: 'Manual', icon: FileText },
}

function DiamondMarker({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn(
        'inline-block size-2 shrink-0 rotate-45 transition-colors duration-100 ease-out',
        selected ? 'bg-primary' : 'bg-muted-foreground/35',
      )}
      aria-hidden
    />
  )
}

export interface BriefingSourceRailProps {
  selectedIds: string[]
  onToggleSelect: (id: string) => void
  onAddSources: (ids: string[]) => void
  onGenerateBrief: () => void
  generatingBrief: boolean
  /** Deep link: pre-select and merge item into list */
  initialSourceId?: string | null
}

export function BriefingSourceRail({
  selectedIds,
  onToggleSelect,
  onAddSources,
  onGenerateBrief,
  generatingBrief,
  initialSourceId,
}: BriefingSourceRailProps) {
  const [items, setItems] = useState<SourceItem[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [itemsRefreshKey, setItemsRefreshKey] = useState(0)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    let cancelled = false
    const isFirstLoad = itemsRefreshKey === 0
    if (isFirstLoad) setSourcesLoading(true)
    ;(async () => {
      try {
        const res = await fetch('/api/briefing-assistant/source-items?limit=100')
        const data = await res.json()
        if (!cancelled) setItems((data.items ?? []) as SourceItem[])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled && isFirstLoad) setSourcesLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [itemsRefreshKey])

  useEffect(() => {
    if (!initialSourceId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/briefing-assistant/source-items/${initialSourceId}`)
        const data = await res.json()
        if (cancelled || !data.item) return
        const item = data.item as SourceItem
        setItems((prev) => {
          if (prev.some((i) => i.id === item.id)) return prev
          return [item, ...prev]
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [initialSourceId])

  const filteredItems = useMemo(() => {
    if (typeFilter.length === 0) return items
    const allowed = new Set(typeFilter)
    return items.filter((i) => allowed.has(i.type))
  }, [items, typeFilter])

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handlePickerAdd = useCallback(
    (ids: string[]) => {
      onAddSources(ids)
      setItemsRefreshKey((k) => k + 1)
    },
    [onAddSources],
  )

  const n = selectedIds.length

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <SourcePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        selectedIds={selectedIds}
        onAddSources={handlePickerAdd}
      />

      <div className="flex-shrink-0 border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence sources
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-primary"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-3" />
            Add sources
          </Button>
        </div>
        <ToggleGroup
          type="multiple"
          size="sm"
          variant="outline"
          value={typeFilter}
          onValueChange={setTypeFilter}
          className="mt-2 flex w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-0.5 scrollbar-subtle"
        >
          {SOURCE_TYPE_ORDER.map((t) => {
            const cfg = SOURCE_TYPE_CONFIG[t]
            const Icon = cfg.icon
            return (
              <ToggleGroupItem
                key={t}
                value={t}
                aria-label={`Filter ${cfg.label}`}
                className="h-7 shrink-0 gap-1 px-2 text-[10px] data-[state=on]:border-primary/40 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
              >
                <Icon className="size-3 shrink-0" />
                {cfg.label}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
        {sourcesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No sources yet</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Browse the Meta Ads Library, discover trends, or run a workflow to create source material.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setPickerOpen(true)}>
              Browse sources
            </Button>
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No items match the selected filters. Clear filters to see all sources.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {filteredItems.map((item) => {
              const config = SOURCE_TYPE_CONFIG[item.type] ?? SOURCE_TYPE_CONFIG.manual
              const Icon = config.icon
              const selected = selectedSet.has(item.id)
              const expanded = expandedIds.has(item.id)
              const body = (item.body_text ?? '').trim() || item.preview
              return (
                <li key={item.id}>
                  <div
                    className={cn(
                      'border-l-2 transition-colors duration-100',
                      selected ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/30',
                    )}
                  >
                    <div className="flex items-start gap-2 px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => onToggleSelect(item.id)}
                        className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-sm outline-none transition-transform duration-75 hover:bg-muted/50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-pressed={selected}
                        aria-label={selected ? 'Deselect source' : 'Select source'}
                      >
                        <DiamondMarker selected={selected} />
                      </button>
                      {item.thumbnail_url ? (
                        <div className="size-10 shrink-0 overflow-hidden border border-border/40 bg-muted/20">
                          <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                        </div>
                      ) : (
                        <div className="flex size-10 shrink-0 items-center justify-center border border-border/40 bg-muted/20">
                          <Icon className="size-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => onToggleSelect(item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                        <span
                          className={cn(
                            'mt-0.5 inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                          )}
                        >
                          {config.label}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleExpand(item.id)
                        }}
                        className="shrink-0 rounded-sm p-1 text-muted-foreground outline-none transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse preview' : 'Expand preview'}
                      >
                        <ChevronDown
                          className={cn('size-4 transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]', expanded && 'rotate-180')}
                        />
                      </button>
                    </div>
                    <div
                      className={cn(
                        'grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none',
                        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="space-y-2 border-t border-border/30 bg-card/50 px-4 pb-3 pl-[4.5rem] pt-2">
                          {item.thumbnail_url && expanded ? (
                            <div className="aspect-[4/3] max-h-[140px] w-full overflow-hidden border border-border/40">
                              <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                            </div>
                          ) : null}
                          <p className="max-h-[120px] overflow-y-auto text-xs leading-relaxed text-muted-foreground scrollbar-subtle">
                            {body || '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex-shrink-0 border-t border-border bg-background px-4 py-4 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_-4px_16px_-6px_rgba(0,0,0,0.35)]">
        <Button
          type="button"
          className="h-10 w-full gap-2 active:scale-[0.98] motion-reduce:active:scale-100"
          onClick={onGenerateBrief}
          disabled={generatingBrief || n === 0}
        >
          {generatingBrief ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {n === 0 ? 'Generate brief' : `Generate from ${n} source${n === 1 ? '' : 's'}`}
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Select sources above, then generate a draft briefing.
        </p>
      </div>
    </div>
  )
}
