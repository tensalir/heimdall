'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SheetTabItem {
  id: string
  label: string
  badge?: string | number
}

interface SheetTabsProps {
  tabs: SheetTabItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
  onDelete?: (id: string, label: string) => void
  className?: string
}

/**
 * Bottom tab bar for worksheet/round navigation.
 * Supports optional add (+) button and right-click delete.
 */
export function SheetTabs({ tabs, activeId, onSelect, onAdd, onDelete, className }: SheetTabsProps) {
  const tabBarRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tab: SheetTabItem } | null>(null)

  const closeMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeMenu()
    window.addEventListener('click', handler)
    window.addEventListener('contextmenu', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('contextmenu', handler)
    }
  }, [contextMenu, closeMenu])

  const handleContextMenu = (e: React.MouseEvent, tab: SheetTabItem) => {
    if (!onDelete) return
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tab })
  }

  if (tabs.length === 0 && !onAdd) return null

  return (
    <div className={cn('flex-shrink-0 border-t border-border bg-card/40', className)}>
      <div
        ref={tabBarRef}
        className="flex overflow-x-auto scrollbar-thin px-2 gap-0 items-center"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab)}
              className={cn(
                'flex-shrink-0 px-4 py-2 text-xs font-medium transition-all',
                'border-t-2 whitespace-nowrap',
                'hover:text-foreground hover:bg-muted/30',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground'
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className="truncate max-w-[200px]">{tab.label}</span>
                {tab.badge != null && (
                  <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                    ({tab.badge})
                  </span>
                )}
              </span>
            </button>
          )
        })}

        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex-shrink-0 flex items-center justify-center w-7 h-7 ml-1 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors"
            title="New sheet"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {contextMenu && onDelete && (
        <div
          className="fixed z-50 rounded-md border border-border bg-card shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            onClick={() => {
              onDelete(contextMenu.tab.id, contextMenu.tab.label)
              closeMenu()
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete &ldquo;{contextMenu.tab.label}&rdquo;
          </button>
        </div>
      )}
    </div>
  )
}
