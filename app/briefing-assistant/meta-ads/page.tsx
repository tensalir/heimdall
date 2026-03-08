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
  Eye,
  Star,
  Bookmark,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AtlasBrowserModal } from '@/components/briefing-assistant/AtlasBrowserModal'

type ViewMode = 'gallery' | 'table'
type BrowseSurface = 'discovery' | 'top_picks' | 'following' | 'saved'

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
  quality_status: string
  quality_score: number | null
  quality_summary: string | null
  content_style_tags: string[]
  hook_type: string | null
  proof_type: string | null
  creator_style: string | null
  target_market: string | null
  days_running: number | null
  language: string | null
  is_top_pick: boolean
  source_provider: string | null
}

interface Filters {
  format: string
  platform: string
  status: string
  sort: string
  content_style: string
  target_market: string
  language: string
  quality: string
  min_days_running: string
}

const INITIAL_FILTERS: Filters = {
  format: '',
  platform: '',
  status: '',
  sort: 'longest_running',
  content_style: '',
  target_market: '',
  language: '',
  quality: '',
  min_days_running: '',
}

const PAGE_SIZE = 20

const CONTENT_STYLE_OPTIONS = [
  { value: 'testimonial_review', label: 'Testimonial / Review' },
  { value: 'before_after', label: 'Before & After' },
  { value: 'facts_stats', label: 'Facts & Stats' },
  { value: 'features_benefits', label: 'Features & Benefits' },
  { value: 'promotion_discount', label: 'Promotion / Discount' },
  { value: 'reasons_why', label: 'Reasons Why' },
  { value: 'us_vs_them', label: 'Us vs Them' },
  { value: 'ugc', label: 'UGC' },
  { value: 'comparison', label: 'Comparison' },
  { value: 'demo', label: 'Demo' },
  { value: 'storytelling', label: 'Storytelling' },
]

const DAYS_RUNNING_OPTIONS = [
  { value: '7', label: '7+ days' },
  { value: '30', label: '30+ days' },
  { value: '90', label: '90+ days' },
  { value: '180', label: '180+ days' },
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

function QualityBadge({ status }: { status: string }) {
  if (status === 'manual_pick') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/15 text-violet-600 px-1.5 py-0.5 text-[10px] font-semibold">
        <Star className="h-2.5 w-2.5" /> Pick
      </span>
    )
  }
  if (status === 'approved') return null
  if (status === 'rejected') {
    return (
      <span className="rounded-md bg-red-500/10 text-red-500/70 px-1.5 py-0.5 text-[10px] font-semibold">
        Rejected
      </span>
    )
  }
  return (
    <span className="rounded-md bg-muted/50 text-muted-foreground/50 px-1.5 py-0.5 text-[10px] font-semibold">
      Pending
    </span>
  )
}

function StyleTag({ tag }: { tag: string }) {
  return (
    <span className="rounded bg-primary/8 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium">
      {tag.replace(/_/g, ' ')}
    </span>
  )
}

