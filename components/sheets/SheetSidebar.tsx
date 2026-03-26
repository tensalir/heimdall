'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Network,
  Settings,
  Puzzle,
  MessageSquare,
  LayoutGrid,
  ScrollText,
  LogOut,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from 'lucide-react'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth'
import { useUserRole } from '@/lib/roles'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const SIDEBAR_COLLAPSED_KEY = 'heimdall:sheet-sidebar-collapsed'

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

const ADMIN_SECTIONS: NavSection[] = [
  {
    label: 'Platform',
    items: [
      { name: 'Connections', href: '/admin', icon: Network },
      { name: 'Settings', href: '/admin/settings', icon: Settings },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'Heimdall Plugin', href: '/admin/plugin', icon: Puzzle },
      { name: 'Feedback Summarizer', href: '/sheets', icon: MessageSquare },
      { name: 'Mimir', href: '/briefing-assistant', icon: LayoutGrid },
      { name: 'Loop Document Chat', href: '/document-chat', icon: BookOpen },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Logs', href: '/admin/logs', icon: ScrollText },
    ],
  },
]

const USER_SECTIONS: NavSection[] = [
  {
    label: 'Tools',
    items: [
      { name: 'Feedback Summarizer', href: '/sheets', icon: MessageSquare },
      { name: 'Mimir', href: '/briefing-assistant', icon: LayoutGrid },
      { name: 'Loop Document Chat', href: '/document-chat', icon: BookOpen },
    ],
  },
]

export function SheetSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const role = useUserRole()
  const [collapsed, setCollapsed] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      setCollapsed(stored === 'true')
    } catch {
      setCollapsed(false)
    }
  }, [])

  const persistCollapsed = (value: boolean) => {
    setCollapsed(value)
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value))
    } catch {
      // ignore
    }
  }

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

  const sections = role === 'admin' ? ADMIN_SECTIONS : USER_SECTIONS

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          'flex-shrink-0 flex flex-col border-r border-border bg-[hsl(0_0%_10%)] transition-[width] duration-200 ease-in-out overflow-hidden',
          collapsed ? 'w-[52px]' : 'w-60'
        )}
      >
        <div className="flex flex-col flex-1 min-h-0 p-3">
          {/* Branding - only when expanded */}
          {!collapsed && (
            <div className="mb-6 px-2">
              <h1 className="text-xl font-bold text-foreground">Heimdall</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Briefings</p>
            </div>
          )}

          <nav className="flex-1 min-h-0 overflow-y-auto" aria-label="Sheet navigation">
            <div className="flex flex-col gap-5 py-1">
              {sections.map((section, sectionIdx) => (
                <div key={section.label}>
                  {!collapsed && sectionIdx > 0 && (
                    <div className="mb-3 border-t border-border/60" />
                  )}
                  {!collapsed && (
                    <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                      {section.label}
                    </p>
                  )}
                  <ul className="space-y-0.5 list-none p-0 m-0">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const isActive =
                        item.href === '/admin'
                          ? pathname === '/admin'
                          : pathname.startsWith(item.href.split('?')[0])
                      const linkContent = (
                        <Link
                          href={item.href}
                          {...(item.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className={cn(
                            'flex items-center gap-3 rounded-md text-sm font-medium transition-colors duration-100 min-h-[40px]',
                            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
                            isActive
                              ? 'bg-primary/15 text-foreground border-l-2 border-primary'
                              : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                          )}
                          style={
                            isActive && !collapsed
                              ? { borderLeftWidth: '2px', marginLeft: 0 }
                              : undefined
                          }
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          {!collapsed && (
                            <span className="truncate">
                              {item.name}
                            </span>
                          )}
                        </Link>
                      )
                      return (
                        <li key={item.name}>
                          {collapsed ? (
                            <Tooltip>
                              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                              <TooltipContent side="right">{item.name}</TooltipContent>
                            </Tooltip>
                          ) : (
                            linkContent
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          {/* User footer - only when expanded and Supabase-authenticated */}
          {userEmail && !collapsed && (
            <div className="border-t border-border/60 pt-4 mt-4 flex-shrink-0">
              <p
                className="px-3 text-xs text-muted-foreground truncate mb-2"
                title={userEmail}
              >
                {userEmail}
              </p>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors w-full"
              >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                Sign out
              </button>
            </div>
          )}

          {/* Collapse toggle */}
          <div className="mt-3 pt-3 border-t border-border/60 flex-shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => persistCollapsed(!collapsed)}
                  className={cn(
                    'flex items-center w-full rounded-md py-2 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-2 px-3'
                  )}
                  aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? (
                    <ChevronRight className="h-4 w-4" />
                  ) : (
                    <>
                      <ChevronLeft className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm">Collapse</span>
                    </>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
