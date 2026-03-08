'use client'

import { LoopPlaceholder } from '@/components/briefing-assistant/LoopPlaceholder'
import { BarChart3 } from 'lucide-react'

export default function LoopAdsPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(142,71%,36%)]/10">
            <BarChart3 className="h-4 w-4 text-[hsl(142,71%,36%)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Loop Ads</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              First-party ad performance data from Loop Earplugs campaigns
            </p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-subtle">
        <LoopPlaceholder
          title="Loop Ads Performance"
          description="Your own Loop Earplugs ad performance data will appear here. Connect your ad accounts to see creative performance, top-performing assets, and spend insights from your campaigns."
          icon={<BarChart3 className="h-6 w-6" />}
        />
      </div>
    </div>
  )
}
