'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

interface RegisterBoardDialogProps {
  onRegistered: () => void
}

export function RegisterBoardDialog({ onRegistered }: RegisterBoardDialogProps) {
  const [open, setOpen] = useState(false)
  const [mondayBoardId, setMondayBoardId] = useState('')
  const [boardName, setBoardName] = useState('')
  const [figmaProjectId, setFigmaProjectId] = useState('')
  const [figmaProjectName, setFigmaProjectName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!mondayBoardId.trim() || !boardName.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/ops/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mondayBoardId: mondayBoardId.trim(),
          boardName: boardName.trim(),
          figmaProjectId: figmaProjectId.trim() || null,
          figmaProjectName: figmaProjectName.trim() || null,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? `Failed (${res.status})`)
        return
      }

      setMondayBoardId('')
      setBoardName('')
      setFigmaProjectId('')
      setFigmaProjectName('')
      setOpen(false)
      onRegistered()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          Register Board
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register Monday Board</DialogTitle>
          <DialogDescription>
            Track a Monday board and map it to a Figma project for briefing sync.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label htmlFor="reg-board-id" className="text-sm font-medium">
              Monday Board ID <span className="text-destructive">*</span>
            </label>
            <input
              id="reg-board-id"
              type="text"
              inputMode="numeric"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. 18404406006"
              value={mondayBoardId}
              onChange={(e) => setMondayBoardId(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reg-board-name" className="text-sm font-medium">
              Display Name <span className="text-destructive">*</span>
            </label>
            <input
              id="reg-board-name"
              type="text"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Performance Ads"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="reg-figma-project" className="text-sm font-medium">
              Figma Project ID
            </label>
            <input
              id="reg-figma-project"
              type="text"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. 387033831"
              value={figmaProjectId}
              onChange={(e) => setFigmaProjectId(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              From the Figma project URL: figma.com/files/.../project/<strong>ID</strong>
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="reg-figma-name" className="text-sm font-medium">
              Figma Project Name
            </label>
            <input
              id="reg-figma-name"
              type="text"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="e.g. Performance Ads"
              value={figmaProjectName}
              onChange={(e) => setFigmaProjectName(e.target.value)}
            />
          </div>

          {error && (
            <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !mondayBoardId.trim() || !boardName.trim()}>
              {submitting ? 'Registering...' : 'Register'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
