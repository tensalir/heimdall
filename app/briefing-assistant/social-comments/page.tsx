'use client'

import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Loader2, Search, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface SocialCommentItem {
  id: string
  platform: string
  author: string | null
  text: string
  sentiment: 'positive' | 'negative' | 'neutral'
  engagement_count: number | null
  source_url: string | null
  captured_at: string
  tags: string[]
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const config: Record<string, { icon: React.ElementType; cls: string }> = {
    positive: { icon: ThumbsUp, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    negative: { icon: ThumbsDown, cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    neutral: { icon: MessageCircle, cls: 'bg-muted/50 text-muted-foreground' },
  }
  const c = config[sentiment] ?? config.neutral
  const Icon = c.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold', c.cls)}>
      <Icon className="h-3 w-3" />
      {sentiment}
    </span>
  )
}

export default function SocialCommentsPage() {
  const [comments, setComments] = useState<SocialCommentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchComments = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/briefing-assistant/social-comments?${params}`)
      const data = await res.json()
      setComments(data.comments ?? [])
    } catch {
      setComments([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Social Comments</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Mine qualitative insights from social media comments and customer reviews
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchComments}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
        <div className="relative max-w-md mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search comments..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <MessageCircle className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No comments ingested yet. Connect social data sources or run a workflow.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-w-3xl">
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="rounded-lg border border-border bg-card p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {comment.author && (
                      <span className="text-xs font-semibold text-foreground">{comment.author}</span>
                    )}
                    <span className="text-[10px] text-muted-foreground/50">{comment.platform}</span>
                  </div>
                  <SentimentBadge sentiment={comment.sentiment} />
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">{comment.text}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap gap-1">
                    {comment.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground/40">
                    {new Date(comment.captured_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
