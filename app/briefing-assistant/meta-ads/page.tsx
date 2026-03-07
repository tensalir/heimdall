'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  LayoutGrid,
  List,
  Loader2,
  ImageIcon,
  Play,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  Bookmark,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ViewMode = 'gallery' | 'table'
type LibraryTab = 'explore' | 'following'

export interface MetaAdItem {
  id: string
  ad_id: string
  page_name: string
  creative_url: string | null
  thumbnail_url: string | null
  media_type: 'image' | 'video'
  body_text: string | null
  link_url: string | null
  started_at: string | null
  ended_at: string | null
  is_active: boolean
  platform: string
  spend_lower: number | null
  spend_upper: number | null
  impressions_lower: number | null
  impressions_upper: number | null
  score_hook: number | null
  score_overall: number | null
  tags: string[]
}

interface Filters {
  format: string
  platform: string
  status: string
  sort: string
}

const INITIAL_FILTERS: Filters = {
  format: '',
  platform: '',
  status: '',
  sort: 'newest',
}

const PAGE_SIZE = 20

function useSavedAds() {
  const [savedIds, setSavedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem('heimdall:saved-ads')
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  const toggle = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem('heimdall:saved-ads', JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds])

  return { savedIds, toggle, isSaved }
}

function ScorePill({ value, label }: { value: number | null; label: string }) {
  if (value == null) return null
  const color =
    value >= 80
      ? 'bg-emerald-500/15 text-emerald-600'
      : value >= 60
        ? 'bg-amber-500/15 text-amber-600'
        : 'bg-red-500/15 text-red-600'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', color)}>
      {value}
      <span className="font-normal opacity-70">{label}</span>
    </span>
  )
}

function AdGalleryCard({
  ad,
  isSaved,
  onToggleSave,
}: {
  ad: MetaAdItem
  isSaved: boolean
  onToggleSave: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onToggleSave() }}
        className={cn(
          'absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-md transition-all',
          isSaved
            ? 'bg-primary/90 text-primary-foreground'
            : 'bg-black/40 text-white opacity-0 group-hover:opacity-100',
        )}
        aria-label={isSaved ? 'Unsave' : 'Save'}
      >
        <Bookmark className={cn('h-3.5 w-3.5', isSaved && 'fill-current')} />
      </button>
      <Link href={`/briefing-assistant/meta-ads/${ad.id}`}>
        <div className="relative aspect-[4/5] bg-muted/30 overflow-hidden">
          {ad.thumbnail_url ? (
            <img
              src={ad.thumbnail_url}
              alt={ad.page_name}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
            </div>
          )}
          {ad.media_type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white">
                <Play className="h-4 w-4 ml-0.5" />
              </div>
            </div>
          )}
          {ad.is_active && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              Active
            </span>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-foreground truncate">{ad.page_name}</p>
          {ad.body_text && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {ad.body_text}
            </p>
          )}
          <div className="flex items-center gap-1.5 mt-auto pt-1.5">
            <ScorePill value={ad.score_hook} label="hook" />
            <ScorePill value={ad.score_overall} label="overall" />
          </div>
        </div>
      </Link>
    </div>
  )
}

