'use client'

import { useState, useEffect } from 'react'
import { Loader2, MessageSquare, Lightbulb, BarChart3, Sparkles, ChevronDown, FileText, BookOpen } from 'lucide-react'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { UI_DATASOURCE_IDS, DATASOURCE_CONFIG } from '@/src/domain/briefingAssistant/datasources'
const PRODUCTS = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'engage', label: 'Engage' },
  { id: 'experience', label: 'Experience' },
  { id: 'dream', label: 'Dream' },
] as const

const ICON_MAP = { MessageSquare, Lightbulb, BarChart3, FileText, BookOpen } as const

/** Datasource options for the generator (canonical IDs + labels from shared config). */
const DATASOURCES = UI_DATASOURCE_IDS.map((id) => {
  const config = DATASOURCE_CONFIG[id]
  const Icon = ICON_MAP[config.icon]
  return { id, label: config.label, icon: Icon }
})

export interface BriefingGeneratorPanelProps {
  onGenerate?: (product: string, datasources: string[]) => void | Promise<void>
  /** When true, render as trigger button + dropdown instead of inline toggles. */
  collapsed?: boolean
  /** Controlled open state when collapsed (parent controls popover). */
  open?: boolean
  /** Called when dropdown open state should change (e.g. trigger click or close). */
  onOpenChange?: (open: boolean) => void
}

function GeneratorFormContent({
  product,
  setProduct,
  selectedDatasources,
  setSelectedDatasources,
  isLoading,
  onGenerate,
  onSuccess,
  vertical,
}: {
  product: string
  setProduct: (v: string) => void
  selectedDatasources: string[]
  setSelectedDatasources: (v: string[]) => void
  isLoading: boolean
  onGenerate?: (product: string, datasources: string[]) => void | Promise<void>
  onSuccess?: () => void
  vertical?: boolean
}) {
  const handleGenerate = async () => {
    if (!product.trim() || selectedDatasources.length === 0) return
    if (!onGenerate) return
    const prev = { product, selectedDatasources }
    await onGenerate(prev.product, prev.selectedDatasources)
    onSuccess?.()
  }

  const canGenerate = product && selectedDatasources.length > 0

  if (vertical) {
    return (
      <div className="flex flex-col gap-4 p-4 min-w-[280px]">
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Product
          </span>
          <ToggleGroup
            type="single"
            size="sm"
            value={product || undefined}
            onValueChange={(v) => setProduct(v ?? '')}
            disabled={isLoading}
            className="justify-start flex-wrap"
          >
            {PRODUCTS.map((p) => (
              <ToggleGroupItem key={p.id} value={p.id} aria-label={`Select product: ${p.label}`}>
                {p.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sources
          </span>
          <ToggleGroup
            type="multiple"
            size="sm"
            variant="outline"
            value={selectedDatasources}
            onValueChange={setSelectedDatasources}
            disabled={isLoading}
            className="justify-start flex-wrap"
          >
            {DATASOURCES.map((ds) => {
              const Icon = ds.icon
              return (
                <ToggleGroupItem
                  key={ds.id}
                  value={ds.id}
                  aria-label={`Toggle data source: ${ds.label}`}
                  className="gap-1"
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {ds.label}
                </ToggleGroupItem>
              )
            })}
          </ToggleGroup>
        </div>
        <Button
          size="sm"
          onClick={handleGenerate}
          disabled={!canGenerate || isLoading}
          aria-label="Generate angles"
          className="w-full"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
          )}
          Generate
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
          Sources
        </span>
        <ToggleGroup
          type="multiple"
          size="sm"
          variant="outline"
          value={selectedDatasources}
          onValueChange={setSelectedDatasources}
          disabled={isLoading}
          className="justify-start gap-1.5"
        >
          {DATASOURCES.map((ds) => {
            const Icon = ds.icon
            return (
              <ToggleGroupItem
                key={ds.id}
                value={ds.id}
                aria-label={`Toggle data source: ${ds.label}`}
                className="gap-1.5 data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:border-primary/30"
              >
                <Icon className="h-3 w-3 shrink-0" />
                {ds.label}
              </ToggleGroupItem>
            )
          })}
        </ToggleGroup>
      </div>
      <div className="flex items-center gap-2 rounded-md border border-border/40 px-2.5 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 shrink-0">
          Product
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          value={product || undefined}
          onValueChange={(v) => setProduct(v ?? '')}
          disabled={isLoading}
          className="justify-start gap-1.5"
        >
          {PRODUCTS.map((p) => (
            <ToggleGroupItem
              key={p.id}
              value={p.id}
              aria-label={`Select product: ${p.label}`}
              className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary data-[state=on]:border-primary/30"
            >
              {p.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Button
        size="sm"
        onClick={handleGenerate}
        disabled={!canGenerate || isLoading}
        aria-label="Generate angles"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
        ) : (
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
        )}
        Generate
      </Button>
    </div>
  )
}

export function BriefingGeneratorPanel({
  onGenerate,
  collapsed = false,
  open = false,
  onOpenChange,
}: BriefingGeneratorPanelProps) {
  const [product, setProduct] = useState('')
  const [selectedDatasources, setSelectedDatasources] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const handleGenerateCall = async (p: string, ds: string[]) => {
    setIsLoading(true)
    try {
      await onGenerate?.(p, ds)
      onOpenChange?.(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!open && collapsed) {
      setProduct('')
      setSelectedDatasources([])
    }
  }, [open, collapsed])

  if (collapsed) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => onOpenChange?.(!open)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 min-h-[40px]"
        >
          <Sparkles className="h-4 w-4" />
          Generate
          <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div
            className="absolute top-full left-0 mt-2 z-50 rounded-lg border border-border bg-card shadow-lg animate-in zoom-in-95 fade-in-0 duration-150"
            role="dialog"
            aria-label="Generate angles"
          >
            <GeneratorFormContent
              product={product}
              setProduct={setProduct}
              selectedDatasources={selectedDatasources}
              setSelectedDatasources={setSelectedDatasources}
              isLoading={isLoading}
              onGenerate={handleGenerateCall}
              onSuccess={() => onOpenChange?.(false)}
              vertical
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <GeneratorFormContent
      product={product}
      setProduct={setProduct}
      selectedDatasources={selectedDatasources}
      setSelectedDatasources={setSelectedDatasources}
      isLoading={isLoading}
      onGenerate={async (p, ds) => {
        setIsLoading(true)
        try {
          await onGenerate?.(p, ds)
        } finally {
          setIsLoading(false)
        }
      }}
      vertical={false}
    />
  )
}
