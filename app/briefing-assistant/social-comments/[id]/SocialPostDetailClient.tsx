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
  Quote,
  Clock,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────

interface PostDetail {
  id: string
  title: string
  body_text: string
  preview: string
  thumbnail: string | null
  url: string | null
  platform: string
  tags: string[]
  published_at: string | null
  discovered_at: string
  relevance_score: number | null
  authenticity_score: number | null
  creative_angles: string[]
  language_hooks: string[]
  highlights: string[]
  subreddit: string | null
  author: string | null
  ai_summary: string | null
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '\u2014'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ── Score Bar ─────────────────────────────────────────────────────

function ScoreBar({ label, value, description }: { label: string; value: number | null; description: string }) {
  const v = value ?? 0
  const color =
    v >= 80
      ? 'bg-emerald-500'
      : v >= 60
        ? 'bg-amber-500'
        : 'bg-red-500'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value ?? '\u2014'}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${v}%` }} />
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-snug">{description}</p>
    </div>
  )
}

// ── Hero Image ────────────────────────────────────────────────────

function HeroImage({ src, alt, subreddit }: { src: string | null; alt: string; subreddit: string | null }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(src ? 'loading' : 'error')

  if (!src || state === 'error') {
    return (
      <div className="w-full h-full bg-gradient-to-br from-violet-500/10 via-primary/5 to-orange-500/10 flex flex-col items-center justify-center gap-2">
        <MessageCircle className="h-10 w-10 text-primary/15" />
        {subreddit && (
          <span className="text-xs font-medium text-primary/30">r/{subreddit}</span>
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
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </>
  )
}

// ── Client ────────────────────────────────────────────────────────

export function SocialPostDetailClient({ postId }: { postId: string }) {
  const router = useRouter()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPost = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/briefing-assistant/social-comments/${postId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Post not found')
        return
      }
      setPost(data)
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    fetchPost()
  }, [fetchPost])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !post) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-sm text-destructive">{error ?? 'Post not found'}</p>
        <Button variant="outline" size="sm" onClick={() => router.push('/briefing-assistant/social-comments')}>
          Back to Social Listening
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
            href="/briefing-assistant/social-comments"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold tracking-tight text-foreground truncate">
              {post.title}
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              {post.subreddit && (
                <span className="font-semibold text-primary/80">r/{post.subreddit}</span>
              )}
              {post.author && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span>u/{post.author}</span>
                </>
              )}
              {post.published_at && (
                <>
                  <span className="text-muted-foreground/30">/</span>
                  <span className="flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(post.published_at)}
                  </span>
                </>
              )}
            </div>
          </div>
          {post.url && (
            <Button variant="outline" size="sm" className="gap-1.5" asChild>
              <a href={post.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View on Reddit
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
              <HeroImage src={post.thumbnail} alt={post.title} subreddit={post.subreddit} />
            </div>
          </div>

          {/* AI Summary */}
          <div className="rounded-lg border-l-4 border-primary bg-primary/[0.04] p-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary/60" />
              AI Summary
            </h3>
            {post.ai_summary ? (
              <p className="text-sm text-foreground/80 leading-relaxed">
                {post.ai_summary}
              </p>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary/40" />
                <span className="text-xs text-muted-foreground">Generating summary...</span>
              </div>
            )}
          </div>

          {/* Key highlights */}
          {post.highlights.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3">
                Key Excerpts
              </h3>
              <div className="space-y-2">
                {post.highlights.map((h, i) => (
                  <p key={i} className="text-sm text-foreground/70 leading-relaxed pl-4 border-l-2 border-amber-500/25 italic">
                    {h}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Full post content */}
          {(post.body_text || post.preview) && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                Full Post Content
              </h3>
              <div className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                {post.body_text || post.preview}
              </div>
            </div>
          )}

          {post.url && (
            <a
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              Read full thread on Reddit
            </a>
          )}
        </div>

        {/* Sidebar */}
        <div className="p-6 space-y-6 bg-card/40">
          {/* Scores */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              AI Analysis Scores
            </h3>
            <div className="space-y-4">
              <ScoreBar
                label="Relevance"
                value={post.relevance_score}
                description="How relevant to Loop's hearing protection use cases (0-100)"
              />
              <ScoreBar
                label="Authenticity"
                value={post.authenticity_score}
                description="How genuine the discussion is vs promotional or SEO content (0-100)"
              />
            </div>
          </div>

          {/* Language Hooks */}
          {post.language_hooks.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
                <Quote className="h-3.5 w-3.5" />
                Language Hooks
              </h3>
              <div className="space-y-2">
                {post.language_hooks.map((hook, i) => (
                  <div key={i} className="rounded-md border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
                    <p className="text-xs text-foreground/80 leading-relaxed italic">
                      &ldquo;{hook}&rdquo;
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-2 leading-snug">
                Direct consumer language that could power ad copy
              </p>
            </div>
          )}

          {/* Creative Angles */}
          {post.creative_angles.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                Creative Angles
              </h3>
              <div className="space-y-2.5">
                {post.creative_angles.map((angle, i) => (
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
              {post.subreddit && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subreddit</dt>
                  <dd className="text-foreground font-medium">r/{post.subreddit}</dd>
                </div>
              )}
              {post.author && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Author</dt>
                  <dd className="text-foreground">u/{post.author}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Platform</dt>
                <dd className="text-foreground capitalize">{post.platform}</dd>
              </div>
              {post.published_at && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Published</dt>
                  <dd className="text-foreground flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {formatDate(post.published_at)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discovered</dt>
                <dd className="text-foreground">{formatDate(post.discovered_at)}</dd>
              </div>
              {post.tags.length > 0 && (
                <div>
                  <dt className="text-muted-foreground mb-1">Topics</dt>
                  <dd className="flex flex-wrap gap-1">
                    {post.tags.map((tag) => (
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
