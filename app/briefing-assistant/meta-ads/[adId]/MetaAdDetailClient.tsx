'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  Play,
  ImageIcon,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Sparkles,
  Lightbulb,
  UserPlus,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetailShell, DetailSkeleton, RailSection } from '@/components/briefing-assistant/DetailShell'
import type { MetaAdItem } from '../page'

// ── Types ─────────────────────────────────────────────────────────

interface AdDetail extends MetaAdItem {
  page_id: string | null
  score_attention?: number | null
  score_clarity?: number | null
  score_cta?: number | null
  analysis_summary?: string | null
}

// ── Follow hook ───────────────────────────────────────────────────

function useFollowBrand(pageId: string | null, pageName: string) {
  const [following, setFollowing] = useState(() => {
    if (typeof window === 'undefined' || !pageId) return false
    try {
      const raw = localStorage.getItem('heimdall:followed-brands')
      return raw ? Object.keys(JSON.parse(raw)).includes(pageId) : false
    } catch {
      return false
    }
  })

  const toggle = useCallback(() => {
    if (!pageId) return
    setFollowing((prev) => {
      const next = !prev
      try {
        const raw = localStorage.getItem('heimdall:followed-brands')
        const map: Record<string, string> = raw ? JSON.parse(raw) : {}
        if (next) map[pageId] = pageName
        else delete map[pageId]
        localStorage.setItem('heimdall:followed-brands', JSON.stringify(map))
      } catch { /* ignore */ }
      return next
    })
  }, [pageId, pageName])

  return { following, toggle }
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function computeRunningDays(start: string | null, end: string | null): string {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const days = Math.max(1, Math.round((e - s) / 86_400_000))
  return `${days} day${days !== 1 ? 's' : ''}`
}

// ── Creative Media ───────────────────────────────────────────────

function CreativeMedia({
  ad,
  onDownload,
  downloading,
  onSelfHeal,
}: {
  ad: AdDetail
  onDownload: () => void
  downloading: boolean
  onSelfHeal?: () => void
}) {
  const mediaSrc = ad.creative_url || ad.thumbnail_url || ''
  const previewFallback = `/api/briefing-assistant/meta-ads/${ad.id}/preview`
  const [activeSrc, setActiveSrc] = useState(mediaSrc || previewFallback)
  const [mediaState, setMediaState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [lastAdId, setLastAdId] = useState(ad.id)
  const [usedFallback, setUsedFallback] = useState(false)

  if (ad.id !== lastAdId) {
    setLastAdId(ad.id)
    const newSrc = ad.creative_url || ad.thumbnail_url || previewFallback
    setActiveSrc(newSrc)
    setMediaState('loading')
    setUsedFallback(false)
  }

  const isVideo = ad.media_type === 'video' && activeSrc && !activeSrc.endsWith('/preview')

  const handleFallbackLoad = useCallback(() => {
    setMediaState('loaded')
    if (usedFallback && onSelfHeal) {
      setTimeout(onSelfHeal, 3000)
    }
  }, [usedFallback, onSelfHeal])

  const switchToFallback = useCallback(() => {
    setActiveSrc(previewFallback)
    setMediaState('loading')
    setUsedFallback(true)
  }, [previewFallback])

  return (
    <div className="relative rounded-lg border border-border bg-muted/10 overflow-hidden">
      <div className="relative aspect-[4/5] max-h-[calc(100vh-200px)]">
        {mediaState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
          </div>
        )}
        {mediaState === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
            <ImageIcon className="h-10 w-10 text-muted-foreground/15" />
            <p className="text-xs text-muted-foreground/50 text-center">Preview not available</p>
          </div>
        ) : isVideo ? (
          <video
            src={activeSrc}
            controls
            playsInline
            className={cn(
              'w-full h-full object-contain transition-opacity duration-300',
              mediaState === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
            onLoadedData={handleFallbackLoad}
            onError={() => {
              if (activeSrc !== previewFallback) {
                switchToFallback()
              } else {
                setMediaState('error')
              }
            }}
          />
        ) : (
          <img
            src={activeSrc}
            alt={ad.page_name}
            className={cn(
              'w-full h-full object-contain transition-opacity duration-300',
              mediaState === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={handleFallbackLoad}
            onError={() => {
              if (activeSrc !== previewFallback) {
                switchToFallback()
              } else {
                setMediaState('error')
              }
            }}
          />
        )}
        {ad.media_type === 'video' && !isVideo && mediaState === 'loaded' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/50 text-white">
              <Play className="h-6 w-6 ml-0.5" />
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 text-xs font-medium hover:bg-black/70 transition-colors disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {downloading ? 'Saving...' : 'Download'}
      </button>
    </div>
  )
}

// ── Ad Copy with show more ────────────────────────────────────────

function AdCopyBlock({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  const isLong = text.length > 280

  return (
    <div>
      <p className={cn(
        'text-sm text-foreground leading-relaxed whitespace-pre-wrap',
        !expanded && isLong && 'line-clamp-[8]',
      )}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Show more</>
          )}
        </button>
      )}
    </div>
  )
}

// ── Main Client ───────────────────────────────────────────────────

export function MetaAdDetailClient({ adId }: { adId: string }) {
  const router = useRouter()
  const [ad, setAd] = useState<AdDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mirroring, setMirroring] = useState(false)
  const { following, toggle: toggleFollow } = useFollowBrand(ad?.page_id ?? null, ad?.page_name ?? '')

  const handleMirrorDownload = useCallback(async () => {
    if (!ad) return
    setMirroring(true)
    try {
      const res = await fetch('/api/briefing-assistant/meta-ads?action=mirror-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: ad.id, type: ad.media_type }),
      })
      if (res.ok) {
        await fetchAd()
      }
    } catch { /* ignore */ } finally {
      setMirroring(false)
    }
  }, [ad]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAd = useCallback(async () => {
    if (!adId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/briefing-assistant/meta-ads/${adId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Ad not found')
        return
      }
      setAd(data.ad ?? null)
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [adId])

  useEffect(() => {
    fetchAd()
  }, [fetchAd])

  if (loading) return <DetailSkeleton />

  if (error || !ad) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error ?? 'Ad not found'}</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/briefing-assistant/meta-ads')}>
          Back to library
        </Button>
      </div>
    )
  }

  return (
    <DetailShell
      backHref="/briefing-assistant/meta-ads"
      title={ad.page_name}
      subtitle={
        <>
          <span>{ad.source_provider ?? 'Sponsored'}</span>
          {ad.is_active ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">Active</span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>
          )}
        </>
      }
      actions={
        ad.page_id ? (
          <Button
            variant="outline"
            size="sm"
            className={cn('gap-1.5', following && 'bg-primary/10 border-primary/30 text-primary')}
            onClick={toggleFollow}
          >
            {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {following ? 'Following' : 'Follow'}
          </Button>
        ) : undefined
      }
      itemId={ad.id}
      sourceType="meta-ad"
      left={
        <>
          {/* Brand row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 text-muted-foreground text-xs font-bold flex-shrink-0">
              {ad.page_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{ad.page_name}</p>
              <p className="text-[10px] text-muted-foreground">{ad.source_provider ?? 'Sponsored'}</p>
            </div>
          </div>

          {/* Status + dates */}
          <div className="flex items-center gap-2 flex-wrap">
            {ad.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">Active</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">Inactive</span>
            )}
            {ad.started_at && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDate(ad.started_at)}
                {ad.ended_at && ` – ${formatDate(ad.ended_at)}`}
              </span>
            )}
          </div>

          <AdCopyBlock text={ad.body_text} />

          {/* Tags + platform row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <span className="uppercase tracking-wider">{ad.platform}</span>
              <span>/</span>
              <span>{ad.media_type}</span>
            </div>
            {ad.content_style_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ad.content_style_tags.map((tag) => (
                  <span key={tag} className="rounded bg-primary/8 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium">
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {ad.link_url && (
            <a
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Open archived ad on Meta
            </a>
          )}

          {ad.link_url && (
            <a
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors truncate"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{ad.link_url}</span>
            </a>
          )}
        </>
      }
      center={
        <CreativeMedia ad={ad} onDownload={handleMirrorDownload} downloading={mirroring} onSelfHeal={fetchAd} />
      }
      right={
        <>
          {/* Details */}
          <RailSection icon={<Info className="h-3.5 w-3.5 text-primary" />} title="Details">
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ad ID</dt>
                <dd className="text-foreground font-mono text-[10px] truncate max-w-[140px]">{ad.ad_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Start date</dt>
                <dd className="text-foreground">{formatDate(ad.started_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">End date</dt>
                <dd className="text-foreground">{formatDate(ad.ended_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Running time</dt>
                <dd className="text-foreground">{computeRunningDays(ad.started_at, ad.ended_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Platforms</dt>
                <dd className="text-foreground">{ad.platform}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Display format</dt>
                <dd className="text-foreground capitalize">{ad.media_type}</dd>
              </div>
              {ad.spend_lower != null && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Spend range</dt>
                  <dd className="text-foreground">
                    US${ad.spend_lower.toLocaleString()}{ad.spend_upper ? ` – US$${ad.spend_upper.toLocaleString()}` : ''}
                  </dd>
                </div>
              )}
              {ad.tags.length > 0 && (
                <div>
                  <dt className="text-muted-foreground mb-1">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {ad.tags.map((tag) => (
                      <span key={tag} className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </RailSection>

          {/* AI Analysis */}
          <RailSection icon={<Sparkles className="h-3.5 w-3.5 text-primary" />} title="AI Analysis">
            {ad.analysis_summary ? (
              <p className="text-sm text-foreground/80 leading-relaxed">
                {ad.analysis_summary}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground/50">No analysis available yet.</p>
            )}
          </RailSection>

          {/* Creative Angles — Meta ads don't have these natively, placeholder for future */}

          {/* Language Hooks — Meta ads don't have these natively, placeholder for future */}
        </>
      }
    />
  )
}
