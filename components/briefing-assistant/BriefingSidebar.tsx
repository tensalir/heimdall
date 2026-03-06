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
  LayoutDashboard,
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

const sections: NavSection[] = [
  {
    heading: 'Data Sources',
    items: [
      { label: 'Meta Ads Library', href: '/briefing-assistant/meta-ads', icon: ImageIcon },
      { label: 'Trends', href: '/briefing-assistant/trends', icon: TrendingUp },
      { label: 'Social Comments', href: '/briefing-assistant/social-comments', icon: MessageCircle },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { label: 'Create Ads', href: '/briefing-assistant/create-ads', icon: PaintbrushIcon },
      { label: 'Workflows', href: '/briefing-assistant/workflows', icon: Workflow },
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
        <Link href="/briefing-assistant" className="block">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            Briefing Assistant
          </h1>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        <Link
          href="/briefing-assistant"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
            pathname === '/briefing-assistant'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
          )}
        >
          <LayoutDashboard className="h-4 w-4" />
          Overview
        </Link>

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
