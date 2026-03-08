'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X,
  ExternalLink,
  Play,
  ImageIcon,
  Loader2,
  PaintbrushIcon,
  BarChart3,
  UserPlus,
  UserCheck,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Info,
  Bookmark,
  BookmarkCheck,
  Plus,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { MetaAdItem } from '../page'

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

// ── Types ─────────────────────────────────────────────────────────

interface AdDetail extends MetaAdItem {
  page_id: string | null
  score_attention?: number | null
  score_clarity?: number | null
  score_cta?: number | null
  analysis_summary?: string | null
}

interface Board {
  id: string
  name: string
}

// ── Follow hook ───────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function computeRunningDays(start: string | null, end: string | null): string {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const days = Math.max(1, Math.round((e - s) / 86_400_000))
  return `${days} day${days !== 1 ? 's' : ''}`
}

// ── Creative Image ───────────────────────────────────────────────

function CreativeImage({
  ad,
  onDownload,
  downloading,
}: {
  ad: AdDetail
  onDownload: () => void
  downloading: boolean
}) {
  const [imgState, setImgState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const mediaSrc = ad.creative_url || ad.thumbnail_url || ''
  const previewFallback = `/api/briefing-assistant/meta-ads/${ad.id}/preview`
  const [activeSrc, setActiveSrc] = useState(mediaSrc || previewFallback)

  return (
    <div className="relative rounded-lg border border-border bg-muted/10 overflow-hidden">
      <div className="relative aspect-[4/5] max-h-[calc(100vh-200px)]">
        {imgState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/30" />
          </div>
        )}
        {imgState === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-6">
            <ImageIcon className="h-10 w-10 text-muted-foreground/15" />
            <p className="text-xs text-muted-foreground/50 text-center">Preview not available</p>
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
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-black/50 text-white">
              <Play className="h-6 w-6 ml-0.5" />
            </div>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDownload}
        disabled={downloading}
        className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 text-xs font-medium hover:bg-black/70 transition-colors disabled:opacity-50"
      >
        {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
        {downloading ? 'Saving...' : 'Download'}
      </button>
    </div>
  )
}

// ── Ad Copy with show more ────────────────────────────────────────

function AdCopyBlock({ text }: { text: string | null }) {
  const [expanded, setExpanded] = useState(false)
  if (!text) return null

  const isLong = text.length > 280

  return (
    <div>
      <p className={cn(
        'text-sm text-foreground leading-relaxed whitespace-pre-wrap',
        !expanded && isLong && 'line-clamp-[8]',
      )}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-1.5 flex items-center gap-1 text-xs font-medium text-primary/70 hover:text-primary transition-colors"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" /> Show less</>
          ) : (
            <><ChevronDown className="h-3 w-3" /> Show more</>
          )}
        </button>
      )}
    </div>
  )
}

// ── Save to Board Popover ─────────────────────────────────────────

function SaveToBoardPopover({
  adId,
  open,
  onClose,
  onSaved,
  anchorRef,
}: {
  adId: string
  open: boolean
  onClose: () => void
  onSaved: () => void
  anchorRef: React.RefObject<HTMLButtonElement | null>
}) {
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoard, setSelectedBoard] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingBoards, setLoadingBoards] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setLoadingBoards(true)
    fetch('/api/briefing-assistant/boards')
      .then((r) => r.json())
      .then((d) => {
        setBoards(d.boards ?? [])
        setSelectedBoard(null)
      })
      .catch(() => {})
      .finally(() => setLoadingBoards(false))
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose, anchorRef])

  if (!open) return null

  async function handleCreateBoard() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch('/api/briefing-assistant/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (data.board) {
        setBoards((prev) => [...prev, data.board])
        setSelectedBoard(data.board.id)
        setNewName('')
      }
    } catch { /* ignore */ } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await fetch('/api/briefing-assistant/saved-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_item_id: adId, board_id: selectedBoard }),
      })
      onSaved()
      onClose()
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-2 z-50 w-72 rounded-lg border border-border bg-card shadow-xl"
    >
      <div className="p-3 border-b border-border">
        <p className="text-xs font-semibold text-foreground">Save to Board</p>
      </div>

      <div className="p-2 max-h-48 overflow-y-auto scrollbar-subtle">
        {loadingBoards ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : boards.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No boards yet. Create one below.</p>
        ) : (
          boards.map((board) => (
            <button
              key={board.id}
              type="button"
              onClick={() => setSelectedBoard(selectedBoard === board.id ? null : board.id)}
              className={cn(
                'w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-xs transition-colors text-left',
                selectedBoard === board.id
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground hover:bg-muted/50',
              )}
            >
              {selectedBoard === board.id ? (
                <Check className="h-3.5 w-3.5 flex-shrink-0" />
              ) : (
                <div className="h-3.5 w-3.5 flex-shrink-0 rounded border border-border" />
              )}
              {board.name}
            </button>
          ))
        )}
      </div>

      <div className="p-2 border-t border-border">
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBoard()}
            placeholder="New board name..."
            className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-primary/30"
          />
          <button
            type="button"
            onClick={handleCreateBoard}
            disabled={creating || !newName.trim()}
            className="flex items-center justify-center h-7 w-7 rounded-md bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="p-2 border-t border-border">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

