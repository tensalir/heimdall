'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  ImageIcon,
  TrendingUp,
  MessageCircle,
  Workflow,
  PaintbrushIcon,
  ArrowLeft,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ElementType
}

interface NavSection {
  heading: string
  items: NavItem[]
}

const topItems: NavItem[] = [
  { label: 'Create Ads', href: '/briefing-assistant/create-ads', icon: PaintbrushIcon },
  { label: 'Workflows', href: '/briefing-assistant/workflows', icon: Workflow },
]

const sections: NavSection[] = [
  {
    heading: 'Data Sources',
    items: [
      { label: 'Meta Ads Library', href: '/briefing-assistant/meta-ads', icon: ImageIcon },
      { label: 'Trends', href: '/briefing-assistant/trends', icon: TrendingUp },
      { label: 'Social Comments', href: '/briefing-assistant/social-comments', icon: MessageCircle },
    ],
  },
]

export function BriefingSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 flex-shrink-0 border-r border-border bg-card flex flex-col h-full">
      <div className="px-5 pt-5 pb-3">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/50 hover:text-muted-foreground transition-colors mb-3"
        >
          <ArrowLeft className="h-3 w-3" />
          Heimdall
        </Link>
        <Link href="/briefing-assistant" className="block group">
          <span className={cn(
            'block text-xl font-bold tracking-[0.2em] uppercase transition-colors',
            pathname === '/briefing-assistant'
              ? 'text-primary'
              : 'text-foreground group-hover:text-primary',
          )}>
            MIMIR
          </span>
          <span className="block text-[9px] font-semibold tracking-[0.35em] uppercase text-muted-foreground/60">
            BRIEFING ASSISTANT
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-subtle px-3 pb-4 space-y-5">
        <ul className="space-y-0.5">
          {topItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>

        {sections.map((section) => (
          <div key={section.heading}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              {section.heading}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <p className="text-[10px] text-muted-foreground/40 font-medium tracking-wide">
          Powered by Heimdall
        </p>
      </div>
    </aside>
  )
}
