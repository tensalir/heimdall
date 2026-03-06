import { BriefingSidebar } from '@/components/briefing-assistant/BriefingSidebar'

export default function BriefingAssistantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <BriefingSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
