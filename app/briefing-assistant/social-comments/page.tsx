'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2,
  ExternalLink,
  Search,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Zap,
  Clock,
  Lightbulb,
  Quote,
  Ear,
  Brain,
  Volume2,
  Moon,
  Focus,
  Tag,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────

interface SocialPost {
  id: string
  title: string
  thumbnail: string | null
  platform: string
  author: string | null
  subreddit: string | null
  text: string
  sentiment: string
  relevance_score: number | null
  authenticity_score: number | null
  creative_angles: string[]
  language_hooks: string[]
  highlights: string[]
  engagement_count: number | null
  source_url: string | null
  captured_at: string
  published_at: string | null
  tags: string[]
}

interface TopicMeta {
  id: string
  label: string
}

interface DigestData {
  digest: string
  citations: string[]
  generatedAt: string
  fresh: boolean
}

// ── Topic icon map ────────────────────────────────────────────────

const TOPIC_ICONS: Record<string, typeof Ear> = {
  'hearing-protection': Ear,
  'noise-sensitivity': Volume2,
  'sensory-overload': Brain,
  'sleep-noise': Moon,
  'focus-productivity': Focus,
  'loop-brand': Tag,
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
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Cover image with subreddit fallback ───────────────────────────

function CardCover({ src, alt, subreddit }: { src: string | null; alt: string; subreddit: string | null }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error')

  if (!src || state === 'error') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-violet-500/10 via-primary/5 to-orange-500/10 flex flex-col items-center justify-center gap-1.5">
        <MessageCircle className="h-6 w-6 text-primary/15" />
        {subreddit && (
          <span className="text-[10px] font-semibold text-primary/25">r/{subreddit}</span>
        )}
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

// ── Score badges ──────────────────────────────────────────────────

function RelevanceBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const color =
    score >= 75
      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
      : score >= 50
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
        : 'bg-muted/50 text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0', color)} title="AI-scored relevance to Loop use cases (0-100)">
      {score}
      <span className="font-normal opacity-70">Relevance</span>
    </span>
  )
}

function AuthenticityBadge({ score }: { score: number | null }) {
  if (score == null) return null
  const color =
    score >= 80
      ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
      : score >= 60
        ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400'
        : 'bg-muted/50 text-muted-foreground'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold flex-shrink-0', color)} title="AI-scored authenticity of genuine discussion (0-100)">
      {score}
      <span className="font-normal opacity-70">Authenticity</span>
    </span>
  )
}

// ── Language Hooks expandable ─────────────────────────────────────

