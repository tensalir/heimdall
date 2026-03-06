'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Loader2,
  ImageIcon,
  Sparkles,
  FileText,
  PaintbrushIcon,
  ChevronDown,
  ChevronRight,
  Send,
  RefreshCw,
  ExternalLink,
  Play,
  MessageCircle,
  TrendingUp,
  Workflow,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'

type SourceType = 'meta-ad' | 'trend' | 'social-comment' | 'workflow-output' | 'manual'

interface SourceItem {
  id: string
  type: SourceType
  title: string
  preview: string
  thumbnail_url?: string | null
  data: Record<string, unknown>
}

interface GeneratedAsset {
  id: string
  prompt: string
  image_url: string | null
  status: 'generating' | 'completed' | 'failed'
  model: string
  created_at: string
}

const SECTION_KEYS: (keyof WorkingDocSections)[] = [
  'idea', 'why', 'audience', 'product', 'visual', 'copyInfo', 'test', 'variants',
]
const SECTION_LABELS: Record<string, string> = {
  idea: 'Idea',
  why: 'Why',
  audience: 'Audience',
  product: 'Product',
  visual: 'Visual Direction',
  copyInfo: 'Copy & CTA',
  test: 'Test',
  variants: 'Variants',
}

const SOURCE_TYPE_CONFIG: Record<SourceType, { label: string; icon: React.ElementType }> = {
  'meta-ad': { label: 'Meta Ad', icon: ImageIcon },
  'trend': { label: 'Trend', icon: TrendingUp },
  'social-comment': { label: 'Social Comment', icon: MessageCircle },
  'workflow-output': { label: 'Workflow Output', icon: Workflow },
  'manual': { label: 'Manual Input', icon: FileText },
}

