'use client'

import { useCallback, useEffect, useState } from 'react'
import { TrendingUp, Loader2, ExternalLink, Search, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface TrendItem {
  id: string
  title: string
  description: string
  source: string
  url: string | null
  relevance_score: number | null
  discovered_at: string
  tags: string[]
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const fetchTrends = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const res = await fetch(`/api/briefing-assistant/trends?${params}`)
      const data = await res.json()
      setTrends(data.trends ?? [])
    } catch {
      setTrends([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    fetchTrends()
  }, [fetchTrends])

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Trends</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Discover emerging creative trends and formats across platforms
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={fetchTrends}>
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
            placeholder="Search trends..."
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all"
          />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : trends.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <TrendingUp className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              No trends discovered yet. Run a workflow to start mining trends.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trends.map((trend) => (
              <div
                key={trend.id}
                className="rounded-xl border border-border bg-card p-4 space-y-2 hover:border-primary/20 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">{trend.title}</h3>
                  {trend.relevance_score != null && (
                    <span className={cn(
                      'text-[10px] font-semibold rounded-md px-1.5 py-0.5 flex-shrink-0',
                      trend.relevance_score >= 80
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                        : 'bg-muted/50 text-muted-foreground'
                    )}>
                      {trend.relevance_score}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                  {trend.description}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-muted-foreground/50">{trend.source}</span>
                  {trend.url && (
                    <a href={trend.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {trend.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {trend.tags.map((tag) => (
                      <span key={tag} className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
