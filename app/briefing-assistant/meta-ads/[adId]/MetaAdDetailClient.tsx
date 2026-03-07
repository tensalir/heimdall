'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Play,
  ImageIcon,
  Loader2,
  PaintbrushIcon,
  BarChart3,
  UserPlus,
  UserCheck,
  Eye,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { AtlasBrowserModal } from '@/components/briefing-assistant/AtlasBrowserModal'
import type { MetaAdItem } from '../page'

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  const color =
    v >= 80
      ? 'bg-emerald-500'
      : v >= 60
        ? 'bg-amber-500'
        : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value ?? '—'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

interface AdDetail extends MetaAdItem {
  page_id: string | null
  score_attention?: number | null
  score_clarity?: number | null
  score_cta?: number | null
  analysis_summary?: string | null
}

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

function DetailImage({ ad, onAtlasView }: { ad: AdDetail; onAtlasView: () => void }) {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const mediaSrc = ad.creative_url || ad.thumbnail_url || ''
  const previewFallback = `/api/briefing-assistant/meta-ads/${ad.id}/preview`
  const [activeSrc, setActiveSrc] = useState(mediaSrc || previewFallback)

  return (
    <div className="rounded-lg border border-border bg-muted/20 overflow-hidden max-w-lg mx-auto">
      <div className="relative aspect-[4/5]">
        {imgState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
          </div>
        )}
        {imgState === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
            <ImageIcon className="h-10 w-10 text-muted-foreground/15" />
            <p className="text-xs text-muted-foreground/50 text-center">
              Preview not available
            </p>
            <button
              type="button"
              onClick={onAtlasView}
              className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
            >
              <Eye className="h-3 w-3" />
              Open Atlas View instead
            </button>
          </div>
        ) : (
          <img
            src={activeSrc}
            alt={ad.page_name}
            className={cn(
              'w-full h-full object-contain transition-opacity duration-300',
              imgState === 'loaded' ? 'opacity-100' : 'opacity-0',
            )}
            onLoad={() => setImgState('loaded')}
            onError={() => {
              if (activeSrc !== previewFallback && previewFallback) {
                setActiveSrc(previewFallback)
              } else {
                setImgState('error')
              }
            }}
          />
        )}
        {ad.media_type === 'video' && imgState === 'loaded' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/50 text-white">
              <Play className="h-6 w-6 ml-0.5" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function MetaAdDetailClient({ adId }: { adId: string }) {
  const router = useRouter()
  const [ad, setAd] = useState<AdDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [atlasOpen, setAtlasOpen] = useState(false)
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
    <div className="flex flex-col h-full overflow-y-auto scrollbar-subtle">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/briefing-assistant/meta-ads"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
              {ad.page_name}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{ad.platform}</span>
              <span className="text-muted-foreground/30">/</span>
              <span>{ad.media_type}</span>
              {ad.is_active && (
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                  Active
                </span>
              )}
            </div>
          </div>
          {ad.page_id && (
            <Button
              variant="outline"
              size="sm"
              className={cn('gap-1.5', following && 'bg-primary/10 border-primary/30 text-primary')}
              onClick={toggleFollow}
            >
              {following ? <UserCheck className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
              {following ? 'Following' : 'Follow'}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setAtlasOpen(true)}
          >
            <Eye className="h-3.5 w-3.5" />
            Atlas View
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleMirrorDownload}
            disabled={mirroring}
          >
            {mirroring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {mirroring ? 'Mirroring...' : 'Save to CDN'}
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(`/briefing-assistant/create-ads?source=meta-ad&sourceId=${ad.id}`)}
          >
            <PaintbrushIcon className="h-3.5 w-3.5" />
            Create from this ad
          </Button>
        </div>
      </header>

      {atlasOpen && (
        <AtlasBrowserModal
          adId={ad.id}
          adName={ad.page_name}
          linkUrl={ad.link_url}
          onClose={() => setAtlasOpen(false)}
        />
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
        <div className="p-6 space-y-6 border-r border-border">
          <DetailImage
            ad={ad}
            onAtlasView={() => setAtlasOpen(true)}
          />

          {ad.body_text && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Ad Copy
              </h3>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ad.body_text}
              </p>
            </div>
          )}

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
        </div>

        <div className="p-6 space-y-6 bg-card/40">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              AI Analysis Scores
            </h3>
            <div className="space-y-3">
              <ScoreBar label="Hook" value={ad.score_hook} />
              <ScoreBar label="Attention" value={ad.score_attention ?? null} />
              <ScoreBar label="Clarity" value={ad.score_clarity ?? null} />
              <ScoreBar label="CTA" value={ad.score_cta ?? null} />
              <ScoreBar label="Overall" value={ad.score_overall} />
            </div>
          </div>

          {ad.analysis_summary && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Summary
              </h3>
              <p className="text-sm text-foreground/80 leading-relaxed">
                {ad.analysis_summary}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Metadata
            </h3>
            <dl className="space-y-2 text-xs">
              {ad.started_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Start date</dt>
                  <dd className="text-foreground">{new Date(ad.started_at).toLocaleDateString()}</dd>
                </div>
              )}
              {ad.ended_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">End date</dt>
                  <dd className="text-foreground">{new Date(ad.ended_at).toLocaleDateString()}</dd>
                </div>
              )}
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
          </div>
        </div>
      </div>
    </div>
  )
}
