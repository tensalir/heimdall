'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText,
  Loader2,
  Plus,
  ArrowRight,
  Lightbulb,
  Calendar,
  LayoutGrid,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type TabId = 'overview' | 'learnings'

interface SprintBatch {
  batch_key: string
  batch_label: string
  batch_type: string
  monday_board_id: string | null
  figma_file_key: string | null
}

interface SprintSummary {
  id: string
  name: string
  created_at: string
  updated_at: string
  batch_count: number
  assignment_count: number
  batches: SprintBatch[]
}

function OverviewTab() {
  const [sprints, setSprints] = useState<SprintSummary[]>([])
  const [loading, setLoading] = useState(true)

  const fetchSprints = useCallback(async () => {
    try {
      const res = await fetch('/api/briefing-assistant/sprints')
      const data = await res.json()
      setSprints(data.sprints ?? [])
    } catch {
      setSprints([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSprints()
  }, [fetchSprints])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/15 mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">No briefings yet</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm">
          Create your first briefing to start building a library of creative strategies and learnings.
        </p>
        <Link href="/briefing-assistant/create-ads">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create Briefing
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {sprints.map((sprint) => {
        const batchLabels = sprint.batches.map((b) => b.batch_label).join(', ')
        return (
          <Link
            key={sprint.id}
            href={`/briefing-assistant/briefings/${sprint.id}`}
            className={cn(
              'group flex flex-col gap-3 rounded-xl border border-border bg-card p-5',
              'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200',
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground truncate">{sprint.name}</h3>
              {batchLabels && (
                <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{batchLabels}</p>
              )}
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
              <span className="flex items-center gap-1">
                <LayoutGrid className="h-3 w-3" />
                {sprint.assignment_count} brief{sprint.assignment_count !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {new Date(sprint.updated_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

interface SectionAgg {
  section: string
  count: number
  samples: string[]
}

interface ProductAgg {
  product: string
  briefCount: number
  sections: SectionAgg[]
}

const SECTION_LABELS: Record<string, string> = {
  idea: 'Idea',
  why: 'Why / Rationale',
  audience: 'Audience',
  product: 'Product',
  visual: 'Visual Direction',
  copyInfo: 'Copy & CTA',
  test: 'Test / Hypothesis',
  variants: 'Variants',
}

function LearningsTab() {
  const [products, setProducts] = useState<ProductAgg[]>([])
  const [totalBriefs, setTotalBriefs] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/briefing-assistant/learnings')
        const data = await res.json()
        setProducts(data.products ?? [])
        setTotalBriefs(data.totalBriefs ?? 0)
      } catch {
        setProducts([])
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Sparkles className="h-10 w-10 text-muted-foreground/15 mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">No learnings yet</p>
        <p className="text-xs text-muted-foreground max-w-md">
          Recurring themes, winning patterns, and reusable hooks from prior briefings will appear here
          once briefings are created. This surface is powered by the prior-briefings retrieval layer.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <FileText className="h-3 w-3" />
          {totalBriefs} briefing{totalBriefs !== 1 ? 's' : ''} analysed
        </span>
        <span className="flex items-center gap-1">
          <Lightbulb className="h-3 w-3" />
          {products.length} product area{products.length !== 1 ? 's' : ''}
        </span>
      </div>

      {products.map((p) => {
        const isExpanded = expandedProduct === p.product
        return (
          <div key={p.product} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              type="button"
              onClick={() => setExpandedProduct(isExpanded ? null : p.product)}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/20 transition-colors"
            >
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                <Lightbulb className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">{p.product}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.briefCount} brief{p.briefCount !== 1 ? 's' : ''} &middot; {p.sections.length} section{p.sections.length !== 1 ? 's' : ''} covered
                </p>
              </div>
              <svg
                className={cn('h-4 w-4 text-muted-foreground/50 transition-transform', isExpanded && 'rotate-180')}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {isExpanded && (
              <div className="border-t border-border px-5 py-4 space-y-4">
                {p.sections.map((s) => (
                  <div key={s.section}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                        {SECTION_LABELS[s.section] ?? s.section}
                      </span>
                      <span className="text-[10px] text-muted-foreground/40">
                        ({s.count} occurrence{s.count !== 1 ? 's' : ''})
                      </span>
                    </div>
                    <ul className="space-y-1.5">
                      {s.samples.map((sample, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-border"
                        >
                          {sample}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function BriefingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Briefings</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Creative briefings created in Mimir
          </p>
        </div>
        <Link href="/briefing-assistant/create-ads">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create Briefing
          </Button>
        </Link>
      </header>

      <div className="flex items-center gap-1 border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'overview'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Overview
          </span>
          {activeTab === 'overview' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('learnings')}
          className={cn(
            'px-4 py-2.5 text-sm font-medium transition-colors relative',
            activeTab === 'learnings'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <span className="flex items-center gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Learnings
          </span>
          {activeTab === 'learnings' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      </div>

      {activeTab === 'overview' ? <OverviewTab /> : <LearningsTab />}
    </div>
  )
}
