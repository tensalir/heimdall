'use client'

import { Check, ImageIcon, Loader2, PaintbrushIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { GeneratedAsset } from './createBriefingTypes'

function StepRow({
  step,
  label,
  state,
}: {
  step: number
  label: string
  state: 'pending' | 'done' | 'active'
}) {
  return (
    <div className="flex items-start gap-2 text-left">
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center font-mono text-[10px] font-normal uppercase tracking-wide',
          state === 'done' && 'text-primary',
          state === 'active' && 'text-foreground',
          state === 'pending' && 'text-muted-foreground/40',
        )}
      >
        {state === 'done' ? <Check className="size-3.5 text-primary" strokeWidth={2.5} /> : step}
      </span>
      <span
        className={cn(
          'text-[11px] font-mono font-normal uppercase tracking-wide',
          state === 'done' && 'text-primary',
          state === 'active' && 'text-foreground',
          state === 'pending' && 'text-muted-foreground/40',
        )}
      >
        {label}
      </span>
    </div>
  )
}

function AssetCardHoverFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="group relative overflow-hidden border border-border/40 bg-card">
      <span
        className="pointer-events-none absolute left-0 top-0 z-10 h-3 w-3 border-l border-t border-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 motion-reduce:transition-none"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute right-0 top-0 z-10 h-3 w-3 border-r border-t border-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 motion-reduce:transition-none"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute bottom-0 left-0 z-10 h-3 w-3 border-b border-l border-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 motion-reduce:transition-none"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute bottom-0 right-0 z-10 h-3 w-3 border-b border-r border-primary opacity-0 transition-opacity duration-100 group-hover:opacity-100 motion-reduce:transition-none"
        aria-hidden
      />
      {children}
    </div>
  )
}

export interface BriefingAssetsPanelProps {
  assets: GeneratedAsset[]
  onGenerate: () => void
  generating: boolean
  hasSelectedSources: boolean
  hasBriefing: boolean
}

export function BriefingAssetsPanel({
  assets,
  onGenerate,
  generating,
  hasSelectedSources,
  hasBriefing,
}: BriefingAssetsPanelProps) {
  const step1State: 'pending' | 'active' | 'done' = hasSelectedSources ? 'done' : 'active'
  const step2State: 'pending' | 'active' | 'done' = !hasSelectedSources
    ? 'pending'
    : hasBriefing
      ? 'done'
      : 'active'
  const step3State: 'pending' | 'active' | 'done' = !hasBriefing
    ? 'pending'
    : assets.length > 0
      ? 'done'
      : 'active'

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Sacrificial assets
        </h3>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs active:scale-[0.98] motion-reduce:active:scale-100"
          onClick={onGenerate}
          disabled={generating || !hasSelectedSources || !hasBriefing}
        >
          {generating ? <Loader2 className="size-3 animate-spin" /> : <PaintbrushIcon className="size-3" />}
          Generate
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle p-4">
        {assets.length === 0 ? (
          <div className="flex flex-col gap-4 py-6">
            <PaintbrushIcon className="mx-auto size-8 text-muted-foreground/20" />
            <div className="mx-auto flex max-w-[220px] flex-col gap-3">
              <StepRow step={1} label="Select sources" state={step1State} />
              <StepRow step={2} label="Generate brief" state={step2State} />
              <StepRow step={3} label="Generate assets" state={step3State} />
            </div>
            <p className="text-center text-[10px] text-muted-foreground/50">Powered by Nano Banana via Vesper</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {assets.map((asset) => (
              <AssetCardHoverFrame key={asset.id}>
                {asset.status === 'generating' ? (
                  <div className="flex aspect-square items-center justify-center bg-muted/20">
                    <Loader2 className="size-6 animate-spin text-primary/40" />
                  </div>
                ) : asset.image_url ? (
                  <img src={asset.image_url} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center bg-muted/20">
                    <ImageIcon className="size-6 text-muted-foreground/15" />
                  </div>
                )}
                <div className="px-2 py-1.5">
                  <p className="truncate font-mono text-[10px] text-muted-foreground" title={asset.prompt}>
                    {asset.prompt}
                  </p>
                  <span className="text-[9px] text-muted-foreground/40">{asset.model}</span>
                </div>
              </AssetCardHoverFrame>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
