'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import { BriefingSourceRail } from './BriefingSourceRail'
import { BriefingComposer } from './BriefingComposer'
import { BriefingAssetsPanel } from './BriefingAssetsPanel'
import { SECTION_KEYS, type GeneratedAsset } from './createBriefingTypes'
import { SendToMondayDropdown, type MondayBoardOption } from './SendToMondayDropdown'
import { SendConfirmDialog, type SendSummary } from './SendConfirmDialog'

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

const DEBOUNCE_MS = 3000

export function CreateAdsClient({
  initialSource,
  initialSourceId,
  initialDraftId,
}: {
  initialSource: string | null
  initialSourceId: string | null
  initialDraftId: string | null
}) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sections, setSections] = useState<WorkingDocSections>({})
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [generatingAssets, setGeneratingAssets] = useState(false)
  const [revealEpoch, setRevealEpoch] = useState(0)

  const [draftId, setDraftId] = useState<string | null>(initialDraftId)
  const [draftsUnavailable, setDraftsUnavailable] = useState(false)
  const [saveUi, setSaveUi] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [hydratingDraft, setHydratingDraft] = useState(!!initialDraftId)

  const [boards, setBoards] = useState<MondayBoardOption[]>([])
  const [boardsLoading, setBoardsLoading] = useState(true)
  const [defaultBoardId, setDefaultBoardId] = useState<string | null>(null)

  const [mondayBoardId, setMondayBoardId] = useState<string | null>(null)
  const [mondayAssigneeId, setMondayAssigneeId] = useState<string | null>(null)
  const [mondayStatusKey, setMondayStatusKey] = useState<string | null>(null)

  const [briefingName, setBriefingName] = useState('Untitled briefing')

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const creatingDraftRef = useRef(false)
  const skipDebounceOnce = useRef(false)
  /** After hydrating a draft from URL, skip one selectedIds→title sync so we keep draft.name */
  const skipNextTitleFromSourcesRef = useRef(false)

  useEffect(() => {
    if (initialSource && initialSourceId) {
      setSelectedIds((prev) => (prev.includes(initialSourceId) ? prev : [...prev, initialSourceId]))
    }
  }, [initialSource, initialSourceId])

  /** Load draft from URL */
  useEffect(() => {
    if (!initialDraftId || !isUuid(initialDraftId)) {
      setHydratingDraft(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const res = await fetch(`/api/briefing-assistant/drafts/${initialDraftId}`)
      if (res.status === 401) {
        setDraftsUnavailable(true)
        setHydratingDraft(false)
        return
      }
      if (!res.ok) {
        setHydratingDraft(false)
        return
      }
      const data = (await res.json()) as {
        draft: {
          id: string
          name: string
          sections: WorkingDocSections
          source_item_ids: string[]
          monday_board_id: string | null
          monday_status: string | null
          monday_assignee: string | null
        }
        assets: GeneratedAsset[]
      }
      if (cancelled) return
      skipNextTitleFromSourcesRef.current = true
      setDraftId(data.draft.id)
      setBriefingName(data.draft.name || 'Untitled briefing')
      setSections(data.draft.sections ?? {})
      setSelectedIds(data.draft.source_item_ids ?? [])
      if (data.draft.monday_board_id) setMondayBoardId(data.draft.monday_board_id)
      if (data.draft.monday_assignee) setMondayAssigneeId(data.draft.monday_assignee)
      if (data.draft.monday_status) setMondayStatusKey(data.draft.monday_status)
      if (data.assets?.length) setAssets(data.assets)
      skipDebounceOnce.current = true
      setHydratingDraft(false)
    })()
    return () => {
      cancelled = true
    }
  }, [initialDraftId])

  /** Monday boards */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setBoardsLoading(true)
      const res = await fetch('/api/briefing-assistant/monday-boards')
      if (res.status === 401) {
        if (!cancelled) {
          setDraftsUnavailable(true)
          setBoardsLoading(false)
        }
        return
      }
      const data = (await res.json()) as {
        boards: MondayBoardOption[]
        default_board_id: string | null
      }
      if (cancelled) return
      setBoards(data.boards ?? [])
      setDefaultBoardId(data.default_board_id ?? null)
      setBoardsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Default board when boards load (don’t override loaded draft board) */
  useEffect(() => {
    if (hydratingDraft) return
    if (!boards.length || mondayBoardId) return
    const def = defaultBoardId
    const pick = def && boards.some((b) => b.id === def) ? def : boards[0].id
    setMondayBoardId(pick)
  }, [boards, defaultBoardId, mondayBoardId, hydratingDraft])

  const selectedBoard = useMemo(
    () => boards.find((b) => b.id === mondayBoardId) ?? null,
    [boards, mondayBoardId],
  )

  /** Default status column value when board changes (reuse key if still valid) */
  useEffect(() => {
    if (!selectedBoard?.status_columns?.[0]?.labels) {
      setMondayStatusKey(null)
      return
    }
    const labels = selectedBoard.status_columns[0].labels
    const keys = Object.keys(labels)
    setMondayStatusKey((current) => {
      if (current && keys.includes(current)) return current
      const draftEntry = Object.entries(labels).find(([, v]) => /draft/i.test(v))
      return draftEntry?.[0] ?? keys[0] ?? null
    })
  }, [selectedBoard?.id, selectedBoard?.status_columns])

  /** Briefing title from first source */
  useEffect(() => {
    if (skipNextTitleFromSourcesRef.current) {
      skipNextTitleFromSourcesRef.current = false
      return
    }
    if (selectedIds.length === 0) return
    let cancelled = false
    const firstId = selectedIds[0]
    ;(async () => {
      const res = await fetch(`/api/briefing-assistant/source-items/${firstId}`)
      const data = await res.json()
      if (cancelled || !data.item) return
      const item = data.item as { title: string }
      const title = item.title
      const next =
        selectedIds.length > 1 ? `${title} (+${selectedIds.length - 1})` : title
      setBriefingName(next)
    })()
    return () => {
      cancelled = true
    }
  }, [selectedIds])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const addSources = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }, [])

  const handleSectionChange = useCallback((key: keyof WorkingDocSections, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleGenerateBrief = useCallback(async () => {
    if (selectedIds.length === 0) return
    setGeneratingBrief(true)
    try {
      let briefName = 'Creative briefing'
      let productOrUseCase = ''
      let format = 'static'
      const firstId = selectedIds[0]
      if (firstId) {
        const itemRes = await fetch(`/api/briefing-assistant/source-items/${firstId}`)
        const itemData = await itemRes.json()
        if (itemData.item) {
          const item = itemData.item as {
            title: string
            data?: Record<string, unknown>
          }
          briefName =
            selectedIds.length > 1
              ? `${item.title} (+${selectedIds.length - 1})`
              : item.title
          productOrUseCase = (item.data?.product as string) || item.title
          format = (item.data?.media_type as string) || 'static'
        }
      }

      const res = await fetch('/api/briefing-assistant/generate-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefName,
          productOrUseCase,
          format,
          funnel: 'tof',
          agencyRef: '',
          assetCount: 4,
          sourceItemIds: selectedIds,
          sourceIds: ['ad_performance', 'social_comments'],
        }),
      })
      const data = await res.json()
      if (data.sections) {
        setSections(data.sections)
        setRevealEpoch((e) => e + 1)
      }
    } finally {
      setGeneratingBrief(false)
    }
  }, [selectedIds])

  const primarySourceId = selectedIds[0]

  const handleGenerateAssets = useCallback(async () => {
    if (!primarySourceId) return
    setGeneratingAssets(true)
    const tempId = `temp-${Date.now()}`
    setAssets((prev) => [
      ...prev,
      {
        id: tempId,
        prompt: sections.visual || sections.idea || 'Generate ad creative',
        image_url: null,
        status: 'generating',
        model: 'nano-banana-2',
        created_at: new Date().toISOString(),
      },
    ])
    try {
      const res = await fetch('/api/briefing-assistant/generate-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_item_id: primarySourceId,
          briefing_sections: sections,
          model: 'gemini-nano-banana-2',
        }),
      })
      const data = await res.json()
      setAssets((prev) =>
        prev.map((a) =>
          a.id === tempId
            ? {
                ...a,
                id: data.asset?.id ?? tempId,
                image_url: data.asset?.image_url ?? null,
                prompt: data.asset?.prompt ?? a.prompt,
                status: data.asset ? 'completed' : 'failed',
                created_at: data.asset?.created_at ?? a.created_at,
              }
            : a,
        ),
      )
    } catch {
      setAssets((prev) => prev.map((a) => (a.id === tempId ? { ...a, status: 'failed' } : a)))
    } finally {
      setGeneratingAssets(false)
    }
  }, [primarySourceId, sections])

  const hasBriefing = SECTION_KEYS.some((k) => (sections[k] ?? '').trim().length > 0)
  const filledCount = SECTION_KEYS.filter((k) => (sections[k] ?? '').trim().length > 0).length
  const nSources = selectedIds.length

  const readout = useMemo(
    () => `${nSources} SOURCES / ${filledCount} OF 8 SECTIONS`,
    [nSources, filledCount],
  )

  const meaningfulDraft = filledCount > 0 || nSources > 0 || assets.length > 0

  const persistKey = useMemo(
    () =>
      JSON.stringify({
        briefingName,
        sections,
        selectedIds,
        assetIds: assets.map((a) => a.id),
        mondayBoardId,
        mondayAssigneeId,
        mondayStatusKey,
      }),
    [
      assets,
      briefingName,
      mondayAssigneeId,
      mondayBoardId,
      mondayStatusKey,
      sections,
      selectedIds,
    ],
  )

  const persistPayload = useCallback(() => {
    const assetIds = assets.map((a) => a.id).filter(isUuid)
    return {
      name: briefingName,
      sections,
      source_item_ids: selectedIds,
      asset_ids: assetIds,
      monday_board_id: mondayBoardId,
      monday_status: mondayStatusKey,
      monday_assignee: mondayAssigneeId,
    }
  }, [
    assets,
    briefingName,
    mondayAssigneeId,
    mondayBoardId,
    mondayStatusKey,
    sections,
    selectedIds,
  ])

  const replaceDraftInUrl = useCallback(
    (id: string) => {
      const path =
        typeof window !== 'undefined'
          ? `${window.location.pathname}${window.location.search}`
          : '/briefing-assistant/create-ads'
      const u = new URL(path, 'http://local.invalid')
      u.searchParams.set('draft', id)
      const qs = u.searchParams.toString()
      router.replace(`${u.pathname}${qs ? `?${qs}` : ''}`)
    },
    [router],
  )

  const createDraft = useCallback(async (): Promise<string | null> => {
    if (draftsUnavailable || creatingDraftRef.current) return null
    if (!meaningfulDraft) return null
    creatingDraftRef.current = true
    setSaveUi('saving')
    try {
      const res = await fetch('/api/briefing-assistant/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(persistPayload()),
      })
      if (res.status === 401) {
        setDraftsUnavailable(true)
        setSaveUi('idle')
        return null
      }
      if (!res.ok) {
        setSaveUi('error')
        return null
      }
      const data = (await res.json()) as { draft: { id: string } }
      const id = data.draft?.id
      if (!id) {
        setSaveUi('error')
        return null
      }
      setDraftId(id)
      replaceDraftInUrl(id)
      setSaveUi('saved')
      return id
    } finally {
      creatingDraftRef.current = false
    }
  }, [draftsUnavailable, meaningfulDraft, persistPayload, replaceDraftInUrl])

  const patchDraft = useCallback(
    async (id: string) => {
      if (draftsUnavailable) return
      setSaveUi('saving')
      try {
        const res = await fetch(`/api/briefing-assistant/drafts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(persistPayload()),
        })
        if (res.status === 401) {
          setDraftsUnavailable(true)
          setSaveUi('idle')
          return
        }
        if (!res.ok) {
          setSaveUi('error')
          return
        }
        setSaveUi('saved')
      } catch {
        setSaveUi('error')
      }
    },
    [draftsUnavailable, persistPayload],
  )

  /** Create draft on first meaningful change */
  useEffect(() => {
    if (hydratingDraft || draftsUnavailable) return
    if (draftId) return
    if (!meaningfulDraft) return
    void createDraft()
  }, [createDraft, draftId, draftsUnavailable, hydratingDraft, meaningfulDraft])

  /** Debounced auto-save */
  useEffect(() => {
    if (hydratingDraft || draftsUnavailable || !draftId) return
    if (!meaningfulDraft) return
    if (skipDebounceOnce.current) {
      skipDebounceOnce.current = false
      return
    }
    const id = draftId
    const t = window.setTimeout(() => {
      void patchDraft(id)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(t)
  }, [draftId, draftsUnavailable, hydratingDraft, meaningfulDraft, patchDraft, persistKey])

  const handleSaveDraftClick = useCallback(async () => {
    if (draftsUnavailable) return
    skipDebounceOnce.current = true
    if (!draftId) {
      await createDraft()
      return
    }
    await patchDraft(draftId)
  }, [createDraft, draftId, draftsUnavailable, patchDraft])

  const saveIndicator = useMemo(() => {
    if (draftsUnavailable) return 'Sign in to save drafts'
    if (!draftId && !meaningfulDraft) return ''
    if (!draftId) return ''
    if (saveUi === 'saving') return 'Saving…'
    if (saveUi === 'saved') return 'Saved'
    if (saveUi === 'error') return 'Save failed'
    return 'Saved'
  }, [draftId, draftsUnavailable, meaningfulDraft, saveUi])

  const statusLabelForSummary = useMemo(() => {
    if (!selectedBoard?.status_columns?.[0] || mondayStatusKey == null) return 'Draft'
    return selectedBoard.status_columns[0].labels[mondayStatusKey] ?? 'Draft'
  }, [mondayStatusKey, selectedBoard])

  const assigneeLabelForSummary = useMemo(() => {
    if (!mondayAssigneeId) return 'Unassigned'
    const sub = selectedBoard?.subscribers.find((s) => s.id === mondayAssigneeId)
    return sub?.name ?? 'Unassigned'
  }, [mondayAssigneeId, selectedBoard])

  const sendSummary: SendSummary = useMemo(
    () => ({
      briefingName,
      boardName: selectedBoard?.name ?? '—',
      assigneeLabel: assigneeLabelForSummary,
      statusLabel: statusLabelForSummary,
      sectionsFilled: `${filledCount} of 8 sections`,
      sourcesCount: nSources,
    }),
    [
      assigneeLabelForSummary,
      briefingName,
      filledCount,
      nSources,
      selectedBoard?.name,
      statusLabelForSummary,
    ],
  )

  const handleSendClick = useCallback(() => {
    if (!hasBriefing || sent || !mondayBoardId) return
    setConfirmOpen(true)
  }, [hasBriefing, mondayBoardId, sent])

  const handleConfirmSend = useCallback(async () => {
    if (!mondayBoardId) return
    setSendLoading(true)
    try {
      let id = draftId
      if (!id && meaningfulDraft && !draftsUnavailable) {
        skipDebounceOnce.current = true
        id = await createDraft()
      }

      const peopleColId =
        selectedBoard?.default_people_column_id ?? selectedBoard?.people_columns?.[0]?.id ?? ''
      const statusColId =
        selectedBoard?.default_status_column_id ?? selectedBoard?.status_columns?.[0]?.id ?? ''

      const body: Record<string, unknown> = {
        experimentName: briefingName,
        batchCanonical: 'create-ads',
        batchRaw: null,
        sections,
        variants: [],
        status: 'draft',
        board_id: mondayBoardId,
        monday_people_column_id: peopleColId,
        monday_assignee_id: mondayAssigneeId ?? '',
        monday_status_column_id: statusColId,
        monday_status_index: mondayStatusKey ?? '',
      }

      const res = await fetch('/api/briefing-assistant/send-to-monday', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setSendLoading(false)
        return
      }
      const itemId = data.monday_item_id as string | undefined
      if (itemId && id && !draftsUnavailable) {
        skipDebounceOnce.current = true
        await fetch(`/api/briefing-assistant/drafts/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monday_item_id: itemId }),
        })
      }
      setSent(true)
      setConfirmOpen(false)
    } finally {
      setSendLoading(false)
    }
  }, [
    briefingName,
    createDraft,
    draftId,
    draftsUnavailable,
    meaningfulDraft,
    mondayAssigneeId,
    mondayBoardId,
    mondayStatusKey,
    sections,
    selectedBoard,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-start gap-3">
          <Link
            href="/briefing-assistant/briefings"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="Back to briefings"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold tracking-tight text-foreground">Create Briefing</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select sources, build a briefing, and generate sacrificial assets
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={draftsUnavailable || (!draftId && !meaningfulDraft)}
                onClick={() => void handleSaveDraftClick()}
              >
                Save Draft
              </Button>
              <SendToMondayDropdown
                boards={boards}
                boardsLoading={boardsLoading}
                boardId={mondayBoardId}
                onBoardIdChange={(id) => {
                  setMondayBoardId(id)
                  setMondayAssigneeId(null)
                }}
                assigneeId={mondayAssigneeId}
                onAssigneeIdChange={setMondayAssigneeId}
                statusKey={mondayStatusKey}
                onStatusKeyChange={setMondayStatusKey}
                onSendClick={handleSendClick}
                sendDisabled={!hasBriefing || !mondayBoardId}
                sent={sent}
              />
            </div>
            <div className="flex flex-col items-end gap-0.5">
              {saveIndicator ? (
                <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/90">
                  {saveIndicator}
                </span>
              ) : null}
              <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80">
                {readout}
              </span>
            </div>
          </div>
        </div>
      </header>

      <SendConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        summary={sendSummary}
        onConfirm={handleConfirmSend}
        loading={sendLoading}
      />

      <div className="flex min-h-0 flex-1">
        <div className="w-[380px] shrink-0 overflow-hidden border-r border-border bg-background">
          <BriefingSourceRail
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onAddSources={addSources}
            onGenerateBrief={handleGenerateBrief}
            generatingBrief={generatingBrief}
            initialSourceId={initialSourceId}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden border-r border-border bg-background">
          <BriefingComposer
            sections={sections}
            onSectionChange={handleSectionChange}
            onRegenerate={handleGenerateBrief}
            generating={generatingBrief}
            hasSelectedSources={nSources > 0}
            revealEpoch={revealEpoch}
          />
        </div>
        <div className="w-[360px] shrink-0 overflow-hidden bg-background">
          <BriefingAssetsPanel
            assets={assets}
            onGenerate={handleGenerateAssets}
            generating={generatingAssets}
            hasSelectedSources={nSources > 0}
            hasBriefing={hasBriefing}
          />
        </div>
      </div>
    </div>
  )
}