function SourcePanel({
  source,
  onSelect,
  loading,
}: {
  source: SourceItem | null
  onSelect: (source: SourceItem) => void
  loading: boolean
}) {
  const [recentSources, setRecentSources] = useState<SourceItem[]>([])
  const [sourcesLoading, setSourcesLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/briefing-assistant/source-items?limit=20')
        const data = await res.json()
        if (!cancelled) setRecentSources(data.items ?? [])
      } catch {
        if (!cancelled) setRecentSources([])
      } finally {
        if (!cancelled) setSourcesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (source) {
    const config = SOURCE_TYPE_CONFIG[source.type] ?? SOURCE_TYPE_CONFIG['manual']
    const Icon = config.icon
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Source Input
          </h3>
          <button
            type="button"
            onClick={() => onSelect(null as unknown as SourceItem)}
            className="text-[10px] text-primary hover:text-primary/80"
          >
            Change
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {source.thumbnail_url && (
            <div className="rounded-lg border border-border overflow-hidden">
              <img src={source.thumbnail_url} alt="" className="w-full aspect-[4/5] object-cover" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
              'bg-primary/10 text-primary',
            )}>
              <Icon className="h-3 w-3" />
              {config.label}
            </span>
          </div>
          <h4 className="text-sm font-semibold text-foreground">{source.title}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{source.preview}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Select Source
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {sourcesLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentSources.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              No source items available. Browse the Meta Ads Library or run a workflow first.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentSources.map((item) => {
              const config = SOURCE_TYPE_CONFIG[item.type] ?? SOURCE_TYPE_CONFIG['manual']
              const Icon = config.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="w-full text-left flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary/30 hover:bg-primary/[0.03] transition-all"
                >
                  {item.thumbnail_url ? (
                    <div className="w-10 h-10 rounded bg-muted/30 overflow-hidden flex-shrink-0">
                      <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded bg-muted/30 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{item.preview}</p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0" />
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function BriefingPanel({
  sections,
  onSectionChange,
  onGenerate,
  generating,
  hasSource,
}: {
  sections: WorkingDocSections
  onSectionChange: (key: keyof WorkingDocSections, value: string) => void
  onGenerate: () => void
  generating: boolean
  hasSource: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Briefing Template
        </h3>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 h-7 text-xs"
          onClick={onGenerate}
          disabled={generating || !hasSource}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          Auto-fill
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {SECTION_KEYS.map((key) => (
          <div key={key} className="space-y-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {SECTION_LABELS[key]}
            </label>
            <textarea
              value={sections[key] ?? ''}
              onChange={(e) => onSectionChange(key, e.target.value)}
              placeholder={`Enter ${SECTION_LABELS[key].toLowerCase()}...`}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30"
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function AssetsPanel({
  assets,
  onGenerate,
  generating,
  hasSource,
  hasBriefing,
}: {
  assets: GeneratedAsset[]
  onGenerate: () => void
  generating: boolean
  hasSource: boolean
  hasBriefing: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
          Sacrificial Assets
        </h3>
        <Button
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={onGenerate}
          disabled={generating || !hasSource || !hasBriefing}
        >
          {generating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PaintbrushIcon className="h-3 w-3" />
          )}
          Generate
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {assets.length === 0 ? (
          <div className="text-center py-16">
            <PaintbrushIcon className="h-8 w-8 text-muted-foreground/15 mx-auto mb-3" />
            <p className="text-xs text-muted-foreground">
              {!hasSource
                ? 'Select a source and fill the briefing to generate assets.'
                : !hasBriefing
                  ? 'Fill in the briefing template, then generate sacrificial assets.'
                  : 'Ready to generate. Click the button above.'}
            </p>
            <p className="text-[10px] text-muted-foreground/40 mt-2">
              Powered by Nano Banana via Vesper
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                {asset.status === 'generating' ? (
                  <div className="aspect-square flex items-center justify-center bg-muted/20">
                    <Loader2 className="h-6 w-6 animate-spin text-primary/40" />
                  </div>
                ) : asset.image_url ? (
                  <img src={asset.image_url} alt="" className="w-full aspect-square object-cover" />
                ) : (
                  <div className="aspect-square flex items-center justify-center bg-muted/20">
                    <ImageIcon className="h-6 w-6 text-muted-foreground/15" />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground truncate" title={asset.prompt}>
                    {asset.prompt}
                  </p>
                  <span className="text-[9px] text-muted-foreground/40">{asset.model}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CreateAdsContent() {
  const searchParams = useSearchParams()
  const [source, setSource] = useState<SourceItem | null>(null)
  const [sections, setSections] = useState<WorkingDocSections>({})
  const [assets, setAssets] = useState<GeneratedAsset[]>([])
  const [generatingBrief, setGeneratingBrief] = useState(false)
  const [generatingAssets, setGeneratingAssets] = useState(false)
  const [sourceLoading, setSourceLoading] = useState(false)

  useEffect(() => {
    const sourceType = searchParams.get('source')
    const sourceId = searchParams.get('sourceId')
    if (sourceType && sourceId) {
      setSourceLoading(true)
      ;(async () => {
        try {
          const res = await fetch(`/api/briefing-assistant/source-items/${sourceId}`)
          const data = await res.json()
          if (data.item) setSource(data.item)
        } catch { /* ignore */ }
        finally { setSourceLoading(false) }
      })()
    }
  }, [searchParams])

  const handleSectionChange = useCallback((key: keyof WorkingDocSections, value: string) => {
    setSections((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleGenerateBrief = useCallback(async () => {
    if (!source) return
    setGeneratingBrief(true)
    try {
      const res = await fetch('/api/briefing-assistant/generate-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefName: source.title,
          productOrUseCase: (source.data?.product as string) || source.title,
          format: (source.data?.media_type as string) || 'static',
          funnel: 'tof',
          agencyRef: '',
          assetCount: 4,
          sourceIds: ['ad_performance', 'social_comments', 'untapped_use_cases'],
        }),
      })
      const data = await res.json()
      if (data.sections) setSections(data.sections)
    } finally {
      setGeneratingBrief(false)
    }
  }, [source])

  const handleGenerateAssets = useCallback(async () => {
    if (!source) return
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
          source_item_id: source.id,
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
      setAssets((prev) =>
        prev.map((a) => (a.id === tempId ? { ...a, status: 'failed' } : a)),
      )
    } finally {
      setGeneratingAssets(false)
    }
  }, [source, sections])

  const hasBriefing = SECTION_KEYS.some((k) => (sections[k] ?? '').trim().length > 0)

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Create Ads</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Select a source, build a briefing, and generate sacrificial assets
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!hasBriefing}
              onClick={() => {/* TODO: send to Monday */}}
            >
              <Send className="h-3.5 w-3.5" />
              Send to Monday
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <div className="w-80 flex-shrink-0 border-r border-border bg-card/30 overflow-hidden">
          <SourcePanel
            source={source}
            onSelect={setSource}
            loading={sourceLoading}
          />
        </div>

        <div className="flex-1 border-r border-border overflow-hidden">
          <BriefingPanel
            sections={sections}
            onSectionChange={handleSectionChange}
            onGenerate={handleGenerateBrief}
            generating={generatingBrief}
            hasSource={!!source}
          />
        </div>

        <div className="w-80 flex-shrink-0 bg-card/30 overflow-hidden">
          <AssetsPanel
            assets={assets}
            onGenerate={handleGenerateAssets}
            generating={generatingAssets}
            hasSource={!!source}
            hasBriefing={hasBriefing}
          />
        </div>
      </div>
    </div>
  )
}

export default function CreateAdsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CreateAdsContent />
    </Suspense>
  )
}
