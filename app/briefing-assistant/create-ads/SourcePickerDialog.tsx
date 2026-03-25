'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Loader2, ImageIcon, FileText, MessageCircle, TrendingUp, Workflow, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SourceItem, SourceType } from './createBriefingTypes'

type PickerTab = 'all' | 'ads' | 'trends' | 'social'

export type PickerRow = {
  id: string
  title: string
  preview: string
  type: SourceType
  typeLabel: string
  thumbnail: string | null
}

const TYPE_CONFIG: Record<SourceType, { label: string; icon: React.ElementType }> = {
  'meta-ad': { label: 'Meta Ad', icon: ImageIcon },
  trend: { label: 'Trend', icon: TrendingUp },
  'social-comment': { label: 'Social', icon: MessageCircle },
  'workflow-output': { label: 'Workflow', icon: Workflow },
  manual: { label: 'Manual', icon: FileText },
}

function normalizeSourceType(raw: string): SourceType {
  const t = raw.replace('_', '-') as SourceType
  if (t in TYPE_CONFIG) return t
  return 'manual'
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

function oneLine(text: string, max = 120) {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export interface SourcePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  onAddSources: (ids: string[]) => void
}

export function SourcePickerDialog({
  open,
  onOpenChange,
  selectedIds,
  onAddSources,
}: SourcePickerDialogProps) {
  const [tab, setTab] = useState<PickerTab>('all')
  const [searchInput, setSearchInput] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [rows, setRows] = useState<PickerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [extraIds, setExtraIds] = useState<Set<string>>(() => new Set())

  const briefingSet = useMemo(() => new Set(selectedIds), [selectedIds])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (open) {
      setExtraIds(new Set())
      setSearchInput('')
      setDebouncedQ('')
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const runTab = tab
    const q = debouncedQ

    setLoading(true)
    setFetchError(null)

    ;(async () => {
      try {
        let mapped: PickerRow[] = []

        if (runTab === 'all') {
          const res = await fetch('/api/briefing-assistant/source-items?limit=50')
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to load sources')
          const items = (data.items ?? []) as SourceItem[]
          mapped = items.map((it) => {
            const type = normalizeSourceType(it.type)
            return {
              id: it.id,
              title: it.title || 'Untitled',
              preview: oneLine((it.body_text ?? it.preview ?? '') as string),
              type,
              typeLabel: TYPE_CONFIG[type].label,
              thumbnail: it.thumbnail_url ?? null,
            }
          })
          if (q) {
            const ql = q.toLowerCase()
            mapped = mapped.filter(
              (r) => r.title.toLowerCase().includes(ql) || r.preview.toLowerCase().includes(ql),
            )
          }
        } else if (runTab === 'ads') {
          const u = new URL('/api/briefing-assistant/meta-ads', window.location.origin)
          u.searchParams.set('limit', '20')
          if (q) u.searchParams.set('q', q)
          const res = await fetch(u.toString())
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to load ads')
          const ads = (data.ads ?? []) as Array<{
            id: string
            page_name?: string | null
            body_text?: string | null
            thumbnail_url?: string | null
          }>
          mapped = ads.map((a) => ({
            id: a.id,
            title: (a.page_name || 'Meta ad').trim() || 'Meta ad',
            preview: oneLine(String(a.body_text ?? '')),
            type: 'meta-ad' as const,
            typeLabel: TYPE_CONFIG['meta-ad'].label,
            thumbnail: a.thumbnail_url ?? null,
          }))
        } else if (runTab === 'trends') {
          const u = new URL('/api/briefing-assistant/trends', window.location.origin)
          if (q) u.searchParams.set('q', q)
          const res = await fetch(u.toString())
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to load trends')
          const trends = (data.trends ?? []) as Array<{
            id: string
            title: string
            description?: string
            thumbnail?: string | null
          }>
          mapped = trends.slice(0, 20).map((tr) => ({
            id: tr.id,
            title: tr.title || 'Trend',
            preview: oneLine(String(tr.description ?? '')),
            type: 'trend' as const,
            typeLabel: TYPE_CONFIG.trend.label,
            thumbnail: tr.thumbnail ?? null,
          }))
        } else {
          const u = new URL('/api/briefing-assistant/social-comments', window.location.origin)
          if (q) u.searchParams.set('q', q)
          const res = await fetch(u.toString())
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed to load social')
          const comments = (data.comments ?? []) as Array<{
            id: string
            title: string
            text?: string
            thumbnail?: string | null
          }>
          mapped = comments.slice(0, 20).map((c) => ({
            id: c.id,
            title: c.title || 'Social comment',
            preview: oneLine(String(c.text ?? '')),
            type: 'social-comment' as const,
            typeLabel: TYPE_CONFIG['social-comment'].label,
            thumbnail: c.thumbnail ?? null,
          }))
        }

        if (!cancelled) setRows(mapped)
      } catch (e) {
        if (!cancelled) {
          setFetchError(e instanceof Error ? e.message : 'Something went wrong')
          setRows([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, tab, debouncedQ])

  const isRowChecked = useCallback(
    (id: string) => briefingSet.has(id) || extraIds.has(id),
    [briefingSet, extraIds],
  )

  const toggleRow = useCallback(
    (id: string) => {
      if (briefingSet.has(id)) return
      setExtraIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [briefingSet],
  )

  const addCount = extraIds.size

  const handleAdd = () => {
    if (addCount === 0) return
    onAddSources([...extraIds])
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'flex max-h-[80vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl',
        )}
      >
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>Browse sources</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as PickerTab)}
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <div className="border-b border-border px-6 pt-2">
            <TabsList className="mb-2 h-9 w-full justify-start gap-1 bg-transparent p-0">
              <TabsTrigger
                value="all"
                className="rounded-md px-3 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                value="ads"
                className="rounded-md px-3 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                Meta Ads
              </TabsTrigger>
              <TabsTrigger
                value="trends"
                className="rounded-md px-3 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                Trends
              </TabsTrigger>
              <TabsTrigger
                value="social"
                className="rounded-md px-3 text-xs data-[state=active]:bg-muted data-[state=active]:shadow-none"
              >
                Social Listening
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="px-6 py-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search…"
                className={cn(
                  'flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-8 pr-3 text-sm shadow-sm transition-colors',
                  'placeholder:text-muted-foreground',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                )}
                aria-label="Search sources"
              />
            </div>
          </div>

          {(['all', 'ads', 'trends', 'social'] as const).map((t) => (
            <TabsContent
              key={t}
              value={t}
              className="m-0 min-h-0 flex-1 overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="max-h-[min(52vh,420px)] overflow-y-auto scrollbar-subtle">
                {loading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  </div>
                ) : fetchError ? (
                  <p className="px-2 py-8 text-center text-sm text-destructive">{fetchError}</p>
                ) : rows.length === 0 ? (
                  <p className="px-2 py-8 text-center text-sm text-muted-foreground">No sources found.</p>
                ) : (
                  <ul className="divide-y divide-border/50">
                    {rows.map((row) => {
                      const cfg = TYPE_CONFIG[row.type]
                      const Icon = cfg.icon
                      const checked = isRowChecked(row.id)
                      const inBriefing = briefingSet.has(row.id)
                      return (
                        <li key={row.id}>
                          <button
                            type="button"
                            onClick={() => toggleRow(row.id)}
                            disabled={inBriefing}
                            className={cn(
                              'flex w-full items-start gap-2 px-4 py-2.5 text-left transition-colors hover:bg-muted/40',
                              inBriefing && 'cursor-default opacity-90',
                            )}
                          >
                            <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center">
                              <DiamondMarker selected={checked} />
                            </span>
                            {row.thumbnail ? (
                              <div className="size-10 shrink-0 overflow-hidden border border-border/40 bg-muted/20">
                                <img src={row.thumbnail} alt="" className="size-full object-cover" />
                              </div>
                            ) : (
                              <div className="flex size-10 shrink-0 items-center justify-center border border-border/40 bg-muted/20">
                                <Icon className="size-4 text-muted-foreground/40" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium text-foreground">{row.title}</p>
                              <span className="mt-0.5 inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {row.typeLabel}
                              </span>
                              {row.preview ? (
                                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{row.preview}</p>
                              ) : null}
                              {inBriefing ? (
                                <p className="mt-0.5 text-[10px] text-muted-foreground/80">Already in briefing</p>
                              ) : null}
                            </div>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <DialogFooter className="border-t border-border px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd} disabled={addCount === 0}>
            {addCount === 0 ? 'Add sources' : `Add ${addCount} source${addCount === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
