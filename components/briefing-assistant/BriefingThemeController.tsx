'use client'

import { useEffect } from 'react'

/**
 * Forces light mode while Briefing Assistant routes are active
 * by removing the root `dark` class. Restores it on unmount
 * so the rest of Heimdall stays dark.
 */
export function BriefingThemeController() {
  useEffect(() => {
    const root = document.documentElement
    const wasDark = root.classList.contains('dark')
    root.classList.remove('dark')

    return () => {
      if (wasDark) root.classList.add('dark')
    }
  }, [])

  return null
}
