'use client'

import { useRef, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Bookmark,
  BookmarkCheck,
  PaintbrushIcon,
  Plus,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────

interface Board {
  id: string
  name: string
}

// ── Rail Section ──────────────────────────────────────────────────

export function RailSection({
  icon,
  title,
  children,
}: {
  icon?: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-3 flex items-center gap-1.5">
        {icon}
        {title}
      </h3>
      {children}
    </div>
  )
}

// ── Save to Board Popover ─────────────────────────────────────────

function SaveToBoardPopover({
  itemId,
  open,
  onClose,
  onSaved,
  anchorRef,
}: {
  itemId: string
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
        body: JSON.stringify({ source_item_id: itemId, board_id: selectedBoard }),
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

// ── Save hook ─────────────────────────────────────────────────────

export function useSaveItem(itemId: string) {
  const [bookmarkOpen, setBookmarkOpen] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const bookmarkRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!itemId) return
    fetch(`/api/briefing-assistant/saved-items?source_item_id=${itemId}`)
      .then((r) => r.json())
      .then((d) => setIsSaved((d.items?.length ?? 0) > 0))
      .catch(() => {})
  }, [itemId])

  return { bookmarkOpen, setBookmarkOpen, isSaved, setIsSaved, bookmarkRef }
}

// ── Skeleton ──────────────────────────────────────────────────────

export function DetailSkeleton() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-muted/40" />
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="h-4 w-2/3 rounded bg-muted/40" />
            <div className="h-3 w-1/3 rounded bg-muted/30" />
          </div>
          <div className="h-8 w-16 rounded-md bg-muted/30" />
          <div className="h-8 w-16 rounded-md bg-muted/30" />
        </div>
      </header>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px] overflow-hidden">
        <div className="overflow-y-auto p-5 space-y-5">
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-muted/30" />
            <div className="h-3 w-5/6 rounded bg-muted/30" />
            <div className="h-3 w-4/6 rounded bg-muted/30" />
          </div>
        </div>
        <div className="border-l border-border overflow-y-auto p-5 space-y-5">
          <div className="rounded-lg bg-muted/20 aspect-[4/5]" />
        </div>
        <div className="border-l border-border p-5 space-y-6 bg-card/40">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 rounded bg-muted/30" />
              <div className="h-3 w-full rounded bg-muted/20" />
              <div className="h-3 w-3/4 rounded bg-muted/20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Detail Shell ──────────────────────────────────────────────────

export function DetailShell({
  backHref,
  title,
  subtitle,
  actions,
  left,
  center,
  right,
  itemId,
  sourceType,
}: {
  backHref: string
  title: string
  subtitle?: React.ReactNode
  actions?: React.ReactNode
  left: React.ReactNode
  center?: React.ReactNode
  right: React.ReactNode
  itemId: string
  sourceType: 'meta-ad' | 'trend' | 'social-comment'
}) {
  const router = useRouter()
  const { bookmarkOpen, setBookmarkOpen, isSaved, setIsSaved, bookmarkRef } = useSaveItem(itemId)

  const hasCenter = !!center

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-3">
        <div className="flex items-center gap-3">
          <Link
            href={backHref}
            className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-foreground truncate">
              {title}
            </h1>
            {subtitle && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {subtitle}
              </div>
            )}
          </div>

          {actions}

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
              itemId={itemId}
              open={bookmarkOpen}
              onClose={() => setBookmarkOpen(false)}
              onSaved={() => setIsSaved(true)}
              anchorRef={bookmarkRef}
            />
          </div>

          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => router.push(`/briefing-assistant/create-ads?source=${sourceType}&sourceId=${itemId}`)}
          >
            <PaintbrushIcon className="h-3.5 w-3.5" />
            Create
          </Button>
        </div>
      </header>

      <div className={cn(
        'flex-1 grid grid-cols-1 overflow-hidden',
        hasCenter
          ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]'
          : 'lg:grid-cols-[1fr_320px]',
      )}>
        <div className="overflow-y-auto scrollbar-subtle p-5 space-y-5 max-w-prose">
          {left}
        </div>
        {hasCenter && (
          <div className="overflow-y-auto scrollbar-subtle p-5 space-y-5 border-l border-border">
            {center}
          </div>
        )}
        <div className="border-l border-border overflow-y-auto scrollbar-subtle p-5 space-y-6 bg-card/40">
          {right}
        </div>
      </div>
    </div>
  )
}
