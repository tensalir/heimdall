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
  X,
  Star,
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [itemsRefreshKey, setItemsRefreshKey] = useState(0)

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])

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
    return () => { cancelled = true }
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
        setItems((prev) => prev.some((i) => i.id === item.id) ? prev : [item, ...prev])
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [initialSourceId])

  useEffect(() => {
    if (selectedIds.length === 0) return
    const knownIds = new Set(items.map((i) => i.id))
    const missing = selectedIds.filter((id) => !knownIds.has(id))
    if (missing.length === 0) return
    let cancelled = false
    ;(async () => {
      const fetched: SourceItem[] = []
      for (const id of missing) {
        try {
          const res = await fetch(`/api/briefing-assistant/source-items/${id}`)
          const data = await res.json()
          if (cancelled) return
          if (data.item) fetched.push(data.item as SourceItem)
        } catch { /* ignore */ }
      }
      if (!cancelled && fetched.length > 0) {
        setItems((prev) => {
          const existing = new Set(prev.map((i) => i.id))
          const newItems = fetched.filter((f) => !existing.has(f.id))
          return newItems.length > 0 ? [...newItems, ...prev] : prev
        })
      }
    })()
    return () => { cancelled = true }
  }, [selectedIds, items])

  const selectedItems = useMemo(
    () => selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as SourceItem[],
    [selectedIds, itemMap],
  )

  const catalogItems = useMemo(() => {
    const base = items.filter((i) => !selectedSet.has(i.id))
    if (typeFilter.length === 0) return base
    const allowed = new Set(typeFilter)
    return base.filter((i) => allowed.has(i.type))
  }, [items, selectedSet, typeFilter])

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
        {n > 0 && (
          <div className="border-b border-border bg-primary/[0.02]">
            <div className="px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                Selected ({n})
              </span>
            </div>
            <ul>
              {selectedItems.map((item, idx) => {
                const config = SOURCE_TYPE_CONFIG[item.type] ?? SOURCE_TYPE_CONFIG.manual
                const Icon = config.icon
                const isPrimary = idx === 0
                const expanded = expandedId === item.id
                const body = (item.body_text ?? '').trim() || item.preview
                return (
                  <li key={item.id} className="border-t border-border/30">
                    <div className={cn('border-l-2 border-primary bg-primary/5')}>
                      <div className="flex items-start gap-2 px-4 py-2">
                        {isPrimary ? (
                          <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center" title="Primary source">
                            <Star className="size-3 fill-primary text-primary" />
                          </span>
                        ) : (
                          <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center">
                            <DiamondMarker selected />
                          </span>
                        )}
                        {item.thumbnail_url ? (
                          <div className="size-8 shrink-0 overflow-hidden border border-border/40 bg-muted/20">
                            <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                          </div>
                        ) : (
                          <div className="flex size-8 shrink-0 items-center justify-center border border-border/40 bg-muted/20">
                            <Icon className="size-3.5 text-muted-foreground/40" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExpand(item.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {config.label}{isPrimary ? ' · Primary' : ''}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onToggleSelect(item.id)}
                          className="shrink-0 rounded-sm p-1 text-muted-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-primary/30"
                          aria-label="Remove from selection"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                      {expanded && (
                        <div className="border-t border-border/30 bg-card/50 px-4 pb-3 pl-[4rem] pt-2">
                          {item.thumbnail_url && (
                            <div className="mb-2 aspect-[4/3] w-full overflow-hidden border border-border/40">
                              <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                            </div>
                          )}
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            {body || '—'}
                          </p>
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {sourcesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 && selectedIds.length === 0 ? (
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
        ) : (
          <>
            {catalogItems.length > 0 && (
              <div className="px-4 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Browse
                </span>
              </div>
            )}
            <div className="px-4 pb-1">
              <ToggleGroup
                type="multiple"
                size="sm"
                variant="outline"
                value={typeFilter}
                onValueChange={setTypeFilter}
                className="flex w-full flex-nowrap justify-start gap-1 overflow-x-auto pb-0.5 scrollbar-subtle"
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
            {catalogItems.length === 0 ? (
              <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                {typeFilter.length > 0
                  ? 'No items match the selected filters.'
                  : 'All available sources are in your selection.'}
              </p>
            ) : (
              <ul className="divide-y divide-border/40">
                {catalogItems.map((item) => {
                  const config = SOURCE_TYPE_CONFIG[item.type] ?? SOURCE_TYPE_CONFIG.manual
                  const Icon = config.icon
                  const expanded = expandedId === item.id
                  const body = (item.body_text ?? '').trim() || item.preview
                  return (
                    <li key={item.id}>
                      <div className="border-l-2 border-transparent transition-colors duration-100 hover:bg-muted/30">
                        <div className="flex items-start gap-2 px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => onToggleSelect(item.id)}
                            className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-sm outline-none transition-transform duration-75 hover:bg-muted/50 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-primary/30"
                            aria-label="Select source"
                          >
                            <DiamondMarker selected={false} />
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
                            onClick={() => toggleExpand(item.id)}
                            className="min-w-0 flex-1 text-left"
                          >
                            <p className="truncate text-xs font-medium text-foreground">{item.title}</p>
                            <span className="mt-0.5 inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
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
                        {expanded && (
                          <div className="border-t border-border/30 bg-card/50 px-4 pb-3 pl-[4.5rem] pt-2">
                            {item.thumbnail_url && (
                              <div className="mb-2 aspect-[4/3] w-full overflow-hidden border border-border/40">
                                <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                              </div>
                            )}
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {body || '—'}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 gap-1 text-[10px]"
                              onClick={() => onToggleSelect(item.id)}
                            >
                              <Plus className="size-3" />
                              Add to selection
                            </Button>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
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