// ── Main Client ───────────────────────────────────────────────────

export function MetaAdDetailClient({ adId }: { adId: string }) {
  const router = useRouter()
  const [ad, setAd] = useState<AdDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mirroring, setMirroring] = useState(false)
  const [bookmarkOpen, setBookmarkOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const bookmarkRef = useRef<HTMLButtonElement>(null)
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

  useEffect(() => {
    if (!adId) return
    fetch(`/api/briefing-assistant/saved-items?source_item_id=${adId}`)
      .then((r) => r.json())
      .then((d) => setIsSaved((d.items?.length ?? 0) > 0))
      .catch(() => {})
  }, [adId])

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
    <div className="flex flex-col h-full">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/briefing-assistant/meta-ads"
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium text-muted-foreground">Ad Detail</span>
          <div className="flex-1" />
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
          <div className="relative">
            <Button
              ref={bookmarkRef}
              variant="outline"
              size="sm"
              className={cn('gap-1.5', isSaved && 'bg-primary/10 border-primary/30 text-primary')}
              onClick={() => setBookmarkOpen(!bookmarkOpen)}
            >
              {isSaved ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              {isSaved ? 'Saved' : 'Save'}
            </Button>
            <SaveToBoardPopover
              adId={ad.id}
              open={bookmarkOpen}
              onClose={() => setBookmarkOpen(false)}
              onSaved={() => setIsSaved(true)}
              anchorRef={bookmarkRef}
            />
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

      {/* ── 2-column body ───────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
        {/* Main column: metadata above creative */}
        <div className="overflow-y-auto scrollbar-subtle p-5 space-y-5">
          {/* Brand row */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-muted/60 text-muted-foreground text-xs font-bold flex-shrink-0">
              {ad.page_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground truncate">{ad.page_name}</p>
              <p className="text-[10px] text-muted-foreground">{ad.source_provider ?? 'Sponsored'}</p>
            </div>
          </div>

          {/* Status + dates */}
          <div className="flex items-center gap-2 flex-wrap">
            {ad.is_active ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600">
                Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Inactive
              </span>
            )}
            {ad.started_at && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                {formatDate(ad.started_at)}
                {ad.ended_at && ` – ${formatDate(ad.ended_at)}`}
              </span>
            )}
          </div>

          {/* Ad copy */}
          <AdCopyBlock text={ad.body_text} />

          {/* Tags + platform row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
              <span className="uppercase tracking-wider">{ad.platform}</span>
              <span>/</span>
              <span>{ad.media_type}</span>
            </div>
            {ad.content_style_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {ad.content_style_tags.map((tag) => (
                  <span key={tag} className="rounded bg-primary/8 text-primary/70 px-1.5 py-0.5 text-[9px] font-medium">
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Meta link */}
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

          {/* Creative */}
          <CreativeImage
            ad={ad}
            onDownload={handleMirrorDownload}
            downloading={mirroring}
          />

          {/* Landing page URL bar */}
          {ad.link_url && (
            <a
              href={ad.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors truncate"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{ad.link_url}</span>
            </a>
          )}
        </div>

        {/* Right column: metadata + scores */}
        <div className="border-l border-border overflow-y-auto scrollbar-subtle p-5 space-y-6 bg-card/40">
          {/* Ad Details */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" />
              Ad Details
            </h3>
            <dl className="space-y-2.5 text-xs">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Ad ID</dt>
                <dd className="text-foreground font-mono text-[10px] truncate max-w-[140px]">{ad.ad_id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Start date</dt>
                <dd className="text-foreground">{formatDate(ad.started_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">End date</dt>
                <dd className="text-foreground">{formatDate(ad.ended_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Running time</dt>
                <dd className="text-foreground">{computeRunningDays(ad.started_at, ad.ended_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Platforms</dt>
                <dd className="text-foreground">{ad.platform}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Display format</dt>
                <dd className="text-foreground capitalize">{ad.media_type}</dd>
              </div>
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

          {/* AI Scores */}
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

          {/* Analysis summary */}
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
        </div>
      </div>
    </div>
  )
}
