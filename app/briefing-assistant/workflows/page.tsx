'use client'

import { useState } from 'react'
import {
  Workflow,
  Loader2,
  Play,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useApi } from '@/lib/use-api'

type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  type: 'trend_mining' | 'angle_discovery' | 'report_synthesis'
}

export interface WorkflowRun {
  id: string
  workflow_id: string
  workflow_name: string
  status: WorkflowStatus
  started_at: string
  completed_at: string | null
  output_count: number
  error: string | null
}

const WORKFLOW_TEMPLATES: WorkflowDefinition[] = [
  {
    id: 'trend-mining',
    name: 'Trend Mining',
    description: 'Scrape and analyse emerging creative trends across Meta, TikTok, and social platforms.',
    type: 'trend_mining',
  },
  {
    id: 'angle-discovery',
    name: 'Cross-Source Angle Discovery',
    description: 'Research across all connected data sets to generate new creative angles.',
    type: 'angle_discovery',
  },
  {
    id: 'report-synthesis',
    name: 'Briefing Input Report',
    description: 'Synthesise a comprehensive report from ads, trends, and comments for briefing creation.',
    type: 'report_synthesis',
  },
]

function StatusIcon({ status }: { status: WorkflowStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'failed':
      return <AlertCircle className="h-4 w-4 text-red-500" />
    default:
      return <Clock className="h-4 w-4 text-muted-foreground/40" />
  }
}

export default function WorkflowsPage() {
  const { data, loading, refetch } = useApi<{ runs: WorkflowRun[] }>(
    '/api/briefing-assistant/workflows',
  )
  const runs = data?.runs ?? []
  const [starting, setStarting] = useState<string | null>(null)

  async function startWorkflow(workflowId: string) {
    setStarting(workflowId)
    try {
      const res = await fetch('/api/briefing-assistant/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId }),
      })
      if (res.ok) await refetch()
    } finally {
      setStarting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <h1 className="text-lg font-bold tracking-tight text-foreground">Workflows</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Automate AI agents that research, scrape trends, and generate briefing inputs
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 max-w-4xl">
        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Available Workflows</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((wf) => (
              <div
                key={wf.id}
                className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">{wf.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed flex-1">
                  {wf.description}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 self-start"
                  onClick={() => startWorkflow(wf.id)}
                  disabled={starting === wf.id}
                >
                  {starting === wf.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-3">Recent Runs</h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : runs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No workflow runs yet. Start one above to begin generating briefing inputs.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3"
                >
                  <StatusIcon status={run.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{run.workflow_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(run.started_at).toLocaleString()}
                      {run.output_count > 0 && ` · ${run.output_count} output${run.output_count !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                  <span className={cn(
                    'text-[10px] font-semibold rounded-md px-2 py-0.5',
                    run.status === 'completed' && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
                    run.status === 'running' && 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
                    run.status === 'failed' && 'bg-red-500/15 text-red-600 dark:text-red-400',
                    run.status === 'idle' && 'bg-muted/40 text-muted-foreground',
                  )}>
                    {run.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
