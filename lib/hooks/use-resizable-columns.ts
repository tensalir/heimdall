'use client'

import { useState, useCallback, useEffect, useRef, useMemo } from 'react'

export interface ColumnDef {
  key: string
  defaultWidth: number
  minWidth?: number
  maxWidth?: number
  /** When true the column cannot be resized. */
  fixed?: boolean
}

export interface ResizableColumnsResult {
  widths: Record<string, number>
  getHandleProps: (columnKey: string) => {
    onPointerDown: (e: React.PointerEvent) => void
    style: React.CSSProperties
    className: string
    'data-resize-handle': string
  }
  isResizing: boolean
}

const DEFAULT_MIN = 60
const DEFAULT_MAX = 1200

export function useResizableColumns(
  columns: ColumnDef[],
  storageKey: string | null,
): ResizableColumnsResult {
  const [savedWidths, setSavedWidths] = useState<Record<string, number>>({})
  const [hydrated, setHydrated] = useState(false)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const columnMap = useMemo(
    () => new Map(columns.map((c) => [c.key, c])),
    [columns],
  )

  useEffect(() => {
    if (!storageKey) { setHydrated(true); return }
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>
        if (parsed && typeof parsed === 'object') {
          const valid: Record<string, number> = {}
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && Number.isFinite(v) && v > 0) valid[k] = v
          }
          setSavedWidths(valid)
        }
      }
    } catch { /* ignore corrupt data */ }
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (!storageKey || !hydrated) return
    if (Object.keys(savedWidths).length === 0) return
    window.localStorage.setItem(storageKey, JSON.stringify(savedWidths))
  }, [storageKey, hydrated, savedWidths])

  const clamp = useCallback(
    (key: string, value: number): number => {
      const def = columnMap.get(key)
      const min = def?.minWidth ?? DEFAULT_MIN
      const max = def?.maxWidth ?? DEFAULT_MAX
      return Math.round(Math.max(min, Math.min(max, value)))
    },
    [columnMap],
  )

  const widths: Record<string, number> = useMemo(() => {
    const out: Record<string, number> = {}
    for (const col of columns) {
      out[col.key] = savedWidths[col.key] ?? col.defaultWidth
    }
    return out
  }, [columns, savedWidths])

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!activeKey) return
      const delta = e.clientX - startXRef.current
      const newWidth = clamp(activeKey, startWidthRef.current + delta)
      setSavedWidths((prev) => ({ ...prev, [activeKey]: newWidth }))
    },
    [activeKey, clamp],
  )

  const handlePointerUp = useCallback(() => {
    setActiveKey(null)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    if (!activeKey) return
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [activeKey, handlePointerMove, handlePointerUp])

  const getHandleProps = useCallback(
    (columnKey: string) => {
      const def = columnMap.get(columnKey)
      return {
        onPointerDown: (e: React.PointerEvent) => {
          e.preventDefault()
          e.stopPropagation()
          startXRef.current = e.clientX
          startWidthRef.current = widths[columnKey] ?? def?.defaultWidth ?? 100
          setActiveKey(columnKey)
        },
        style: {
          position: 'absolute' as const,
          right: 0,
          top: 0,
          bottom: 0,
          width: 6,
          cursor: 'col-resize',
          zIndex: 20,
        } as React.CSSProperties,
        className: 'hover:bg-primary/20 active:bg-primary/30 transition-colors',
        'data-resize-handle': columnKey,
      }
    },
    [widths, columnMap],
  )

  return { widths, getHandleProps, isResizing: activeKey !== null }
}
