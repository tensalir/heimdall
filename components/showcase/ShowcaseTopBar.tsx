'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

interface TopBarProps {
  meta?: string
  homeHref?: string
  extraNav?: { label: string; href: string; external?: boolean }[]
}

export function ShowcaseTopBar({
  meta = 'v.2026.04',
  homeHref = '/showcase',
  extraNav,
}: TopBarProps) {
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const navItems = extraNav
    ? extraNav.map((item) => ({
        label: item.label,
        href: item.href,
        external: item.external,
      }))
    : [
        { label: 'Foundations', href: `${homeHref}#foundations` },
        { label: 'Projects', href: `${homeHref}#projects` },
        { label: 'Next', href: `${homeHref}#next` },
        { label: 'Contact', href: `${homeHref}#contact` },
      ]

  return (
    <header className="topbar">
      <div className="container topbar-inner">
        <Link className="brand" href={homeHref}>
          <span className="loop-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 2C6 2 2 6 2 11s4 9 9 9c3 0 5-2 5-4.5S14 11 11 11s-3-1-3-2 1-2 3-2 4 1 4 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </span>
          <b>Creative Technology</b>
        </Link>

        {/* Desktop nav — hidden on mobile via CSS */}
        <nav className="topbar-nav-desktop">
          {navItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              {...(item.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <span className="meta topbar-meta-desktop">{meta}</span>

        {/* Hamburger — visible on mobile via CSS */}
        <button
          type="button"
          className="topbar-burger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-nav-sheet"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            aria-hidden="true"
          >
            {open ? (
              <>
                <line x1="4" y1="4" x2="16" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="16" y1="4" x2="4" y2="16" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="3" y1="5" x2="17" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <line x1="3" y1="15" x2="17" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile overlay sheet */}
      {open && (
        <div className="topbar-sheet" id="mobile-nav-sheet" role="dialog" aria-modal="true">
          <nav className="topbar-sheet-nav">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="topbar-sheet-link"
                onClick={close}
                {...(item.external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="topbar-sheet-footer">
            <a
              className="btn"
              href="mailto:vince.buyssens@loopearplugs.com"
              onClick={close}
            >
              Get in touch
              <svg className="arr" width="14" height="14" viewBox="0 0 14 14">
                <path d="M3 11L11 3M11 3H5M11 3v6" stroke="currentColor" strokeWidth="1.2" fill="none" />
              </svg>
            </a>
            <span className="meta">{meta}</span>
          </div>
        </div>
      )}
    </header>
  )
}
