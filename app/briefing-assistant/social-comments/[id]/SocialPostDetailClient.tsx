'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  Loader2,
  Sparkles,
  Lightbulb,
  Quote,
  Clock,
  Info,
  MessageCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetailShell, DetailSkeleton, RailSection } from '@/components/briefing-assistant/DetailShell'

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

function cleanTitle(title: string): string {
  return title
    .replace(/\s*:\s*r\/\w+\s*-\s*Reddit\s*$/i, '')
    .replace(/\s*\|\s*r\/\w+\s*$/i, '')
    .trim()
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
  const [aiSummary, setAiSummary] = useState<string | null>(null)

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
      setAiSummary(data.ai_summary ?? null)

      if (!data.ai_summary) {
        fetch(`/api/briefing-assistant/social-comments/${postId}/summary`)
          .then((r) => r.json())
          .then((d) => { if (d.ai_summary) setAiSummary(d.ai_summary) })
          .catch(() => {})
      }
    } catch {
      setError('Request failed')
    } finally {
      setLoading(false)
    }
  }, [postId])

  useEffect(() => {
    fetchPost()
  }, [fetchPost])

  if (loading) return <DetailSkeleton />

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
    <DetailShell
      backHref="/briefing-assistant/social-comments"
      title={cleanTitle(post.title)}
      subtitle={
        <>
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
        </>
      }
      itemId={post.id}
      sourceType="social-comment"
      left={
        <>
          {/* Hero image */}
          <div className="rounded-lg border border-border bg-muted/20 overflow-hidden max-w-2xl mx-auto">
            <div className="relative aspect-[16/9]">
              <HeroImage src={post.thumbnail} alt={cleanTitle(post.title)} subreddit={post.subreddit} />
            </div>
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
              <div className="space-y-3">
                {(post.body_text || post.preview).split(/\n{2,}/).map((paragraph, i) => {
                  const trimmed = paragraph.trim()
                  if (!trimmed) return null
                  return (
                    <p key={i} className="text-sm text-foreground leading-relaxed">
                      {trimmed}
                    </p>
                  )
                })}
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
        </>
      }
      right={
        <>
          {/* Details (merged metadata) */}
          <RailSection icon={<Info className="h-3.5 w-3.5 text-primary" />} title="Details">
            <dl className="space-y-2 text-xs">
              {post.subreddit && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subreddit</dt>
                  <dd className="text-foreground font-medium">
                    {post.url ? (
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                        r/{post.subreddit}
                      </a>
                    ) : (
                      <>r/{post.subreddit}</>
                    )}
                  </dd>
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
          {post.creative_angles.length > 0 && (
            <RailSection icon={<Lightbulb className="h-3.5 w-3.5 text-primary" />} title="Creative Angles">
              <div className="space-y-2.5">
                {post.creative_angles.map((angle, i) => (
                  <p key={i} className="text-xs text-foreground/80 leading-relaxed pl-3 border-l-2 border-primary/20">
                    {angle}
                  </p>
                ))}
              </div>
            </RailSection>
          )}

          {/* Language Hooks */}
          {post.language_hooks.length > 0 && (
            <RailSection icon={<Quote className="h-3.5 w-3.5 text-primary" />} title="Language Hooks">
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
            </RailSection>
          )}
        </>
      }
    />
  )
}
