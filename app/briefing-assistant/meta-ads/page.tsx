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
  UserPlus,
  UserCheck,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ViewMode = 'gallery' | 'table'
type LibraryTab = 'use-cases' | 'trending' | 'following'

export interface MetaAdItem {
  id: string
  ad_id: string
  page_id: string | null
  page_name: string
  creative_url: string | null
  thumbnail_url: string | null
  thumbnail_status: 'ready' | 'pending' | 'invalid'
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
  region: string
  use_case: string
}

const INITIAL_FILTERS: Filters = {
  format: '',
  platform: '',
  status: '',
  sort: 'longest_running',
  region: 'US',
  use_case: '',
}

const PAGE_SIZE = 20

const USE_CASES = [
  { value: '', label: 'All Use Cases' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'focus', label: 'Focus' },
  { value: 'lifestyle', label: 'Lifestyle' },
]

const REGIONS = [
  { value: 'US', label: 'United States' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'DE', label: 'Germany' },
  { value: 'BE', label: 'Belgium' },
  { value: 'AU', label: 'Australia' },
  { value: 'FR', label: 'France' },
]

// ---------------------------------------------------------------------------
// Brand following (localStorage for now, Supabase-ready)
// ---------------------------------------------------------------------------

function useFollowedBrands() {
  const [followedBrands, setFollowedBrands] = useState<Map<string, string>>(() => {
    if (typeof window === 'undefined') return new Map()
    try {
      const raw = localStorage.getItem('heimdall:followed-brands')
      return raw ? new Map(Object.entries(JSON.parse(raw))) : new Map()
    } catch {
      return new Map()
    }
  })

  const toggleBrand = useCallback((pageId: string, pageName: string) => {
    setFollowedBrands((prev) => {
      const next = new Map(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.set(pageId, pageName)
      try {
        localStorage.setItem('heimdall:followed-brands', JSON.stringify(Object.fromEntries(next)))
      } catch { /* ignore */ }
      return next
    })
  }, [])

  const isFollowing = useCallback((pageId: string) => followedBrands.has(pageId), [followedBrands])

  return { followedBrands, toggleBrand, isFollowing }
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

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

function AdCardImage({
  src,
  alt,
  isVideo,
  status,
}: {
  src: string | null
  alt: string
  isVideo: boolean
  status: 'ready' | 'pending' | 'invalid'
}) {
  const shouldAttemptLoad = status === 'ready' && !!src
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    shouldAttemptLoad ? 'loading' : 'error',
  )

  return (
    <div className="relative aspect-[4/5] bg-muted/30 overflow-hidden">
      {shouldAttemptLoad && imgState !== 'error' ? (
        <>
          {imgState === 'loading' && (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/60 to-muted/40" />
          )}
          <img
            src={src!}
            alt={alt}
            className={cn(
              'w-full h-full object-cover transition-opacity duration-300',
              imgState === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
            loading="lazy"
            onLoad={() => setImgState('loaded')}
            onError={() => setImgState('error')}
          />
        </>
      ) : status === 'pending' ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/25" />
          <span className="text-[10px] text-muted-foreground/30">Extracting media...</span>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5">
          <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
        </div>
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/60 text-white">
            <Play className="h-4 w-4 ml-0.5" />
          </div>
        </div>
      )}
    </div>
  )
}

function AdGalleryCard({
  ad,
  isFollowingBrand,
  onToggleFollow,
}: {
  ad: MetaAdItem
  isFollowingBrand: boolean
  onToggleFollow: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
      {ad.page_id && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onToggleFollow() }}
          className={cn(
            'absolute top-2 right-2 z-10 flex items-center justify-center w-7 h-7 rounded-md transition-all',
            isFollowingBrand
              ? 'bg-primary/90 text-primary-foreground'
              : 'bg-black/40 text-white opacity-0 group-hover:opacity-100',
          )}
          aria-label={isFollowingBrand ? 'Unfollow brand' : 'Follow brand'}
        >
          {isFollowingBrand
            ? <UserCheck className="h-3.5 w-3.5" />
            : <UserPlus className="h-3.5 w-3.5" />}
        </button>
      )}
      <Link href={`/briefing-assistant/meta-ads/${ad.id}`}>
        <AdCardImage
          src={ad.thumbnail_url}
          alt={ad.page_name}
          isVideo={ad.media_type === 'video'}
          status={ad.thumbnail_status ?? 'pending'}
        />
        {ad.is_active && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Active
          </span>
        )}
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

function TableRowThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <ImageIcon className="h-4 w-4 text-muted-foreground/20" />
      </div>
    )
  }
  return <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" onError={() => setFailed(true)} />
}

