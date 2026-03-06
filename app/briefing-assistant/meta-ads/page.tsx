'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Search,
  LayoutGrid,
  List,
  Loader2,
  Filter,
  ImageIcon,
  Play,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ViewMode = 'gallery' | 'table'

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

function AdGalleryCard({ ad }: { ad: MetaAdItem }) {
  return (
    <Link
      href={`/briefing-assistant/meta-ads/${ad.id}`}
      className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200"
    >
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
        {(ad.spend_lower != null || ad.impressions_lower != null) && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
            {ad.spend_lower != null && (
              <span>US${ad.spend_lower.toLocaleString()}{ad.spend_upper ? `–${ad.spend_upper.toLocaleString()}` : ''}</span>
            )}
            {ad.impressions_lower != null && (
              <span>{(ad.impressions_lower / 1000).toFixed(0)}K imp</span>
            )}
          </div>
        )}
      </div>
    </Link>
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

const DEFAULT_BRANDS = ['Loop Earplugs', 'Bose', 'Sony', 'Apple AirPods']

export default function MetaAdsLibraryPage() {
  const [ads, setAds] = useState<MetaAdItem[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('gallery')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [didAutoSync, setDidAutoSync] = useState(false)

  const fetchAds = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/briefing-assistant/meta-ads?${params}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to fetch ads')
        setAds([])
        return
      }
      setAds(data.ads ?? [])
      return data.ads ?? []
    } catch {
      setError('Request failed')
      setAds([])
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
      setSyncResult(`Synced ${data.ingested ?? 0} ads from Meta (${data.fetched ?? 0} fetched). Showing latest ingested ads.`)
      setSearch('')
      setLoading(true)
      const refreshRes = await fetch('/api/briefing-assistant/meta-ads')
      const refreshData = await refreshRes.json()
      if (!refreshRes.ok) {
        setError(refreshData.error ?? 'Failed to refresh ads after sync')
        setAds([])
        return
      }
      setAds(refreshData.ads ?? [])
    } catch {
      setError('Sync request failed')
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }, [search, fetchAds])

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

          <Button variant="outline" size="sm" className="gap-1.5">
            <Filter className="h-3.5 w-3.5" />
            Filters
          </Button>

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

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchAds}>Retry</Button>
          </div>
        ) : ads.length === 0 && syncing ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
            <p className="text-sm text-muted-foreground">
              Fetching competitor ads from Meta Ad Library...
            </p>
            <p className="text-xs text-muted-foreground/50">
              Syncing {DEFAULT_BRANDS.join(', ')}
            </p>
          </div>
        ) : ads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <ImageIcon className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">No ads found.</p>
            <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
              Type a competitor brand name (e.g. &quot;Bose&quot;, &quot;Sony&quot;) in the search box above and click Sync to fetch ads from Meta.
            </p>
          </div>
        ) : viewMode === 'gallery' ? (
          <div className="p-6 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {ads.map((ad) => (
              <AdGalleryCard key={ad.id} ad={ad} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="flex items-center gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 bg-muted/20 border-b border-border">
              <span className="w-12" />
              <span className="flex-1">Ad</span>
              <span className="w-32 text-right">Scores</span>
              <span className="w-16 text-right">Type</span>
              <span className="w-20 text-right">Started</span>
            </div>
            {ads.map((ad) => (
              <AdTableRow key={ad.id} ad={ad} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
