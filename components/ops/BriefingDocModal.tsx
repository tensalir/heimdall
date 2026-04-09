'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink, FileText, Loader2, AlertCircle, Sparkles, Send, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ───────────────────────────────────────────────────────────────────

interface DocSection {
  heading: string
  body: string
}

interface DocResponse {
  item_name: string
  doc_id: string | null
  doc_content: string | null
  columns: Record<string, string>
}

interface FeedbackDocResponse {
  item_name: string
  feedback_doc_id: string | null
  feedback_doc_content: string | null
  parsed_feedback: Record<string, Record<string, string>>
  review: {
    generated_summary: string | null
    contradiction_note: string | null
    summary_draft: string | null
    synced_to_monday: boolean
    synced_at: string | null
  } | null
}

interface BriefingDocModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mondayItemId: string | null
  mondayBoardId: string | null
  itemName?: string
}

type Tab = 'briefing' | 'feedback'

// ── In-memory cache ─────────────────────────────────────────────────────────

const briefingCache = new Map<string, DocResponse>()
const feedbackCache = new Map<string, FeedbackDocResponse>()

function cacheKey(itemId: string, boardId: string | null) {
  return `${boardId ?? ''}:${itemId}`
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

// ── Modal ───────────────────────────────────────────────────────────────────

export function BriefingDocModal({
  open,
  onOpenChange,
  mondayItemId,
  mondayBoardId,
  itemName,
}: BriefingDocModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('briefing')

  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [briefData, setBriefData] = useState<DocResponse | null>(null)

  const [fbLoading, setFbLoading] = useState(false)
  const [fbError, setFbError] = useState<string | null>(null)
  const [fbData, setFbData] = useState<FeedbackDocResponse | null>(null)
  const [summaryDraft, setSummaryDraft] = useState('')
  const [summarizing, setSummarizing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncDone, setSyncDone] = useState(false)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fbFetchedRef = useRef<string | null>(null)

  const fetchBriefing = useCallback(async () => {
    if (!mondayItemId) return
    const key = cacheKey(mondayItemId, mondayBoardId)

    const cached = briefingCache.get(key)
    if (cached) {
      setBriefData(cached)
    }

    setBriefLoading(!cached)
    setBriefError(null)
    try {
      const params = new URLSearchParams({ item_id: mondayItemId })
      if (mondayBoardId) params.set('board_id', mondayBoardId)
      const res = await fetch(`/api/ops/monday-doc?${params}`)
      const json = await res.json()
      if (!res.ok) {
        if (!cached) setBriefError(json.error ?? `Failed (${res.status})`)
        return
      }
      briefingCache.set(key, json)
      setBriefData(json)
    } catch {
      if (!cached) setBriefError('Network error — could not reach server')
    } finally {
      setBriefLoading(false)
    }
  }, [mondayItemId, mondayBoardId])

  const fetchFeedback = useCallback(async () => {
    if (!mondayItemId) return
    const key = cacheKey(mondayItemId, mondayBoardId)

    const cached = feedbackCache.get(key)
    if (cached) {
      setFbData(cached)
      const draft = cached.review?.summary_draft ?? cached.review?.generated_summary ?? ''
      setSummaryDraft(draft)
      setSyncDone(cached.review?.synced_to_monday ?? false)
    }

    setFbLoading(!cached)
    setFbError(null)
    try {
      const params = new URLSearchParams({ item_id: mondayItemId })
      if (mondayBoardId) params.set('board_id', mondayBoardId)
      const res = await fetch(`/api/ops/feedback-doc?${params}`)
      const json = await res.json()
      if (!res.ok) {
        if (!cached) setFbError(json.error ?? `Failed (${res.status})`)
        return
      }
      feedbackCache.set(key, json)
      setFbData(json)
      const draft = json.review?.summary_draft ?? json.review?.generated_summary ?? ''
      setSummaryDraft(draft)
      setSyncDone(json.review?.synced_to_monday ?? false)
    } catch {
      if (!cached) setFbError('Network error — could not reach server')
    } finally {
      setFbLoading(false)
    }
  }, [mondayItemId, mondayBoardId])

  // On open: immediately fetch briefing; defer feedback until tab clicked
  useEffect(() => {
    if (open && mondayItemId) {
      setActiveTab('briefing')
      setSyncDone(false)
      fbFetchedRef.current = null
      fetchBriefing()
    }
  }, [open, mondayItemId, fetchBriefing])

  // Lazy-load feedback on first tab switch
  useEffect(() => {
    if (activeTab === 'feedback' && mondayItemId) {
      const key = cacheKey(mondayItemId, mondayBoardId)
      if (fbFetchedRef.current !== key) {
        fbFetchedRef.current = key
        fetchFeedback()
      }
    }
  }, [activeTab, mondayItemId, mondayBoardId, fetchFeedback])

  const saveDraft = useCallback(async (draft: string) => {
    if (!mondayItemId || !mondayBoardId) return
    await fetch('/api/ops/feedback-draft', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: mondayItemId, board_id: mondayBoardId, draft }),
    }).catch(() => {})
  }, [mondayItemId, mondayBoardId])

  const handleDraftChange = (value: string) => {
    setSummaryDraft(value)
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    draftTimerRef.current = setTimeout(() => saveDraft(value), 1500)
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && summaryDraft) {
      saveDraft(summaryDraft)
    }
    onOpenChange(nextOpen)
  }

  const handleGenerateSummary = async () => {
    if (!mondayItemId || !mondayBoardId) return
    setSummarizing(true)
    try {
      const res = await fetch('/api/ops/feedback-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: mondayItemId, board_id: mondayBoardId }),
      })
      const json = await res.json()
      if (res.ok && json.summary) {
        setSummaryDraft(json.summary)
        if (json.contradiction_note) {
          setFbData(prev => prev ? { ...prev, review: { ...prev.review!, contradiction_note: json.contradiction_note } } : prev)
        }
      }
    } finally {
      setSummarizing(false)
    }
  }

  const handleSyncToMonday = async () => {
    if (!mondayItemId || !mondayBoardId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/ops/feedback-sync-monday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: mondayItemId,
          board_id: mondayBoardId,
          summary: summaryDraft,
        }),
      })
      if (res.ok) {
        setSyncDone(true)
      }
    } finally {
      setSyncing(false)
    }
  }

  const sections = briefData?.doc_content ? parseDocSections(briefData.doc_content) : []
  const mondayUrl =
    mondayBoardId && mondayItemId
      ? `https://loopearplugs.monday.com/boards/${mondayBoardId}/pulses/${mondayItemId}`
      : null

  const metaBadges: { label: string; value: string }[] = []
  if (briefData?.columns) {
    const c = briefData.columns
    if (c.batch || c.batch_canonical) metaBadges.push({ label: 'Batch', value: c.batch ?? c.batch_canonical ?? '' })
    if (c.section || c.section_name) metaBadges.push({ label: 'Section', value: c.section ?? c.section_name ?? '' })
    if (c.status) metaBadges.push({ label: 'Status', value: c.status })
    if (c.creative_partner || c.agency || c.creative_team) {
      metaBadges.push({ label: 'Partner', value: c.creative_partner ?? c.agency ?? c.creative_team ?? '' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold leading-snug truncate">
                {briefData?.item_name ?? itemName ?? 'Briefing'}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-2 text-xs">
                <FileText className="h-3 w-3 flex-shrink-0" />
                Monday Doc preview
                {briefData?.doc_id && (
                  <span className="text-muted-foreground/60">#{briefData.doc_id}</span>
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

          <div className="flex gap-0 mt-3 -mb-3 border-b-0">
            <button
              className={cn(
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                activeTab === 'briefing'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('briefing')}
            >
              Briefing
            </button>
            <button
              className={cn(
                'px-4 py-2 text-xs font-medium border-b-2 transition-colors',
                activeTab === 'feedback'
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('feedback')}
            >
              Feedback
            </button>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          {activeTab === 'briefing' && (
            <BriefingTab
              loading={briefLoading}
              error={briefError}
              data={briefData}
              sections={sections}
            />
          )}
          {activeTab === 'feedback' && (
            <FeedbackTab
              loading={fbLoading}
              error={fbError}
              data={fbData}
              summaryDraft={summaryDraft}
              onDraftChange={handleDraftChange}
              summarizing={summarizing}
              onGenerateSummary={handleGenerateSummary}
              syncing={syncing}
              syncDone={syncDone}
              onSyncToMonday={handleSyncToMonday}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Briefing Tab ────────────────────────────────────────────────────────────

function BriefingTab({
  loading,
  error,
  data,
  sections,
}: {
  loading: boolean
  error: string | null
  data: DocResponse | null
  sections: DocSection[]
}) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Fetching briefing from Monday...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle className="h-5 w-5 text-destructive/70" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (data && !data.doc_content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <div>
          <p className="text-sm text-muted-foreground">No briefing doc found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            This item may not have a briefing document attached yet.
          </p>
        </div>
      </div>
    )
  }

  if (sections.length > 0) {
    return (
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
    )
  }

  return null
}

// ── Feedback Tab ────────────────────────────────────────────────────────────

interface EditableRow {
  variation: string
  feedback: string
}

interface EditableVersion {
  label: string
  rows: EditableRow[]
}

function parseFeedbackTableFromSections(sections: DocSection[]): EditableVersion[] {
  const versions: EditableVersion[] = []

  for (const section of sections) {
    if (!section.body) continue

    if (section.body.includes('|') && section.body.includes('---')) {
      const rows = section.body
        .split('\n')
        .filter((l) => l.trim().startsWith('|'))
        .map((l) =>
          l.split('|').slice(1, -1).map((c) => c.trim())
        )

      const dataRows = rows.filter(
        (_, i) => i > 0 && !rows[i]?.every((c) => /^-+$/.test(c))
      )

      if (dataRows.length > 0) {
        versions.push({
          label: section.heading || `Version ${versions.length + 1}`,
          rows: dataRows.map(r => ({
            variation: r[0] ?? '',
            feedback: r.slice(1).join(' ').trim(),
          })),
        })
      }
    }
  }

  return versions
}

function EditableFeedbackTable({
  versions,
  onChange,
}: {
  versions: EditableVersion[]
  onChange: (updated: EditableVersion[]) => void
}) {
  const handleCellChange = (vIdx: number, rIdx: number, value: string) => {
    const next = versions.map((v, vi) => {
      if (vi !== vIdx) return v
      return {
        ...v,
        rows: v.rows.map((r, ri) =>
          ri === rIdx ? { ...r, feedback: value } : r
        ),
      }
    })
    onChange(next)
  }

  return (
    <div className="space-y-4">
      {versions.map((version, vIdx) => (
        <div key={vIdx} className="rounded-lg border border-border/50 bg-card overflow-hidden">
          {version.label && (
            <div className="px-3 py-2 bg-muted/30 border-b border-border/40">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {version.label}
              </h3>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-border/60 w-16">Var</th>
                  <th className="text-left px-3 py-2 font-semibold text-muted-foreground border-b border-border/60">Feedback</th>
                </tr>
              </thead>
              <tbody>
                {version.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-b border-border/30 last:border-0">
                    <td className="px-3 py-1.5 text-foreground/70 font-medium align-top w-16">
                      {row.variation}
                    </td>
                    <td className="px-1 py-1">
                      <textarea
                        className="w-full bg-transparent border-0 px-2 py-1 text-[12px] text-foreground/90 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-primary/30 rounded min-h-[28px]"
                        value={row.feedback}
                        rows={Math.max(1, Math.ceil(row.feedback.length / 60))}
                        onChange={(e) => handleCellChange(vIdx, rIdx, e.target.value)}
                        placeholder="Enter feedback..."
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

function FeedbackTab({
  loading,
  error,
  data,
  summaryDraft,
  onDraftChange,
  summarizing,
  onGenerateSummary,
  syncing,
  syncDone,
  onSyncToMonday,
}: {
  loading: boolean
  error: string | null
  data: FeedbackDocResponse | null
  summaryDraft: string
  onDraftChange: (value: string) => void
  summarizing: boolean
  onGenerateSummary: () => void
  syncing: boolean
  syncDone: boolean
  onSyncToMonday: () => void
}) {
  const feedbackSections = data?.feedback_doc_content ? parseDocSections(data.feedback_doc_content) : []
  const [editableVersions, setEditableVersions] = useState<EditableVersion[]>([])
  const initializedRef = useRef(false)

  useEffect(() => {
    if (feedbackSections.length > 0 && !initializedRef.current) {
      const parsed = parseFeedbackTableFromSections(feedbackSections)
      if (parsed.length > 0) {
        setEditableVersions(parsed)
        initializedRef.current = true
      }
    }
  }, [feedbackSections])

  // Reset when data changes (new item)
  useEffect(() => {
    initializedRef.current = false
    setEditableVersions([])
  }, [data?.feedback_doc_id])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Fetching feedback from Monday...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <AlertCircle className="h-5 w-5 text-destructive/70" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (data && !data.feedback_doc_content) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
        <div>
          <p className="text-sm text-muted-foreground">No feedback doc found</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            This item may not have a feedback document attached yet.
          </p>
        </div>
      </div>
    )
  }

  const contradictionNote = data?.review?.contradiction_note
  const hasEditableTable = editableVersions.length > 0
  const nonTableSections = feedbackSections.filter(s => {
    if (!s.body) return false
    return !(s.body.includes('|') && s.body.includes('---'))
  })

  return (
    <div className="space-y-5">
      {/* Editable feedback table */}
      {hasEditableTable && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Feedback Document
          </h3>
          <EditableFeedbackTable
            versions={editableVersions}
            onChange={setEditableVersions}
          />
        </div>
      )}

      {/* Non-table sections from feedback doc */}
      {nonTableSections.length > 0 && (
        <div className="space-y-3">
          {!hasEditableTable && (
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Feedback Document
            </h3>
          )}
          {nonTableSections.map((section, i) => (
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

      {/* Summary section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Summarized Feedback
          </h3>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={onGenerateSummary}
            disabled={summarizing}
          >
            {summarizing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {summaryDraft ? 'Regenerate' : 'Generate Summary'}
          </Button>
        </div>

        {contradictionNote && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            <span className="font-medium">Note:</span> {contradictionNote}
          </div>
        )}

        {summarizing ? (
          <div className="flex items-center gap-3 py-6 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating summary with Claude...</p>
          </div>
        ) : (
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-[13px] leading-relaxed min-h-[120px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
            placeholder="Summary will appear here after generation. You can edit it before syncing to Monday."
            value={summaryDraft}
            onChange={(e) => onDraftChange(e.target.value)}
          />
        )}
      </div>

      {/* Sync to Monday */}
      <div className="pt-2 border-t border-border/50">
        {syncDone ? (
          <div className="flex items-center gap-2 justify-center py-3">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
              Synced to Monday
            </p>
          </div>
        ) : (
          <Button
            className="w-full gap-2"
            size="lg"
            onClick={onSyncToMonday}
            disabled={syncing || !summaryDraft.trim()}
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Sync to Monday
          </Button>
        )}
      </div>
    </div>
  )
}
