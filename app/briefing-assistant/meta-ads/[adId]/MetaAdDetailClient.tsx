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
  UserPlus,
  UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetailShell, DetailSkeleton } from '@/components/briefing-assistant/DetailShell'
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

function extractDomain(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
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
    <div className="relative">
      <div className="relative">
        {mediaState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
          </div>
        )}
        {mediaState === 'error' ? (
          <div className="w-full aspect-[4/5] flex flex-col items-center justify-center gap-3 p-6 bg-muted/5">
            <ImageIcon className="h-10 w-10 text-muted-foreground/15" />
            <p className="text-xs text-muted-foreground/50 text-center">Preview not available</p>
          </div>
        ) : isVideo ? (
          <video
            src={activeSrc}
            controls
            playsInline
            className={cn(
              'w-full transition-opacity duration-300',
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
              'w-full transition-opacity duration-300',
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

// ── Detail metadata row ───────────────────────────────────────────

function MetaRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn('text-sm text-foreground', bold && 'font-medium')}>{value}</p>
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

  const scoreItems = [
    { label: 'Hook', value: ad.score_hook },
    { label: 'Attention', value: ad.score_attention },
    { label: 'Clarity', value: ad.score_clarity },
    { label: 'CTA', value: ad.score_cta },
    { label: 'Overall', value: ad.score_overall },
  ].filter((s) => s.value != null)

  const domain = extractDomain(ad.link_url)
  const categoryLabel = ad.content_style_tags?.length > 0
    ? ad.content_style_tags.map((t) => t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())).join(', ')
    : null

  return (
    <DetailShell
      backHref="/briefing-assistant/meta-ads"
      title={ad.page_name}
      subtitle={<span>{ad.source_provider ?? 'Sponsored'}</span>}
      itemId={ad.id}
      sourceType="meta-ad"
      left={
        <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
          <div className="p-3 pb-0">
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted/60 text-muted-foreground text-xs font-bold flex-shrink-0">
                  {ad.page_name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{ad.page_name}</p>
                  <p className="text-[11px] text-muted-foreground">Sponsored</p>
                </div>
              </div>
              {ad.page_id && (
                <Button
                  variant="outline"
                  size="sm"
                  className={cn('gap-1.5 flex-shrink-0', following && 'bg-primary/10 border-primary/30 text-primary')}
                  onClick={toggleFollow}
                >
                  {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
                  {following ? 'Following' : 'Follow'}
                </Button>
              )}
            </div>

            <div className="flex items-center gap-1 mb-2">
              {ad.is_active ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />
              )}
              <span className="text-[11px] text-muted-foreground">
                {formatDate(ad.started_at)} - {ad.ended_at ? formatDate(ad.ended_at) : 'Present'}
              </span>
            </div>

            <AdCopyBlock text={ad.body_text} />
          </div>

          <div className="pt-2">
            <CreativeMedia ad={ad} onDownload={handleMirrorDownload} downloading={mirroring} onSelfHeal={fetchAd} />
          </div>

          {ad.link_url && (
            <a
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 flex justify-between gap-2 items-center border-t border-border/40 hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{domain}</p>
                {ad.body_text && (
                  <p className="text-xs font-medium text-foreground truncate">
                    {ad.body_text.split('\n')[0]?.substring(0, 60)}
                  </p>
                )}
              </div>
              <span className="flex-shrink-0 rounded-md border border-border px-3 py-1 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors">
                Learn More
              </span>
            </a>
          )}
        </div>
      }
      right={
        <>
          <div className="rounded-lg border border-border/40 bg-card overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border/40">
              <div className="flex items-center gap-1.5">
                {ad.is_active ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {ad.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <a
                href={ad.link_url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Ad ID: {ad.ad_id?.substring(0, 16)}
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="p-4 space-y-4">
              <MetaRow label="Start date" value={formatDate(ad.started_at)} />
              <MetaRow label="End date" value={formatDate(ad.ended_at)} />
              <MetaRow label="Running time" value={computeRunningDays(ad.started_at, ad.ended_at)} bold />
              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">Platforms</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm" title="Facebook">f</span>
                  <span className="text-sm" title="Instagram">ig</span>
                  <span className="text-sm" title="Messenger">m</span>
                </div>
              </div>
              <MetaRow label="Display format" value={ad.media_type === 'video' ? 'Video' : ad.media_type === 'image' ? 'Image' : (ad.media_type ?? '—')} />
              {categoryLabel && <MetaRow label="Categories" value={categoryLabel} />}
              {ad.spend_lower != null && (
                <MetaRow
                  label="Spend range"
                  value={`US$${ad.spend_lower.toLocaleString()}${ad.spend_upper ? ` – US$${ad.spend_upper.toLocaleString()}` : '+'}`}
                />
              )}
            </div>
          </div>

          {scoreItems.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden p-4 space-y-3">
              <p className="text-xs font-semibold text-foreground">Creative Scores</p>
              <div className="space-y-1.5">
                {scoreItems.map((s) => (
                  <div key={s.label} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16">{s.label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          s.value! >= 70 ? 'bg-emerald-500' : s.value! >= 50 ? 'bg-amber-500' : 'bg-red-400',
                        )}
                        style={{ width: `${s.value}%` }}
                      />
                    </div>
                    <span className={cn(
                      'text-[10px] font-semibold w-7 text-right',
                      s.value! >= 70 ? 'text-emerald-600' : s.value! >= 50 ? 'text-amber-600' : 'text-red-500',
                    )}>
                      {s.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ad.analysis_summary && (
            <div className="rounded-lg border border-border/40 bg-card overflow-hidden p-4 space-y-2">
              <p className="text-xs font-semibold text-foreground">AI Analysis</p>
              <p className="text-xs text-foreground/80 leading-relaxed">{ad.analysis_summary}</p>
            </div>
          )}
        </>
      }
    />
  )
}
