'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  TrendingUp,
  Loader2,
  ExternalLink,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  Globe,
  Lightbulb,
  Music,
  Brain,
  Moon,
  Baby,
  Focus,
  Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApi } from '@/lib/use-api'

// ── Types ─────────────────────────────────────────────────────────

interface TrendItem {
  id: string
  title: string
  description: string
  source: string
  url: string | null
  thumbnail: string | null
  relevance_score: number | null
  creative_angles: string[]
  highlights: string[]
  author: string | null
  discovered_at: string
  published_at: string | null
  tags: string[]
}

interface VerticalMeta {
  id: string
  label: string
}

interface DigestData {
  digest: string
  citations: string[]
  generatedAt: string
  fresh: boolean
}

// ── Vertical icon map ─────────────────────────────────────────────

const VERTICAL_ICONS: Record<string, typeof Music> = {
  festivals: Music,
  neurodivergent: Brain,
  sleep: Moon,
  parenting: Baby,
  focus: Focus,
  wellness: Heart,
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

function domainFromUrl(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return ''
  }
}

// ── Score pill ────────────────────────────────────────────────────

function RelevanceBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const color =
    score >= 80
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : score >= 60
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-muted/50 text-muted-foreground'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0',
        color,
      )}
    >
      {score}
      <span className="font-normal opacity-70">rel</span>
    </span>
  )
}

// ── Thumbnail with fallback ───────────────────────────────────────

function ArticleThumbnail({ src, alt }: { src: string | null; alt: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error')

  if (!src || state === 'error') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center">
        <Globe className="h-5 w-5 text-primary/20" />
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
        loading="lazy"
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </>
  )
}

// ── Creative Angles expandable ────────────────────────────────────

