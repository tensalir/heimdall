'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Play,
  ImageIcon,
  Loader2,
  PaintbrushIcon,
  BarChart3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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
  score_attention?: number | null
  score_clarity?: number | null
  score_cta?: number | null
  analysis_summary?: string | null
}

export default function MetaAdDetailPage() {
  const params = useParams()
  const router = useRouter()
  const adId = params.adId as string

  const [ad, setAd] = useState<AdDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    <div className="flex flex-col h-full overflow-y-auto">
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
                <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Active
                </span>
              )}
            </div>
          </div>
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

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
        <div className="p-6 space-y-6 border-r border-border">
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden max-w-lg mx-auto">
            {ad.thumbnail_url || ad.creative_url ? (
              <div className="relative aspect-[4/5]">
                <img
                  src={ad.creative_url || ad.thumbnail_url || ''}
                  alt={ad.page_name}
                  className="w-full h-full object-contain"
                />
                {ad.media_type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/50 text-white">
                      <Play className="h-6 w-6 ml-0.5" />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="aspect-[4/5] flex items-center justify-center">
                <ImageIcon className="h-12 w-12 text-muted-foreground/15" />
              </div>
            )}
          </div>

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
              {ad.link_url}
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
