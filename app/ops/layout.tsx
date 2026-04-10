'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Nav } from '@/components/nav'
import { useIsBriefingOnly } from '@/lib/roles'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth'
import { Kanban, LogOut } from 'lucide-react'

function BriefingOnlyNav() {
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
        <p className="text-sm text-muted-foreground">Briefing Workflow</p>
      </div>
      <div className="flex-1">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Operations
        </p>
        <ul className="space-y-1">
          <li>
            <span className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium bg-primary text-primary-foreground">
              <Kanban className="h-4 w-4" />
              Briefing Workflow
            </span>
          </li>
        </ul>
      </div>

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

export default function OpsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const briefingOnly = useIsBriefingOnly()

  return (
    <div className="flex min-h-screen">
      {briefingOnly ? <BriefingOnlyNav /> : <Nav />}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