function CreativeAngles({ angles }: { angles: string[] }) {
  const [open, setOpen] = useState(false)

  if (angles.length === 0) return null

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
      >
        <Lightbulb className="h-3 w-3" />
        {angles.length} creative angle{angles.length > 1 ? 's' : ''}
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {angles.map((angle, i) => (
            <p
              key={i}
              className="text-[11px] text-muted-foreground leading-relaxed pl-4 border-l-2 border-primary/15"
            >
              {angle}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Article Card ──────────────────────────────────────────────────

function ArticleCard({ item, onNavigate }: { item: TrendItem; onNavigate: () => void }) {
  return (
    <div
      className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onNavigate() }}
    >
      <div className="relative aspect-[16/9] bg-muted/30 overflow-hidden">
        <ArticleThumbnail src={item.thumbnail} alt={item.title} />
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all"
            aria-label="Open article"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {item.title}
          </h3>
          <RelevanceBadge score={item.relevance_score} />
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
          {item.description}
        </p>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 mt-0.5">
          <span className="truncate">{item.source || domainFromUrl(item.url)}</span>
          {item.published_at && (
            <>
              <span className="flex-shrink-0">·</span>
              <span className="flex items-center gap-0.5 flex-shrink-0">
                <Clock className="h-2.5 w-2.5" />
                {timeAgo(item.published_at)}
              </span>
            </>
          )}
          {item.author && (
            <>
              <span className="flex-shrink-0">·</span>
              <span className="truncate">{item.author}</span>
            </>
          )}
        </div>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-primary/8 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        <CreativeAngles angles={item.creative_angles} />
      </div>
    </div>
  )
}

// ── Digest Card ───────────────────────────────────────────────────

function DigestCard({
  verticalId,
  verticalLabel,
}: {
  verticalId: string
  verticalLabel: string
}) {
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchDigest = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/briefing-assistant/trends/digest?vertical=${verticalId}`)
      if (res.ok) {
        const data = await res.json()
        setDigest(data)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [verticalId])

  useEffect(() => {
    fetchDigest()
  }, [fetchDigest])

  if (loading && !digest) {
    return (
      <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-4 mb-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
          <span className="text-xs text-muted-foreground">Loading trend digest...</span>
        </div>
      </div>
    )
  }

  if (!digest?.digest) return null

  const paragraphs = digest.digest.split('\n\n').filter(Boolean)
  const preview = paragraphs[0] || ''
  const hasMore = paragraphs.length > 1

  return (
    <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary/60" />
          <h3 className="text-xs font-semibold text-foreground">
            {verticalLabel} — Trend Digest
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground/50">
          {digest.generatedAt ? timeAgo(digest.generatedAt) : ''}
        </span>
      </div>
      <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
        {expanded ? digest.digest : preview}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
      {expanded && digest.citations.length > 0 && (
        <div className="mt-3 pt-2 border-t border-primary/10">
          <p className="text-[10px] font-medium text-muted-foreground/50 mb-1">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {digest.citations.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary/60 hover:text-primary truncate max-w-[200px] underline underline-offset-2"
              >
                {domainFromUrl(url)}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function TrendsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" /></div>}>
      <TrendsPageInner />
    </Suspense>
  )
}

function TrendsPageInner() {
  const router = useRouter()
  const urlParams = useSearchParams()
  const [search, setSearch] = useState(urlParams.get('q') ?? '')
  const [activeVertical, setActiveVertical] = useState<string>(urlParams.get('vertical') ?? 'all')
  const [discovering, setDiscovering] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (activeVertical !== 'all') params.set('vertical', activeVertical)
    const qs = params.toString()
    const target = qs ? `?${qs}` : ''
    if (window.location.search.slice(1) !== qs) {
      router.replace(`/briefing-assistant/trends${target}`, { scroll: false })
    }
  }, [search, activeVertical, router])

  const trendsUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (search.trim()) params.set('q', search.trim())
    if (activeVertical !== 'all') params.set('vertical', activeVertical)
    return `/api/briefing-assistant/trends?${params}`
  }, [search, activeVertical])

  const { data, loading, refetch } = useApi<{ trends: TrendItem[]; verticals: VerticalMeta[] }>(trendsUrl, { keepPreviousData: true })
  const trends = data?.trends ?? []
  const verticals = data?.verticals ?? []

  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    setDiscoverResult(null)
    try {
      const body = activeVertical !== 'all' ? { vertical: activeVertical } : {}
      const res = await fetch('/api/briefing-assistant/trends/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setDiscoverResult(`Error: ${data.error ?? 'Discovery failed'}`)
        return
      }
      const label = activeVertical !== 'all' ? activeVertical : 'all verticals'
      setDiscoverResult(
        `Discovered ${data.discovered} articles across ${label}. ${data.scored ?? 0} scored.`,
      )
      await refetch()
    } catch {
      setDiscoverResult('Error: Discovery request failed')
    } finally {
      setDiscovering(false)
    }
  }, [activeVertical, refetch])

  const activeLabel = activeVertical === 'all'
    ? 'All'
    : verticals.find((v) => v.id === activeVertical)?.label ?? activeVertical

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Trends</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              AI-curated newsfeed of use cases, angles, and cultural moments for creative strategy
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleDiscover}
            disabled={discovering}
          >
            {discovering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            {discovering ? 'Discovering...' : 'Discover Now'}
          </Button>
        </div>

        {discoverResult && (
          <div
            className={cn(
              'mb-3 flex items-center gap-2 text-xs rounded-md px-3 py-1.5',
              discoverResult.startsWith('Error')
                ? 'text-red-600 bg-red-500/10'
                : 'text-emerald-600 bg-emerald-500/10',
            )}
          >
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
            {discoverResult}
          </div>
        )}

        {/* Vertical tabs */}
        <div className="flex items-center border-b border-border -mx-6 px-6 mb-4">
          <button
            type="button"
            onClick={() => setActiveVertical('all')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
              activeVertical === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            All
          </button>
          {verticals.map((v) => {
            const Icon = VERTICAL_ICONS[v.id] ?? Globe
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setActiveVertical(v.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                  activeVertical === v.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            )
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trends..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading && trends.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            {discovering ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
                <p className="text-sm text-muted-foreground">Discovering trends...</p>
              </>
            ) : (
              <>
                <TrendingUp className="h-10 w-10 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground">
                  {activeVertical !== 'all'
                    ? `No trends for ${activeLabel} yet.`
                    : 'No trends discovered yet.'}
                </p>
                <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
                  Click &ldquo;Discover Now&rdquo; to search the web for relevant articles and cultural moments.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {trends.map((trend) => (
              <ArticleCard key={trend.id} item={trend} onNavigate={() => router.push(`/briefing-assistant/trends/${trend.id}`)} />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
