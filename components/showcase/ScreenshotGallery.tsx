'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ProjectScreenshot } from '@/lib/showcase/projects'

interface ScreenshotGalleryProps {
  screenshots: ProjectScreenshot[]
  name: string
  /** Extra CSS class on the outer wrapper */
  className?: string
}

const INTERVAL_MS = 4500

export function ScreenshotGallery({
  screenshots,
  name,
  className,
}: ScreenshotGalleryProps) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prefersReducedMotion = useRef(false)

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
  }, [])

  const count = screenshots.length

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (count <= 1 || paused || prefersReducedMotion.current) {
      clearTimer()
      return
    }
    timerRef.current = setInterval(() => {
      setActive((prev) => (prev + 1) % count)
    }, INTERVAL_MS)
    return clearTimer
  }, [count, paused, clearTimer])

  const goTo = useCallback(
    (idx: number) => {
      setActive(idx)
      clearTimer()
      if (count > 1 && !prefersReducedMotion.current) {
        timerRef.current = setInterval(() => {
          setActive((prev) => (prev + 1) % count)
        }, INTERVAL_MS)
      }
    },
    [count, clearTimer],
  )

  if (count === 0) return null

  if (count === 1) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={screenshots[0].src} alt={screenshots[0].alt} />
      </div>
    )
  }

  return (
    <div
      className={`sg-wrap ${className ?? ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="sg-track">
        {screenshots.map((shot, i) => (
          <div
            key={shot.src}
            className={`sg-slide ${i === active ? 'sg-slide--active' : ''}`}
            aria-hidden={i !== active}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shot.src}
              alt={shot.alt}
              loading={i === 0 ? undefined : 'lazy'}
            />
          </div>
        ))}
      </div>

      <div className="sg-dots" role="tablist" aria-label={`${name} screenshots`}>
        {screenshots.map((shot, i) => (
          <button
            key={shot.src}
            role="tab"
            aria-selected={i === active}
            aria-label={shot.caption ?? shot.alt}
            className={`sg-dot ${i === active ? 'sg-dot--active' : ''}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      {screenshots[active].caption && (
        <p className="sg-caption mono-small">{screenshots[active].caption}</p>
      )}
    </div>
  )
}