function DaysRunningBadge({ days }: { days: number | null }) {
  if (days == null || days < 7) return null
  const color = days >= 90 ? 'text-emerald-600' : days >= 30 ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <span className={cn('text-[10px] font-semibold', color)}>
      {days}D
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
  const shouldAttemptLoad = !!src && status !== 'pending'
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>(
    shouldAttemptLoad ? 'loading' : (status === 'pending' ? 'loading' : 'error'),
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
  onAtlasView,
}: {
  ad: MetaAdItem
  isFollowingBrand: boolean
  onToggleFollow: () => void
  onAtlasView: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200">
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAtlasView() }}
          className="flex items-center justify-center w-7 h-7 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all"
          aria-label="Atlas quick view"
        >
          <Eye className="h-3.5 w-3.5" />
        </button>
        {ad.page_id && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFollow() }}
            className={cn(
              'flex items-center justify-center w-7 h-7 rounded-md transition-all',
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
      </div>
      <Link href={`/briefing-assistant/meta-ads/${ad.id}`}>
        <AdCardImage
          src={ad.thumbnail_url}
          alt={ad.page_name}
          isVideo={ad.media_type === 'video'}
          status={ad.thumbnail_status ?? 'pending'}
        />
        <div className="absolute top-2 left-2 flex items-center gap-1">
          {ad.is_active && (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              Active
            </span>
          )}
          {ad.is_top_pick && (
            <span className="inline-flex items-center gap-0.5 rounded-md bg-violet-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
              <Star className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
        <div className="p-3 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground truncate">{ad.page_name}</p>
            <DaysRunningBadge days={ad.days_running} />
          </div>
          {ad.body_text && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {ad.body_text}
            </p>
          )}
          {ad.content_style_tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {ad.content_style_tags.slice(0, 2).map((tag) => (
                <StyleTag key={tag} tag={tag} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-auto pt-1.5">
            <QualityBadge status={ad.quality_status} />
            <ScorePill value={ad.quality_score} label="quality" />
            <ScorePill value={ad.score_hook} label="hook" />
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
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium text-foreground truncate">{ad.page_name}</p>
          {ad.is_top_pick && <Star className="h-3 w-3 text-violet-500 flex-shrink-0" />}
        </div>
        <p className="text-xs text-muted-foreground truncate">{ad.body_text || '\u2014'}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {ad.content_style_tags.slice(0, 1).map((tag) => (
          <StyleTag key={tag} tag={tag} />
        ))}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <ScorePill value={ad.quality_score} label="Q" />
        <ScorePill value={ad.score_hook} label="hook" />
      </div>
      <DaysRunningBadge days={ad.days_running} />
      <span className="text-[10px] text-muted-foreground/50 flex-shrink-0 w-16 text-right">
        {ad.media_type}
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

const SURFACE_CONFIG: Record<BrowseSurface, { label: string; icon: typeof Sparkles }> = {
  discovery: { label: 'Discovery', icon: Sparkles },
  top_picks: { label: 'Top Picks', icon: TrendingUp },
  following: { label: 'Following', icon: UserCheck },
  saved: { label: 'Saved', icon: Bookmark },
}

const clientAdCache = new Map<string, MetaAdItem[]>()

export default function MetaAdsLibraryPage() {
  const [allAds, setAllAds] = useState<MetaAdItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [tokenWarning, setTokenWarning] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [atlasAd, setAtlasAd] = useState<MetaAdItem | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [surface, setSurface] = useState<BrowseSurface>('discovery')
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const { followedBrands, toggleBrand, isFollowing } = useFollowedBrands()

  const fetchAds = useCallback(async (overrideSurface?: BrowseSurface, overrideSearch?: string) => {
    setError(null)
    const params = new URLSearchParams()
    const currentSurface = overrideSurface ?? surface
    params.set('surface', currentSurface)
    const defaultSort = currentSurface === 'top_picks' ? 'quality' : 'longest_running'
    params.set('sort', filters.sort || defaultSort)
    params.set('limit', '200')

    if (currentSurface === 'discovery') {
      params.set('quality', filters.quality || 'not_rejected')
    } else if (currentSurface === 'top_picks') {
      params.set('quality', 'all')
    }

    const searchQ = overrideSearch ?? search
    if (searchQ.trim()) params.set('q', searchQ.trim())

    if (filters.content_style) params.set('content_style', filters.content_style)
    if (filters.target_market) params.set('target_market', filters.target_market)
    if (filters.language) params.set('language', filters.language)
    if (filters.format) params.set('format', filters.format)
    if (filters.status === 'active') params.set('active', 'true')
    if (filters.min_days_running) params.set('min_days_running', filters.min_days_running)

    if (currentSurface === 'following') {
      const pageIds = Array.from(followedBrands.keys())
      if (pageIds.length > 0) params.set('followed_page_ids', pageIds.join(','))
    }

    const cacheKey = params.toString()
    const stale = clientAdCache.get(cacheKey)
    if (stale) {
      setAllAds(stale)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
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
          if (!stale) setAllAds([])
        } else {
          setError(data.error ?? 'Failed to fetch ads')
          if (!stale) setAllAds([])
        }
        return stale ?? []
      }
      const fresh = data.ads ?? []
      clientAdCache.set(cacheKey, fresh)
      setAllAds(fresh)
      return fresh
    } catch {
      if (!stale) {
        setError('Request failed')
        setAllAds([])
      }
      return stale ?? []
    } finally {
      setLoading(false)
    }
  }, [surface, search, filters, followedBrands])

  useEffect(() => {
    fetchAds()
  }, [surface]) // eslint-disable-line react-hooks/exhaustive-deps

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
      await fetchAds(surface, '')
    } catch {
      setError('Sync request failed')
    } finally {
      setSyncing(false)
    }
  }, [search, fetchAds, surface])

  const filteredAds = useMemo(() => {
    let result = [...allAds]

    if (filters.platform) {
      result = result.filter((ad) =>
        ad.platform.toLowerCase().includes(filters.platform.toLowerCase()),
      )
    }
    if (filters.status === 'inactive') {
      result = result.filter((ad) => !ad.is_active)
    }

    return result
  }, [allAds, filters])

  const visibleAds = filteredAds.slice(0, visibleCount)
  const hasMore = visibleCount < filteredAds.length

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [surface, filters])

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
              Curated ad inspiration with quality filtering and pattern detection
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
          {(['discovery', 'top_picks', 'following', 'saved'] as const).map((s) => {
            const config = SURFACE_CONFIG[s]
            const Icon = config.icon
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSurface(s)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                  surface === s
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {config.label}
                {s === 'following' && followedBrands.size > 0 && (
                  <span className="ml-1 text-[10px] opacity-60">{followedBrands.size}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className="relative max-w-md">
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
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-subtle">
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-card/30">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterDropdown
              label="Content Style"
              value={filters.content_style}
              options={CONTENT_STYLE_OPTIONS}
              onChange={(v) => updateFilter('content_style', v)}
            />
            <FilterDropdown
              label="Market"
              value={filters.target_market}
              options={[
                { value: 'b2b', label: 'B2B' },
                { value: 'b2c', label: 'B2C' },
              ]}
              onChange={(v) => updateFilter('target_market', v)}
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
              label="Min Run"
              value={filters.min_days_running}
              options={DAYS_RUNNING_OPTIONS}
              onChange={(v) => updateFilter('min_days_running', v)}
            />
            <FilterDropdown
              label="Platform"
              value={filters.platform}
              options={[
                { value: 'facebook', label: 'Facebook' },
                { value: 'instagram', label: 'Instagram' },
                { value: 'messenger', label: 'Messenger' },
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
            {surface === 'discovery' && (
              <FilterDropdown
                label="Quality"
                value={filters.quality}
                options={[
                  { value: 'not_rejected', label: 'Curated (hide rejected)' },
                  { value: 'approved', label: 'Approved only' },
                  { value: 'all', label: 'All' },
                  { value: 'rejected', label: 'Rejected' },
                ]}
                onChange={(v) => updateFilter('quality', v)}
              />
            )}
            <FilterDropdown
              label="Sort"
              value={filters.sort}
              options={[
                { value: 'longest_running', label: 'Longest running' },
                { value: 'newest', label: 'Newest first' },
                { value: 'quality', label: 'Highest quality' },
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
              {surface === 'following'
                ? 'No followed brands yet.'
                : surface === 'saved'
                  ? 'No saved ads yet.'
                  : surface === 'top_picks'
                    ? 'Top picks appear automatically as ads are analyzed. Check back shortly.'
                    : 'No ads found. The library is loading in the background.'}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
              {surface === 'following'
                ? 'Follow brands from the Discovery tab to see their ads here.'
                : surface === 'discovery'
                  ? 'Try syncing a brand name above, or wait for the default watchlist to populate.'
                  : 'Check back soon or adjust your filters.'}
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
                  onAtlasView={() => setAtlasAd(ad)}
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
                <span className="w-24">Style</span>
                <span className="w-32 text-right">Scores</span>
                <span className="w-12 text-right">Days</span>
                <span className="w-16 text-right">Type</span>
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

      {atlasAd && (
        <AtlasBrowserModal
          adId={atlasAd.id}
          adName={atlasAd.page_name}
          linkUrl={atlasAd.link_url}
          onClose={() => setAtlasAd(null)}
        />
      )}
    </div>
  )
}
