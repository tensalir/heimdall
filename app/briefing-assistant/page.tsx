'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ImageIcon,
  TrendingUp,
  MessageCircle,
  PaintbrushIcon,
  Workflow,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModuleCard {
  title: string
  description: string
  href: string
  icon: React.ElementType
  accent: string
}

const modules: ModuleCard[] = [
  {
    title: 'Meta Ads Library',
    description: 'Search and analyse competitor and brand ads from Meta with AI-powered scoring.',
    href: '/briefing-assistant/meta-ads',
    icon: ImageIcon,
    accent: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Trends',
    description: 'Track emerging creative trends and formats across platforms.',
    href: '/briefing-assistant/trends',
    icon: TrendingUp,
    accent: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  {
    title: 'Social Listening',
    description: 'Real Reddit conversations about hearing protection, noise sensitivity, and Loop — scored for authenticity.',
    href: '/briefing-assistant/social-comments',
    icon: MessageCircle,
    accent: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  {
    title: 'Create Ads',
    description: 'Three-panel workflow: pick a source, build a briefing, generate sacrificial assets.',
    href: '/briefing-assistant/create-ads',
    icon: PaintbrushIcon,
    accent: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Workflows',
    description: 'Automate research agents to mine trends and generate briefing inputs.',
    href: '/briefing-assistant/workflows',
    icon: Workflow,
    accent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  },
]

interface RecentActivity {
  id: string
  label: string
  module: string
  timestamp: string
}

export default function BriefingAssistantOverviewPage() {
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setRecentActivity([])
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <header>
        <div>
          <h1 className="text-[3.1rem] font-bold tracking-[0.36em] leading-none uppercase text-foreground">
            MIᛗIR
          </h1>
          <p className="text-[10px] font-semibold tracking-[0.35em] uppercase text-muted-foreground/60 mt-0.5">
            BRIEFING ASSISTANT
          </p>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Research, analyse, and create performance ads from a single workspace.
        </p>
      </header>

      <section>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modules.map((mod) => {
            const Icon = mod.icon
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={cn(
                  'group flex flex-col gap-3 rounded-xl border border-border bg-card p-5',
                  'hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg', mod.accent)}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{mod.title}</h2>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No recent activity yet. Start by exploring the Meta Ads Library or creating your first ad brief.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {recentActivity.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm"
              >
                <span className="text-foreground">{item.label}</span>
                <span className="text-xs text-muted-foreground">{item.module}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
