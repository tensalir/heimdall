'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, FileText, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DocSection {
  heading: string
  body: string
}

function parseDocSections(markdown: string): DocSection[] {
  const lines = markdown.split('\n')
  const sections: DocSection[] = []
  let currentHeading = ''
  let currentLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading || currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentLines.join('\n').trim(),
        })
      }
      currentHeading = line.slice(3).trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  if (currentHeading || currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentLines.join('\n').trim(),
    })
  }

  return sections
}

function renderBody(text: string) {
  if (!text) return null

  if (text.includes('|') && text.includes('---')) {
    const rows = text
      .split('\n')
      .filter((l) => l.trim().startsWith('|'))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
      )

    const headerRow = rows[0]
    const dataRows = rows.filter(
      (_, i) => i > 0 && !rows[i]?.every((c) => /^-+$/.test(c))
    )

    if (headerRow && dataRows.length > 0) {
      return (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px] border-collapse">
            <thead>
              <tr>
                {headerRow.map((cell, i) => (
                  <th
                    key={i}
                    className="text-left px-2 py-1.5 font-semibold text-muted-foreground border-b border-border/60 whitespace-nowrap"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, ri) => (
                <tr key={ri} className="border-b border-border/30 last:border-0">
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-2 py-1.5 text-foreground/90 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
  }

  return (
    <div className="text-[13px] text-foreground/90 leading-relaxed whitespace-pre-wrap">
      {text}
    </div>
  )
}

interface BriefingDocModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mondayItemId: string | null
  mondayBoardId: string | null
  itemName?: string
}

interface DocResponse {
  item_name: string
  doc_id: string | null
  doc_content: string | null
  columns: Record<string, string>
}

export function BriefingDocModal({
  open,
  onOpenChange,
  mondayItemId,
  mondayBoardId,
  itemName,
}: BriefingDocModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DocResponse | null>(null)

  const fetchDoc = useCallback(async () => {
    if (!mondayItemId) return
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const params = new URLSearchParams({ item_id: mondayItemId })
      if (mondayBoardId) params.set('board_id', mondayBoardId)
      const res = await fetch(`/api/ops/monday-doc?${params}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`)
        return
      }
      setData(json)
    } catch {
      setError('Network error — could not reach server')
    } finally {
      setLoading(false)
    }
  }, [mondayItemId, mondayBoardId])

  useEffect(() => {
    if (open && mondayItemId) fetchDoc()
  }, [open, mondayItemId, fetchDoc])

  const sections = data?.doc_content ? parseDocSections(data.doc_content) : []
  const mondayUrl =
    mondayBoardId && mondayItemId
      ? `https://loopearplugs.monday.com/boards/${mondayBoardId}/pulses/${mondayItemId}`
      : null

  const metaBadges: { label: string; value: string }[] = []
  if (data?.columns) {
    const c = data.columns
    if (c.batch || c.batch_canonical) metaBadges.push({ label: 'Batch', value: c.batch ?? c.batch_canonical ?? '' })
    if (c.section || c.section_name) metaBadges.push({ label: 'Section', value: c.section ?? c.section_name ?? '' })
    if (c.status) metaBadges.push({ label: 'Status', value: c.status })
    if (c.creative_partner || c.agency || c.creative_team) {
      metaBadges.push({ label: 'Partner', value: c.creative_partner ?? c.agency ?? c.creative_team ?? '' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold leading-snug truncate">
                {data?.item_name ?? itemName ?? 'Briefing'}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 text-xs">
                <FileText className="h-3 w-3 flex-shrink-0" />
                Monday Doc preview
                {data?.doc_id && (
                  <span className="text-muted-foreground/60">#{data.doc_id}</span>
                )}
              </DialogDescription>
            </div>
            {mondayUrl && (
              <a
                href={mondayUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Monday
              </a>
            )}
          </div>

          {metaBadges.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {metaBadges.map((b) => (
                <Badge
                  key={b.label}
                  variant="outline"
                  className="text-[10px] font-medium px-1.5 py-0 bg-muted/30 text-muted-foreground border-border/40"
                >
                  {b.label}: {b.value}
                </Badge>
              ))}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Fetching briefing from Monday...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle className="h-5 w-5 text-destructive/70" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {!loading && !error && data && !data.doc_content && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
              <div>
                <p className="text-sm text-muted-foreground">No briefing doc found</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  This item may not have a briefing document attached yet.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && sections.length > 0 && (
            <div className="space-y-4">
              {sections.map((section, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-lg border border-border/50 bg-card',
                    section.heading && 'overflow-hidden'
                  )}
                >
                  {section.heading && (
                    <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
                      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.heading}
                      </h3>
                    </div>
                  )}
                  {section.body && (
                    <div className="px-3 py-2.5">
                      {renderBody(section.body)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
