'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Sparkles,
  Lightbulb,
  BarChart3,
  Globe,
  Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Score Bar ─────────────────────────────────────────────────────

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
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [trendId])

  useEffect(() => {
    fetchTrend()
  }, [fetchTrend])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

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
    <div className="flex flex-col h-full overflow-y-auto scrollbar-subtle">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/briefing-assistant/trends"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
              {trend.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>{trend.source}</span>
              {trend.author && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span>{trend.author}</span>
                </>
              )}
              {trend.relevance_score != null && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                    trend.relevance_score >= 80
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : trend.relevance_score >= 60
                        ? 'bg-amber-500/15 text-amber-600'
                        : 'bg-muted/50 text-muted-foreground',
                  )}
                >
                  {trend.relevance_score} rel
                </span>
              )}
            </div>
          </div>
          {trend.url && (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={trend.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open source
              </a>
            </Button>
          )}
        </div>
      </header>

      {/* Two-column layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0">
        {/* Main column */}
        <div className="p-6 space-y-6 border-r border-border">
          {/* Hero image */}
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden max-w-2xl mx-auto">
            <div className="relative aspect-[16/9]">
              <HeroImage src={trend.thumbnail} alt={trend.title} />
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-lg border-l-4 border-primary bg-primary/[0.04] p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary/60" />
              AI Summary
            </h3>
            {trend.ai_summary ? (
              <p className="text-sm text-foreground/80 leading-relaxed">
                {trend.ai_summary}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
                <span className="text-xs text-muted-foreground">Generating summary...</span>
              </div>
            )}
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
        </div>

        {/* Sidebar */}
        <div className="p-6 space-y-6 bg-card/40">
          {/* Relevance score */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Relevance Score
            </h3>
            <ScoreBar label="Relevance" value={trend.relevance_score} />
          </div>

          {/* Creative Angles */}
          {trend.creative_angles.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                Creative Angles
              </h3>
              <div className="space-y-2.5">
                {trend.creative_angles.map((angle, i) => (
                  <p
                    key={i}
                    className="text-xs text-foreground/80 leading-relaxed pl-3 border-l-2 border-primary/20"
                  >
                    {angle}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
              Metadata
            </h3>
            <dl className="space-y-2 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="text-foreground">{trend.source}</dd>
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
          </div>
        </div>
      </div>
    </div>
  )
}
