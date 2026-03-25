'use client'

import { useLayoutEffect, useRef, useState, useEffect } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import {
  SECTION_KEYS,
  SECTION_LABELS,
  SECTION_PLACEHOLDERS,
} from './createBriefingTypes'

function SectionTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={1}
      className={cn(
        'field-sizing-content w-full resize-none border-0 bg-transparent px-0 py-1 shadow-none',
        'text-[15px] font-normal leading-[1.75] text-foreground/70',
        'placeholder:text-muted-foreground/15',
        'outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none',
        'caret-primary/60',
      )}
    />
  )
}

export interface BriefingComposerProps {
  sections: WorkingDocSections
  onSectionChange: (key: keyof WorkingDocSections, value: string) => void
  onRegenerate: () => void
  generating: boolean
  hasSelectedSources: boolean
  /** Increment after successful AI fill to replay stagger animation */
  revealEpoch: number
}

export function BriefingComposer({
  sections,
  onSectionChange,
  onRegenerate,
  generating,
  hasSelectedSources,
  revealEpoch,
}: BriefingComposerProps) {
  const hasContent = SECTION_KEYS.some((k) => (sections[k] ?? '').trim().length > 0)
  const label = hasContent ? 'Regenerate' : 'Auto-fill'

  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const fn = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex-shrink-0 border-b border-border/50 px-8 py-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50">
            Creative brief
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={onRegenerate}
            disabled={generating || !hasSelectedSources}
          >
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            {label}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-subtle">
        <div className="mx-auto max-w-[640px] px-8 py-8">
          {!hasContent ? (
            <p className="mb-10 text-center text-sm leading-relaxed text-muted-foreground/25">
              Select sources and generate to fill this brief, or start typing in any section below.
            </p>
          ) : null}
          {SECTION_KEYS.map((key, idx) => {
            const name = SECTION_LABELS[key].toUpperCase()
            return (
              <div
                key={`${revealEpoch}-${key}`}
                className={cn(
                  'group/section',
                  idx > 0 && 'mt-10',
                  !reduceMotion &&
                    revealEpoch > 0 &&
                    'animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out',
                )}
                style={
                  !reduceMotion && revealEpoch > 0
                    ? {
                        animationDelay: `${idx * 60}ms`,
                        animationFillMode: 'forwards',
                      }
                    : undefined
                }
              >
                <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/50 transition-colors duration-150 group-focus-within/section:text-muted-foreground/80">
                  <span className="inline-block size-1 shrink-0 rotate-45 bg-current" aria-hidden />
                  {name}
                </span>
                <div className="mt-1">
                  <SectionTextarea
                    value={sections[key] ?? ''}
                    onChange={(v) => onSectionChange(key, v)}
                    placeholder={SECTION_PLACEHOLDERS[key]}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
