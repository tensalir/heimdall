'use client'

import { usePathname } from 'next/navigation'
import { BriefingSidebar } from '@/components/briefing-assistant/BriefingSidebar'
import { BriefingThemeController } from '@/components/briefing-assistant/BriefingThemeController'

export default function BriefingAssistantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hideSidebar =
    pathname?.startsWith('/briefing-assistant/create-ads') ||
    pathname === '/briefing-assistant/login'

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <BriefingThemeController />
      {!hideSidebar && <BriefingSidebar />}
      <main className="flex-1 overflow-y-auto scrollbar-subtle">
        {children}
      </main>
    </div>
  )
}
