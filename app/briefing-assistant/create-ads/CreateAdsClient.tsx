'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import { BriefingSourceRail } from './BriefingSourceRail'
import { BriefingComposer } from './BriefingComposer'
import { BriefingAssetsPanel } from './BriefingAssetsPanel'
import { SECTION_KEYS, type GeneratedAsset } from './createBriefingTypes'

export function CreateAdsClient({
  initialSource,
  initialSourceId,
}: {
  initialSource: string | null
  initialSourceId: string | null
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sections, setSections] = useState<WorkingDocSections>({})
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [generatingAssets, setGeneratingAssets] = useState(false)
  const [revealEpoch, setRevealEpoch] = useState(0)

  useEffect(() => {
    if (initialSource && initialSourceId) {
      setSelectedIds((prev) => (prev.includes(initialSourceId) ? prev : [...prev, initialSourceId]))
    }
  }, [initialSource, initialSourceId])

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
          sourceIds: ['ad_performance', 'social_comments', 'untapped_use_cases'],
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
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!hasBriefing}>
              <Send className="size-3.5" />
              Send to Monday
            </Button>
            <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground/80">
              {readout}
            </span>
          </div>
        </div>
      </header>

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
