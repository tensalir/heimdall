'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ImageIcon,
  TrendingUp,
  MessageCircle,
  FileText,
  Workflow,
  ArrowRight,
  Loader2,
  BarChart3,
  Lightbulb,
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
    title: 'Briefings',
    description: 'View, create, and track creative briefings. Access learnings from prior briefs.',
    href: '/briefing-assistant/briefings',
    icon: FileText,
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

const datasources: ModuleCard[] = [
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
]

const loopData: ModuleCard[] = [
  {
    title: 'Loop Ads',
    description: 'First-party ad performance data from Loop Earplugs campaigns.',
    href: '/briefing-assistant/loop-data/ads',
    icon: BarChart3,
    accent: 'bg-[hsl(142,71%,36%)]/10 text-[hsl(142,71%,36%)]',
  },
  {
    title: 'Strategic Insights',
    description: 'Customer insights, social comments, reviews, and synthesized signals from Loop first-party data.',
    href: '/briefing-assistant/loop-data/strategic-insights',
    icon: Lightbulb,
    accent: 'bg-[hsl(142,71%,36%)]/10 text-[hsl(142,71%,36%)]',
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
          Research, analyse, and create creative briefings from a single workspace.
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
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
          Data Sources
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {datasources.map((mod) => {
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
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-[hsl(142,71%,36%)]/60">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(142,71%,36%)] mr-1.5 align-middle" />
          Loop Data
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {loopData.map((mod) => {
            const Icon = mod.icon
            return (
              <Link
                key={mod.href}
                href={mod.href}
                className={cn(
                  'group flex flex-col gap-3 rounded-xl border border-border bg-card p-5',
                  'hover:border-[hsl(142,71%,36%)]/30 hover:shadow-lg hover:shadow-[hsl(142,71%,36%)]/5 transition-all duration-200',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className={cn('flex items-center justify-center w-9 h-9 rounded-lg', mod.accent)}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-[hsl(142,71%,36%)] transition-colors" />
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
              No recent activity yet. Start by exploring the data sources or creating your first briefing.
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
