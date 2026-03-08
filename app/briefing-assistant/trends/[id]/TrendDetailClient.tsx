'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  Loader2,
  Sparkles,
  Lightbulb,
  Quote,
  Globe,
  Clock,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetailShell, DetailSkeleton, RailSection } from '@/components/briefing-assistant/DetailShell'

// ── Types ─────────────────────────────────────────────────────────

interface TrendDetail {
  id: string
  title: string
  body_text: string
  preview: string
  thumbnail: string | null
  url: string | null
  source: string
  tags: string[]
  published_at: string | null
  discovered_at: string
  relevance_score: number | null
  creative_angles: string[]
  highlights: string[]
  author: string | null
  ai_summary: string | null
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

// ── Hero Image ────────────────────────────────────────────────────

function HeroImage({ src, alt }: { src: string | null; alt: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error')

  if (!src || state === 'error') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center">
        <Globe className="h-10 w-10 text-primary/15" />
      </div>
    )
  }

  return (
    <>
      {state === 'loading' && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted/40 via-muted/60 to-muted/40" />
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          'w-full h-full object-cover transition-opacity duration-300',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </>
  )
}

// ── Client ────────────────────────────────────────────────────────

export function TrendDetailClient({ trendId }: { trendId: string }) {
  const router = useRouter()
  const [trend, setTrend] = useState<TrendDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)

  const fetchTrend = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/briefing-assistant/trends/${trendId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Trend not found')
        return
      }
      setTrend(data)
      setAiSummary(data.ai_summary ?? null)

      if (!data.ai_summary) {
        fetch(`/api/briefing-assistant/trends/${trendId}/summary`)
          .then((r) => r.json())
          .then((d) => { if (d.ai_summary) setAiSummary(d.ai_summary) })
          .catch(() => {})
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [trendId])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  if (loading) return <DetailSkeleton />

  if (error || !trend) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error ?? 'Trend not found'}</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/briefing-assistant/trends')}>
          Back to trends
        </Button>
      </div>
    )
  }

  return (
    <DetailShell
      backHref="/briefing-assistant/trends"
      title={trend.title}
      subtitle={
        <>
          <span>{trend.source}</span>
          {trend.author && (
            <>
              <span className="text-muted-foreground/30">/</span>
              <span>{trend.author}</span>
            </>
          )}
        </>
      }
      itemId={trend.id}
      sourceType="trend"
      left={
        <>
          {/* Hero image */}
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden max-w-2xl mx-auto">
            <div className="relative aspect-[16/9]">
              <HeroImage src={trend.thumbnail} alt={trend.title} />
            </div>
          </div>

          {/* Article content */}
          {(trend.body_text || trend.preview) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Article Content
              </h3>
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {trend.body_text || trend.preview}
              </div>
            </div>
          )}

          {trend.url && (
            <a
              href={trend.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Read full article on {trend.source}
            </a>
          )}
        </>
      }
      right={
        <>
          {/* Details (merged metadata) */}
          <RailSection icon={<Info className="h-3.5 w-3.5 text-primary" />} title="Details">
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="text-foreground">
                  {trend.url ? (
                    <a href={trend.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                      {trend.source}
                    </a>
                  ) : (
                    trend.source
                  )}
                </dd>
              </div>
              {trend.author && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="text-foreground">{trend.author}</dd>
                </div>
              )}
              {trend.published_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(trend.published_at)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discovered</dt>
                <dd className="text-foreground">{formatDate(trend.discovered_at)}</dd>
              </div>
              {trend.tags.length > 0 && (
                <div>
                  <dt className="text-muted-foreground mb-1">Tags</dt>
                  <dd className="flex flex-wrap gap-1">
                    {trend.tags.map((tag) => (
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
            {aiSummary ? (
              <p className="text-sm text-foreground/80 leading-relaxed">{aiSummary}</p>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
                <span className="text-xs text-muted-foreground">Generating analysis...</span>
              </div>
            )}
          </RailSection>

          {/* Creative Angles */}
          {trend.creative_angles.length > 0 && (
            <RailSection icon={<Lightbulb className="h-3.5 w-3.5 text-primary" />} title="Creative Angles">
              <div className="space-y-2.5">
                {trend.creative_angles.map((angle, i) => (
                  <p key={i} className="text-xs text-foreground/80 leading-relaxed pl-3 border-l-2 border-primary/20">
                    {angle}
                  </p>
                ))}
              </div>
            </RailSection>
          )}

          {/* Language Hooks (from highlights) */}
          {trend.highlights.length > 0 && (
            <RailSection icon={<Quote className="h-3.5 w-3.5 text-primary" />} title="Language Hooks">
              <div className="space-y-2">
                {trend.highlights.map((hook, i) => (
                  <div key={i} className="rounded-md border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
                    <p className="text-xs text-foreground/80 leading-relaxed italic">
                      &ldquo;{hook}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
            </RailSection>
          )}
        </>
      }
    />
  )
}