function AdTableRow({ ad }: { ad: MetaAdItem }) {
  return (
    <Link
      href={`/briefing-assistant/meta-ads/${ad.id}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors"
    >
      <div className="w-12 h-12 rounded bg-muted/30 overflow-hidden flex-shrink-0">
        {ad.thumbnail_url ? (
          <img src={ad.thumbnail_url} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{ad.page_name}</p>
        <p className="text-xs text-muted-foreground truncate">{ad.body_text || '—'}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ScorePill value={ad.score_hook} label="hook" />
        <ScorePill value={ad.score_overall} label="overall" />
      </div>
      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-16 text-right">
        {ad.media_type}
      </span>
      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-20 text-right">
        {ad.started_at ? new Date(ad.started_at).toLocaleDateString() : '—'}
      </span>
    </Link>
  )
}

function FilterDropdown({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-md border border-border bg-background pl-3 pr-7 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all cursor-pointer"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
    </div>
  )
}

const DEFAULT_BRANDS = ['Loop Earplugs', 'Bose', 'Sony', 'Apple AirPods']

export default function MetaAdsLibraryPage() {
  const [allAds, setAllAds] = useState<MetaAdItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [didAutoSync, setDidAutoSync] = useState(false)
  const [tab, setTab] = useState<LibraryTab>('explore')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { savedIds, toggle: toggleSaved, isSaved } = useSavedAds()

  const fetchAds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      params.set('limit', '200')
      const res = await fetch(`/api/briefing-assistant/meta-ads?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to fetch ads')
        setAllAds([])
        return []
      }
      setAllAds(data.ads ?? [])
      return data.ads ?? []
    } catch {
      setError('Request failed')
      setAllAds([])
      return []
    } finally {
      setLoading(false)
    }
  }, [search])

  const syncBrand = useCallback(async (query: string) => {
    try {
      await fetch('/api/briefing-assistant/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_terms: query }),
      })
    } catch { /* best-effort */ }
  }, [])

  useEffect(() => {
    ;(async () => {
      const result = await fetchAds()
      if (result.length === 0 && !didAutoSync) {
        setDidAutoSync(true)
        setSyncing(true)
        setSyncResult(null)
        try {
          for (const brand of DEFAULT_BRANDS) {
            await syncBrand(brand)
          }
          setSyncResult(`Auto-synced ads for ${DEFAULT_BRANDS.join(', ')}`)
          await fetchAds()
        } catch {
          setError('Auto-sync failed')
        } finally {
          setSyncing(false)
        }
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSync = useCallback(async () => {
    const query = search.trim()
    if (!query) {
      setError('Enter a brand name or keyword in the search box, then click Sync.')
      return
    }
    setSyncing(true)
    setError(null)
    setSyncResult(null)
    try {
      const res = await fetch('/api/briefing-assistant/meta-ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search_terms: query }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Sync failed')
        return
      }
      setSyncResult(`Synced ${data.ingested ?? 0} ads from Meta (${data.fetched ?? 0} fetched).`)
      setSearch('')
      await fetchAds()
    } catch {
      setError('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }, [search, fetchAds])

  const filteredAds = useMemo(() => {
    let result = tab === 'following'
      ? allAds.filter((ad) => savedIds.has(ad.id))
      : allAds

    if (filters.format) {
      result = result.filter((ad) => ad.media_type === filters.format)
    }
    if (filters.platform) {
      result = result.filter((ad) =>
        ad.platform.toLowerCase().includes(filters.platform.toLowerCase()),
      )
    }
    if (filters.status === 'active') {
      result = result.filter((ad) => ad.is_active)
    } else if (filters.status === 'inactive') {
      result = result.filter((ad) => !ad.is_active)
    }

    if (filters.sort === 'newest') {
      result = [...result].sort((a, b) =>
        (b.started_at ?? '').localeCompare(a.started_at ?? ''),
      )
    } else if (filters.sort === 'score') {
      result = [...result].sort(
        (a, b) => (b.score_overall ?? 0) - (a.score_overall ?? 0),
      )
    }

    return result
  }, [allAds, tab, savedIds, filters])

  const visibleAds = filteredAds.slice(0, visibleCount)
  const hasMore = visibleCount < filteredAds.length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [tab, filters])

  const updateFilter = useCallback(<K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }, [])

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Meta Ads Library</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Search competitor ads from Meta, sync them, and get AI-powered scoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              {syncing ? 'Syncing...' : 'Sync'}
            </Button>
          </div>
        </div>

        {syncResult && (
          <div className="mt-2 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 rounded-md px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {syncResult}
          </div>
        )}

        <div className="flex items-center gap-3 mt-4">
          <div className="flex items-center rounded-md border border-border p-0.5 mr-1">
            {(['explore', 'following'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded px-3 py-1 text-xs font-medium transition-colors capitalize',
                  tab === t
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t}
                {t === 'following' && savedIds.size > 0 && (
                  <span className="ml-1.5 text-[10px] opacity-60">{savedIds.size}</span>
                )}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSyncResult(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSync() }}
              placeholder="Enter brand name or keyword, then Sync..."
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <FilterDropdown
              label="Format"
              value={filters.format}
              options={[
                { value: 'image', label: 'Image' },
                { value: 'video', label: 'Video' },
              ]}
              onChange={(v) => updateFilter('format', v)}
            />
            <FilterDropdown
              label="Platform"
              value={filters.platform}
              options={[
                { value: 'facebook', label: 'Facebook' },
                { value: 'instagram', label: 'Instagram' },
                { value: 'messenger', label: 'Messenger' },
                { value: 'audience_network', label: 'Audience Network' },
              ]}
              onChange={(v) => updateFilter('platform', v)}
            />
            <FilterDropdown
              label="Status"
              value={filters.status}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              onChange={(v) => updateFilter('status', v)}
            />
            <FilterDropdown
              label="Sort"
              value={filters.sort}
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'score', label: 'Highest score' },
              ]}
              onChange={(v) => updateFilter('sort', v)}
            />
          </div>

          <div className="flex items-center rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              className={cn(
                'rounded p-1.5 transition-colors',
                viewMode === 'gallery'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Gallery view"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn(
                'rounded p-1.5 transition-colors',
                viewMode === 'table'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label="Table view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-subtle">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchAds}>Retry</Button>
          </div>
        ) : allAds.length === 0 && syncing ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">
              Fetching competitor ads from Meta Ad Library...
            </p>
            <p className="text-xs text-muted-foreground/50">
              Syncing {DEFAULT_BRANDS.join(', ')}
            </p>
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {tab === 'following' ? 'No saved ads yet.' : 'No ads found.'}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
              {tab === 'following'
                ? 'Bookmark ads from the Explore tab to see them here.'
                : 'Type a competitor brand name in the search box above and click Sync to fetch ads from Meta.'}
            </p>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="p-6">
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleAds.map((ad) => (
                <AdGalleryCard
                  key={ad.id}
                  ad={ad}
                  isSaved={isSaved(ad.id)}
                  onToggleSave={() => toggleSaved(ad.id)}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((p) => p + PAGE_SIZE)}
                >
                  Load more ({filteredAds.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="divide-y divide-border">
              <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 bg-muted/20 border-b border-border">
                <span className="w-12" />
                <span className="flex-1">Ad</span>
                <span className="w-32 text-right">Scores</span>
                <span className="w-16 text-right">Type</span>
                <span className="w-20 text-right">Started</span>
              </div>
              {visibleAds.map((ad) => (
                <AdTableRow key={ad.id} ad={ad} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center py-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVisibleCount((p) => p + PAGE_SIZE)}
                >
                  Load more ({filteredAds.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