function LanguageHooks({ hooks }: { hooks: string[] }) {
  const [open, setOpen] = useState(false)
  if (hooks.length === 0) return null

  return (
    <div className="pt-1">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="flex items-center gap-1 text-[10px] font-medium text-violet-500/70 hover:text-violet-500 transition-colors"
      >
        <Quote className="h-3 w-3" />
        {hooks.length} language hook{hooks.length > 1 ? 's' : ''}
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {hooks.map((hook, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-relaxed pl-4 border-l-2 border-violet-500/20 italic">
              &ldquo;{hook}&rdquo;
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Creative Angles expandable ────────────────────────────────────

function CreativeAngles({ angles }: { angles: string[] }) {
  const [open, setOpen] = useState(false)
  if (angles.length === 0) return null

  return (
    <div className="pt-0.5">
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open) }}
        className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary transition-colors"
      >
        <Lightbulb className="h-3 w-3" />
        {angles.length} creative angle{angles.length > 1 ? 's' : ''}
        {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1">
          {angles.map((angle, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-relaxed pl-4 border-l-2 border-primary/15">
              {angle}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Post Card ─────────────────────────────────────────────────────

function PostCard({ item, onNavigate }: { item: SocialPost; onNavigate: () => void }) {
  return (
    <div
      className="group flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={onNavigate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onNavigate() }}
    >
      {/* Cover image */}
      <div className="relative aspect-[16/9] bg-muted/30 overflow-hidden">
        <CardCover src={item.thumbnail} alt={item.title} subreddit={item.subreddit} />
        {item.subreddit && (
          <div className="absolute top-2 left-2 rounded-md bg-black/50 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-white">
            r/{item.subreddit}
          </div>
        )}
        {item.source_url && (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 flex items-center justify-center w-7 h-7 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all"
            aria-label="Open on Reddit"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {/* Content */}
      <div className="p-3.5 flex-1 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 flex-1">
            {item.title}
          </h3>
        </div>

        {/* Date + scores row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {item.published_at ? (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/60">
              <Clock className="h-2.5 w-2.5" />
              {formatDate(item.published_at)}
            </span>
          ) : item.captured_at ? (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground/40 italic">
              <Clock className="h-2.5 w-2.5" />
              Discovered {timeAgo(item.captured_at)}
            </span>
          ) : null}
          <RelevanceBadge score={item.relevance_score} />
          <AuthenticityBadge score={item.authenticity_score} />
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
          {item.text.slice(0, 300)}
        </p>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.tags.map((tag) => (
              <span key={tag} className="rounded bg-primary/8 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium">
                {tag}
              </span>
            ))}
          </div>
        )}

        <LanguageHooks hooks={item.language_hooks} />
        <CreativeAngles angles={item.creative_angles} />

        {/* View on Reddit button */}
        {item.source_url && (
          <div className="mt-auto pt-2">
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/50 hover:border-primary/30 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View on Reddit
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Digest Card ───────────────────────────────────────────────────

function DigestCard({ topicId, topicLabel }: { topicId: string; topicLabel: string }) {
  const [digest, setDigest] = useState<DigestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchDigest = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/briefing-assistant/social-comments/digest?topic=${topicId}`)
      if (res.ok) {
        const data = await res.json()
        setDigest(data)
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    fetchDigest()
  }, [fetchDigest])

  if (loading && !digest) {
    return (
      <div className="rounded-lg border border-primary/15 bg-primary/[0.03] p-4 mb-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary/40" />
          <span className="text-xs text-muted-foreground">Loading social listening digest...</span>
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
            {topicLabel} — Social Listening Digest
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
            {digest.citations.map((url, i) => {
              let display = url
              try { display = new URL(url).hostname.replace('www.', '') } catch { /* noop */ }
              return (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-primary/60 hover:text-primary truncate max-w-[200px] underline underline-offset-2"
                >
                  {display}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────

export default function SocialListeningPage() {
  const router = useRouter()
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [topics, setTopics] = useState<TopicMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTopic, setActiveTopic] = useState<string>('all')
  const [sort, setSort] = useState<'recent' | 'relevance'>('recent')
  const [discovering, setDiscovering] = useState(false)
  const [discoverResult, setDiscoverResult] = useState<string | null>(null)

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (activeTopic !== 'all') params.set('topic', activeTopic)
      params.set('sort', sort)
      params.set('sinceWeeks', '52')
      const res = await fetch(`/api/briefing-assistant/social-comments?${params}`)
      const data = await res.json()
      setPosts(data.comments ?? [])
      if (data.topics) setTopics(data.topics)
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [search, activeTopic, sort])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleDiscover = useCallback(async () => {
    setDiscovering(true)
    setDiscoverResult(null)
    try {
      const body = activeTopic !== 'all' ? { topic: activeTopic } : {}
      const res = await fetch('/api/briefing-assistant/social-comments/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setDiscoverResult(`Error: ${data.error ?? 'Discovery failed'}`)
        return
      }
      const label = activeTopic !== 'all' ? activeTopic : 'all topics'
      setDiscoverResult(
        `Found ${data.discovered} Reddit posts across ${label}. ${data.scored ?? 0} passed quality gate.`,
      )
      await fetchPosts()
    } catch {
      setDiscoverResult('Error: Discovery request failed')
    } finally {
      setDiscovering(false)
    }
  }, [activeTopic, fetchPosts])

  const activeLabel = activeTopic === 'all'
    ? 'All'
    : topics.find((t) => t.id === activeTopic)?.label ?? activeTopic

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Social Listening</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real Reddit conversations about hearing protection, noise sensitivity, and Loop
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
            {discovering ? 'Scanning Reddit...' : 'Discover Now'}
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

        {/* Topic tabs */}
        <div className="flex items-center border-b border-border -mx-6 px-6 mb-4 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTopic('all')}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
              activeTopic === 'all'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
            )}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            All
          </button>
          {topics.map((t) => {
            const Icon = TOPIC_ICONS[t.id] ?? MessageCircle
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTopic(t.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                  activeTopic === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Search + sort */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSort('recent')}
              className={cn(
                'px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors',
                sort === 'recent'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              Recent
            </button>
            <button
              type="button"
              onClick={() => setSort('relevance')}
              className={cn(
                'px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors',
                sort === 'relevance'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              Relevance
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTopic !== 'all' && (
          <DigestCard topicId={activeTopic} topicLabel={activeLabel} />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <MessageCircle className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              {activeTopic !== 'all'
                ? `No conversations for ${activeLabel} yet.`
                : 'No conversations discovered yet.'}
            </p>
            <p className="text-xs text-muted-foreground/60 max-w-sm text-center">
              Click &ldquo;Discover Now&rdquo; to scan Reddit for recent conversations about hearing protection, noise sensitivity, and Loop across{' '}
              {activeTopic !== 'all' ? 'this topic' : 'all topics'}.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                item={post}
                onNavigate={() => router.push(`/briefing-assistant/social-comments/${post.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
