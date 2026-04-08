'use client'

import { useMemo } from 'react'
import { CheckCircle, AlertCircle, MessageSquare, ChevronRight, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useResizableColumns, type ColumnDef } from '@/lib/hooks/use-resizable-columns'

// ── Types ────────────────────────────────────────────────────────

interface EnrichedComment {
  id: string
  orderNumber: number | null
  author: string
  authorAvatar: string
  message: string
  createdAt: string
  resolvedAt: string | null
  status: 'open' | 'resolved'
  threadDepth: number
  replyCount: number
  parentId: string | null
}

interface CommentLayer {
  nodeId: string | null
  nodeName: string
  thumbnailUrl: string | null
  comments: EnrichedComment[]
}

interface CommentTableProps {
  layers: CommentLayer[]
  selectedLayerNodeId: string | null
  onSelectLayer: (nodeId: string | null) => void
  thumbnails: Record<string, string>
  summaries: Record<string, string>
  thumbnailsLoading: boolean
  summariesLoading: boolean
}

// ── Helpers ──────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  const diffDays = Math.floor(diffHrs / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Column definitions ───────────────────────────────────────────

const COMMENT_COLUMN_DEFS: ColumnDef[] = [
  { key: 'layer', defaultWidth: 220, minWidth: 100, maxWidth: 500 },
  { key: 'author', defaultWidth: 140, minWidth: 80, maxWidth: 300 },
  { key: 'comment', defaultWidth: 440, minWidth: 150, maxWidth: 900 },
  { key: 'time', defaultWidth: 100, minWidth: 60, maxWidth: 200 },
  { key: 'status', defaultWidth: 100, minWidth: 60, maxWidth: 200 },
]

const COLUMN_LABELS = ['Layer', 'Author', 'Comment', 'Time', 'Status'] as const
const COLUMN_KEYS = ['layer', 'author', 'comment', 'time', 'status'] as const
const STORAGE_KEY = 'heimdall:comment-col-widths'

// ── CommentTable ─────────────────────────────────────────────────

export function CommentTable({
  layers,
  selectedLayerNodeId,
  onSelectLayer,
}: CommentTableProps) {
  const { widths, getHandleProps, isResizing } = useResizableColumns(COMMENT_COLUMN_DEFS, STORAGE_KEY)

  const colgroup = useMemo(() => (
    <colgroup>
      {COLUMN_KEYS.map((key) => (
        <col key={key} style={{ width: widths[key] }} />
      ))}
    </colgroup>
  ), [widths])

  if (layers.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center text-muted-foreground/40">
        <MessageSquare className="h-8 w-8 mb-2" />
        <p className="text-sm">No comments on this page</p>
      </div>
    )
  }

  const tableMinWidth = COMMENT_COLUMN_DEFS.reduce((s, c) => s + (c.minWidth ?? 60), 0)

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Column headers */}
      <div className="flex-shrink-0 pt-4">
        <table className={cn('w-full border-collapse table-fixed', isResizing && 'select-none')} style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <thead>
            <tr className="border-y border-border">
              {COLUMN_LABELS.map((label, i) => (
                <th
                  key={label}
                  className={cn(
                    'relative px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                    i < COLUMN_LABELS.length - 1 && 'border-r border-border/50'
                  )}
                >
                  {label}
                  <div {...getHandleProps(COLUMN_KEYS[i])} />
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-auto">
        <table className={cn('w-full border-collapse table-fixed', isResizing && 'select-none')} style={{ minWidth: tableMinWidth }}>
          {colgroup}
          <tbody>
            {layers.map((layer) => (
              <LayerGroup
                key={layer.nodeId ?? '__canvas__'}
                layer={layer}
                isSelected={selectedLayerNodeId === (layer.nodeId ?? '__canvas__')}
                onSelect={() => onSelectLayer(layer.nodeId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Layer Group ──────────────────────────────────────────────────

interface LayerGroupProps {
  layer: CommentLayer
  isSelected: boolean
  onSelect: () => void
}

function LayerGroup({ layer, isSelected, onSelect }: LayerGroupProps) {
  const openCount = layer.comments.filter((c) => c.status === 'open').length
  const resolvedCount = layer.comments.filter((c) => c.status === 'resolved').length

  return (
    <>
      <tr
        onClick={onSelect}
        className={cn(
          'cursor-pointer transition-colors border-b border-border/40',
          isSelected
            ? 'bg-primary/8 hover:bg-primary/10'
            : 'bg-muted/20 hover:bg-muted/30'
        )}
      >
        <td colSpan={5} className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <ChevronRight
              className={cn(
                'h-4 w-4 text-muted-foreground/50 transition-transform flex-shrink-0',
                isSelected && 'rotate-90 text-primary/70'
              )}
            />
            <Layers className="h-4 w-4 text-muted-foreground/40 flex-shrink-0" />
            <span className={cn(
              'text-sm font-medium truncate',
              isSelected ? 'text-primary' : 'text-foreground'
            )}>
              {layer.nodeName}
            </span>
            <span className="text-xs text-muted-foreground/50 flex-shrink-0">
              {layer.comments.length} comment{layer.comments.length !== 1 ? 's' : ''}
            </span>
            {openCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-blue-400/60 flex-shrink-0">
                <AlertCircle className="h-3 w-3" />
                {openCount}
              </span>
            )}
            {resolvedCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-emerald-400/60 flex-shrink-0">
                <CheckCircle className="h-3 w-3" />
                {resolvedCount}
              </span>
            )}
          </div>
        </td>
      </tr>

      {layer.comments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} />
      ))}
    </>
  )
}

// ── Comment Row ──────────────────────────────────────────────────

function CommentRow({ comment }: { comment: EnrichedComment }) {
  const isReply = comment.threadDepth > 0

  return (
    <tr className={cn(
      'group border-b border-border/20 hover:bg-muted/10 transition-colors',
      isReply && 'bg-muted/5'
    )}>
      <td className="px-3 py-2 text-xs text-muted-foreground/30 border-r border-border/20 align-top">
        {isReply && (
          <span className="inline-block ml-4 text-muted-foreground/20">&larr; reply</span>
        )}
        {!isReply && comment.orderNumber && (
          <span className="font-mono text-muted-foreground/40">#{comment.orderNumber}</span>
        )}
      </td>

      <td className="px-3 py-2 border-r border-border/20 align-top">
        <div className="flex items-center gap-1.5 min-w-0">
          {comment.authorAvatar && (
            <img
              src={comment.authorAvatar}
              alt=""
              className="w-4 h-4 rounded-full flex-shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-xs font-medium text-foreground/80 truncate">
            {comment.author}
          </span>
        </div>
      </td>

      <td className="px-3 py-2 border-r border-border/20 align-top">
        <span className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap block">
          {comment.message}
        </span>
      </td>

      <td className="px-3 py-2 border-r border-border/20 align-top">
        <span className="text-[11px] text-muted-foreground/50 whitespace-nowrap" title={comment.createdAt}>
          {formatRelativeTime(comment.createdAt)}
        </span>
      </td>

      <td className="px-3 py-2 align-top">
        {comment.status === 'resolved' ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400/70 font-medium">
            <CheckCircle className="h-3 w-3" />
            Resolved
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] text-blue-400/60 font-medium">
            <AlertCircle className="h-3 w-3" />
            Open
          </span>
        )}
      </td>
    </tr>
  )
}