function AdTableRow({ ad }: { ad: MetaAdItem }) {
  return (
    <Link
      href={`/briefing-assistant/meta-ads/${ad.id}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-border hover:bg-muted/30 transition-colors"
    >
      <div className="w-12 h-12 rounded bg-muted/30 overflow-hidden flex-shrink-0 relative">
        <TableRowThumb src={ad.thumbnail_url} />
        {ad.media_type === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-3 w-3 text-white drop-shadow" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{ad.page_name}</p>
        <p className="text-xs text-muted-foreground truncate">{ad.body_text || '\u2014'}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ScorePill value={ad.score_hook} label="hook" />
        <ScorePill value={ad.score_overall} label="overall" />
      </div>
      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-16 text-right">
        {ad.media_type}
      </span>
      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-20 text-right">
        {ad.started_at ? new Date(ad.started_at).toLocaleDateString() : '\u2014'}
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<LibraryTab, string> = {
  'use-cases': 'Use Cases',
  'trending': 'Trending',
  'following': 'Following',
}

export default function MetaAdsLibraryPage() {
  const [allAds, setAllAds] = useState<MetaAdItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tokenWarning, setTokenWarning] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [tab, setTab] = useState<LibraryTab>('use-cases')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { followedBrands, toggleBrand, isFollowing } = useFollowedBrands()

  const fetchAds = useCallback(async (overrideTab?: LibraryTab, overrideSearch?: string) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      const currentTab = overrideTab ?? tab
      params.set('tab', currentTab)
      params.set('sort', filters.sort || 'longest_running')
      params.set('limit', '200')

      const searchQ = overrideSearch ?? search
      if (searchQ.trim()) params.set('q', searchQ.trim())

      if (currentTab === 'following') {
        const pageIds = Array.from(followedBrands.keys())
        if (pageIds.length > 0) params.set('followed_page_ids', pageIds.join(','))
      }

      const res = await fetch(`/api/briefing-assistant/meta-ads?${params}`)
      const data = await res.json()

      if (data.watchlist_status?.token_ok === false) {
        setTokenWarning('Meta API token is not configured. Some features may be limited.')
      } else {
        setTokenWarning(null)
      }

      if (!res.ok) {
        if (data.token_expired) {
          setTokenWarning(data.error)
          setAllAds([])
        } else {
          setError(data.error ?? 'Failed to fetch ads')
          setAllAds([])
        }
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
  }, [tab, search, filters.sort, followedBrands])

  useEffect(() => {
    fetchAds()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

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
      await fetchAds(tab, '')
    } catch {
      setError('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }, [search, fetchAds, tab])

  const filteredAds = useMemo(() => {
    let result = [...allAds]

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
    if (filters.use_case && tab === 'use-cases') {
      const uc = filters.use_case.toLowerCase()
      result = result.filter((ad) =>
        (ad.body_text ?? '').toLowerCase().includes(uc) ||
        (ad.page_name ?? '').toLowerCase().includes(uc) ||
        ad.tags.some((t) => t.toLowerCase().includes(uc)),
      )
    }

    return result
  }, [allAds, filters, tab])

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
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Meta Ads Library</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discover competitor ads, track trends, and follow brands
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

        {tokenWarning && (
          <div className="mb-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-500/10 rounded-md px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{tokenWarning}</span>
          </div>
        )}

        {syncResult && (
          <div className="mb-3 flex items-center gap-2 text-xs text-emerald-600 bg-emerald-500/10 rounded-md px-3 py-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {syncResult}
          </div>
        )}

        <div className="flex items-center border-b border-border -mx-6 px-6 mb-4">
          {(['use-cases', 'trending', 'following'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
              )}
            >
              {TAB_LABELS[t]}
              {t === 'following' && followedBrands.size > 0 && (
                <span className="ml-1.5 text-[10px] opacity-60">{followedBrands.size}</span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSyncResult(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSync() }}
              placeholder="Search ads or sync new brands..."
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {tab === 'use-cases' && (
              <FilterDropdown
                label="Use Case"
                value={filters.use_case}
                options={USE_CASES.filter((u) => u.value !== '')}
                onChange={(v) => updateFilter('use_case', v)}
              />
            )}
            <FilterDropdown
              label="Region"
              value={filters.region}
              options={REGIONS}
              onChange={(v) => updateFilter('region', v)}
            />
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
                { value: 'longest_running', label: 'Longest running' },
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
            <Button variant="outline" size="sm" onClick={() => fetchAds()}>Retry</Button>
          </div>
        ) : filteredAds.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {tab === 'following'
                ? 'No followed brands yet.'
                : 'No ads found. The library is loading in the background.'}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
              {tab === 'following'
                ? 'Follow brands from the Use Cases or Trending tabs to see their ads here.'
                : 'Try syncing a brand name above, or wait for the default watchlist to populate.'}
            </p>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="p-6">
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleAds.map((ad) => (
                <AdGalleryCard
                  key={ad.id}
                  ad={ad}
                  isFollowingBrand={ad.page_id ? isFollowing(ad.page_id) : false}
                  onToggleFollow={() => {
                    if (ad.page_id) toggleBrand(ad.page_id, ad.page_name)
                  }}
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
