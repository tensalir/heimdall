import Link from 'next/link'

interface TopBarProps {
  meta?: string
  homeHref?: string
  extraNav?: { label: string; href: string; external?: boolean }[]
}

export function ShowcaseTopBar({
  meta = 'v.2026.04',
  homeHref = '/admin/showcase',
  extraNav,
}: TopBarProps) {
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
        <nav>
          <a href={`${homeHref}#foundations`}>Foundations</a>
          <a href={`${homeHref}#projects`}>Projects</a>
          {extraNav
            ? extraNav.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  {...(item.external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {item.label}
                </a>
              ))
            : (
              <a href={`${homeHref}#contact`}>Contact</a>
            )}
          <Link
            href="/admin"
            style={{
              color: 'var(--ink-muted)',
              borderLeft: '1px solid var(--rule)',
              paddingLeft: 18,
            }}
          >
            ← Heimdall
          </Link>
        </nav>
        <span className="meta">{meta}</span>
      </div>
    </header>
  )
}
