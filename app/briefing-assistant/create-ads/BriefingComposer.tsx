'use client'

import { useLayoutEffect, useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, Sparkles, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'
import {
  SECTION_KEYS,
  SECTION_LABELS,
  SECTION_PLACEHOLDERS,
  FORMAT_OPTIONS,
  LOOP_PRODUCTS,
  type LoopProduct,
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
        'field-sizing-content w-full resize-none whitespace-pre-line border-0 bg-transparent px-0 py-1 shadow-none',
        'text-[15px] font-normal leading-relaxed text-foreground/80',
        'placeholder:text-muted-foreground/30',
        'outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none',
        'caret-primary/60',
      )}
    />
  )
}

function ProductCard({ product }: { product: LoopProduct | null }) {
  if (!product) return null
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="size-10 shrink-0 overflow-hidden rounded-md bg-background">
        <img
          src={product.imageUrl}
          alt={product.name}
          className="size-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{product.name}</p>
        <p className="text-xs text-muted-foreground">{product.tagline}</p>
      </div>
    </div>
  )
}

function FormatsCheckboxes({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const checked = useMemo(() => {
    const set = new Set<string>()
    for (const line of (value ?? '').split('\n')) {
      const match = line.match(/\[x\]\s*(.+)/i) ?? line.match(/^-?\s*(.+)/)
      if (match) {
        const id = FORMAT_OPTIONS.find((f) => f.label === match[1].trim())?.id
        if (id) set.add(id)
      }
    }
    return set
  }, [value])

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(checked)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      const lines = FORMAT_OPTIONS.filter((f) => next.has(f.id)).map((f) => `[x] ${f.label}`)
      const unchecked = FORMAT_OPTIONS.filter((f) => !next.has(f.id)).map((f) => `[ ] ${f.label}`)
      onChange([...lines, ...unchecked].join('\n'))
    },
    [checked, onChange],
  )

  return (
    <div className="mt-2 space-y-1.5">
      {FORMAT_OPTIONS.map((fmt) => {
        const isChecked = checked.has(fmt.id)
        return (
          <label
            key={fmt.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 transition-colors hover:bg-muted/40"
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded border transition-colors',
                isChecked
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background',
              )}
            >
              {isChecked && <Check className="size-3.5" />}
            </span>
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => toggle(fmt.id)}
              className="sr-only"
            />
            <span className="text-sm text-foreground/80">{fmt.label}</span>
          </label>
        )
      })}
    </div>
  )
}

export interface BriefingComposerProps {
  sections: WorkingDocSections
  onSectionChange: (key: keyof WorkingDocSections, value: string) => void
  onRegenerate: () => void
  generating: boolean
  hasSelectedSources: boolean
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

  const resolvedProduct = useMemo(() => {
    const raw = (sections.product ?? '').toLowerCase().trim()
    if (!raw) return null
    return (
      LOOP_PRODUCTS.find(
        (p) =>
          raw.includes(p.slug) ||
          raw.includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(raw),
      ) ?? null
    )
  }, [sections.product])

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
            const name = SECTION_LABELS[key]
            const isFormats = key === 'formats'
            const isProduct = key === 'product'

            return (
              <div
                key={`${revealEpoch}-${key}`}
                className={cn(
                  'group/section',
                  idx > 0 && 'mt-8',
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
                <span
                  className={cn(
                    'inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.06em]',
                    'text-primary/80 transition-colors duration-150 group-focus-within/section:text-primary',
                  )}
                >
                  <span className="inline-block size-1.5 shrink-0 rotate-45 bg-primary/60" aria-hidden />
                  {name}
                </span>

                <div className="mt-1.5">
                  {isFormats ? (
                    <FormatsCheckboxes
                      value={sections.formats ?? ''}
                      onChange={(v) => onSectionChange('formats', v)}
                    />
                  ) : (
                    <SectionTextarea
                      value={sections[key] ?? ''}
                      onChange={(v) => onSectionChange(key, v)}
                      placeholder={SECTION_PLACEHOLDERS[key]}
                    />
                  )}
                </div>

                {isProduct && resolvedProduct && (
                  <ProductCard product={resolvedProduct} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
