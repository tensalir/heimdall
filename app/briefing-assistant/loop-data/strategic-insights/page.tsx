'use client'

import { useState } from 'react'
import { Lightbulb, MessageCircle, Star, Sparkles, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LoopPlaceholder } from '@/components/briefing-assistant/LoopPlaceholder'

type InsightTab = 'customer_insights' | 'social_comments' | 'reviews' | 'synthesized'

const TABS: { id: InsightTab; label: string; icon: typeof Lightbulb }[] = [
  { id: 'customer_insights', label: 'Customer Insights', icon: Users },
  { id: 'social_comments', label: 'Social Comments', icon: MessageCircle },
  { id: 'reviews', label: 'Reviews', icon: Star },
  { id: 'synthesized', label: 'Synthesized Signals', icon: Sparkles },
]

const TAB_PLACEHOLDERS: Record<InsightTab, { title: string; description: string }> = {
  customer_insights: {
    title: 'Customer Insights',
    description: 'Customer interviews, survey highlights, and product-specific insights from Loop Earplugs. Connect your insights pipeline to populate this view with first-party qualitative data.',
  },
  social_comments: {
    title: 'Loop Social Comments',
    description: 'Comments and conversations from Loop Earplugs owned social media channels. Connect your social accounts to surface brand-specific sentiment and community feedback.',
  },
  reviews: {
    title: 'Product Reviews',
    description: 'Reviews from e-commerce platforms and review sites for Loop Earplugs products. Connect review aggregation to track product perception, feature requests, and satisfaction trends.',
  },
  synthesized: {
    title: 'Synthesized Signals',
    description: 'AI-generated synthesis across all Loop first-party data sources: recurring themes, emerging patterns, and strategic opportunities derived from customer insights, social comments, and reviews.',
  },
}

export default function StrategicInsightsPage() {
  const [activeTab, setActiveTab] = useState<InsightTab>('customer_insights')
  const placeholder = TAB_PLACEHOLDERS[activeTab]

  return (
    <div className="flex flex-col h-full">
      <header className="flex-shrink-0 border-b border-border bg-card/60 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[hsl(142,71%,36%)]/10">
            <Lightbulb className="h-4 w-4 text-[hsl(142,71%,36%)]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">Strategic Insights</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Loop Earplugs first-party intelligence: customer data, social comments, reviews, and synthesized patterns
            </p>
          </div>
        </div>

        <div className="flex items-center border-b border-border -mx-6 px-6">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                  activeTab === tab.id
                    ? 'border-[hsl(142,71%,36%)] text-[hsl(142,71%,36%)]'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-subtle">
        <LoopPlaceholder
          title={placeholder.title}
          description={placeholder.description}
        />
      </div>
    </div>
  )
}
