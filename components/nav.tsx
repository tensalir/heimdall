'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Network, Settings, Puzzle, MessageSquare, LayoutGrid, ScrollText, LogOut, TrendingUp, Kanban, Inbox } from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth'

interface NavItem {
  name: string
  href: string
  icon: React.ElementType
  external?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: 'Platform',
    items: [
      { name: 'Connections', href: '/admin', icon: Network },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
  {
    label: 'Operations',
    items: [
      { name: 'Briefing Pipeline', href: '/ops', icon: Kanban },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'Frontify Intake', href: '/admin/frontify-intake', icon: Inbox },
      { name: 'Heimdall Plugin', href: '/admin/plugin', icon: Puzzle },
      { name: 'Feedback Summarizer', href: '/sheets', icon: MessageSquare },
      { name: 'Briefing Assistant', href: '/briefing-assistant', icon: LayoutGrid, external: true },
      { name: 'Forecast', href: '/forecast', icon: TrendingUp, external: true },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Logs', href: '/admin/logs', icon: ScrollText },
    ],
  },
]

function NavContent() {
  const pathname = usePathname()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null)
    })
  }, [])

  const handleSignOut = async () => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) return
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="w-72 border-r bg-card p-5 flex flex-col">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Heimdall</h1>
        <p className="text-sm text-muted-foreground">Admin Panel</p>
      </div>
      <div className="space-y-6 flex-1">
        {sections.map((section, sectionIdx) => (
          <div key={section.label}>
            {sectionIdx > 0 && <div className="mb-3 border-t border-border" />}
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon
                const isActive = item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href.split('?')[0])
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* User footer */}
      {userEmail && (
        <div className="border-t border-border pt-4 mt-4">
          <p className="px-3 text-xs text-muted-foreground truncate mb-2" title={userEmail}>
            {userEmail}
          </p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </nav>
  )
}

export function Nav() {
  return <NavContent />
}
