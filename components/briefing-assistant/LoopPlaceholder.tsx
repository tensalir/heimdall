'use client'

import { cn } from '@/lib/utils'

/**
 * Vesper mint accent: HSL 131 100% 85% = #B3FFD1.
 * Used as the brand accent for Loop-specific internal data sections.
 */

export function LoopPlaceholder({
  title,
  description,
  icon,
}: {
  title: string
  description: string
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className={cn(
        'flex items-center justify-center w-14 h-14 rounded-xl mb-5',
        'bg-[hsl(131,100%,85%)]/10 text-[hsl(131,100%,85%)]',
      )}>
        {icon ?? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        )}
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
        {description}
      </p>
      <div className="mt-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider bg-[hsl(131,100%,85%)]/10 text-[hsl(131,100%,85%)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[hsl(131,100%,85%)]" />
        Loop Earplugs
      </div>
    </div>
  )
}

export function LoopTabIndicator({ active }: { active: boolean }) {
  if (!active) return null
  return <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[hsl(131,100%,85%)]" />
}
