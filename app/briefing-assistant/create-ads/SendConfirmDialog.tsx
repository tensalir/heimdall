'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type SendSummary = {
  briefingName: string
  boardName: string
  assigneeLabel: string
  statusLabel: string
  sectionsFilled: string
  sourcesCount: number
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: SendSummary
  onConfirm: () => void | Promise<void>
  loading: boolean
}

export function SendConfirmDialog({ open, onOpenChange, summary, onConfirm, loading }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Monday?</DialogTitle>
          <DialogDescription>Review the briefing before it is created on the board.</DialogDescription>
        </DialogHeader>
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Briefing</dt>
            <dd className="max-w-[60%] text-right font-medium text-foreground">{summary.briefingName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Board</dt>
            <dd className="max-w-[60%] text-right font-medium text-foreground">{summary.boardName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Assigned to</dt>
            <dd className="max-w-[60%] text-right font-medium text-foreground">{summary.assigneeLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="max-w-[60%] text-right font-medium text-foreground">{summary.statusLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Sections</dt>
            <dd className="font-medium text-foreground">{summary.sectionsFilled}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Sources</dt>
            <dd className="font-medium text-foreground">{summary.sourcesCount} selected</dd>
          </div>
        </dl>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void onConfirm()} disabled={loading}>
            {loading ? 'Sending…' : 'Confirm & Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
