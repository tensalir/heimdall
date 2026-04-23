import Link from 'next/link'
import type { ShowcaseProject } from '@/lib/showcase/projects'
import { StatusTag } from './StatusTag'
import { ShowcaseTopBar } from './ShowcaseTopBar'

interface ProjectDetailPageProps {
  project: ShowcaseProject
  prev: ShowcaseProject
  next: ShowcaseProject
}

export function ProjectDetailPage({
  project,
  prev,
  next,
}: ProjectDetailPageProps) {
  return (
    <div
      className="detail-page"
      style={{ ['--accent-card' as string]: project.accent } as React.CSSProperties}
    >
      <ShowcaseTopBar
        meta={`${project.num} / 04`}
        extraNav={[
          { label: 'Repo ↗', href: project.repo, external: true },
        ]}
      />
      <main>
        <section className="detail-hero">
          <div className="container">
            <Link className="back-link" href="/admin/showcase#projects">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path
                  d="M8 2L2 6l6 4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
              All projects
            </Link>
            <div className="dh-meta">
              <span className="dh-num">{project.num} / 04</span>
              <StatusTag status={project.status} statusTag={project.statusTag} />
              <span className="tag">{project.year}</span>
              <span className="tag">{project.team}</span>
            </div>
            <h1 className="h-xxl dh-title">
              {project.name}
              <span className="psec-period">.</span>
            </h1>
            <div className="dh-tag">{project.tagline}</div>
            <p className="dh-lede">{project.oneLiner}</p>
            <div className="dh-actions">
              <a
                className="btn"
                href={project.repo}
                target="_blank"
                rel="noopener noreferrer"
              >
                View repository
                <svg
                  className="arr"
                  width="14"
                  height="14"
                  viewBox="0 0 14 14"
                >
                  <path
                    d="M3 11L11 3M11 3H5M11 3v6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </svg>
              </a>
              <Link className="btn btn--ghost" href="/admin/showcase#projects">
                Back to showcase
              </Link>
            </div>
            <div className="dh-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.image} alt={project.name + ' screenshot'} />
            </div>
          </div>
        </section>

        <div className="container">
          <div className="info-strip">
            <div className="info-item">
              <div className="eyebrow">Status</div>
              <div className="v">{project.status}</div>
            </div>
            <div className="info-item">
              <div className="eyebrow">Team</div>
              <div className="v">{project.team}</div>
            </div>
            <div className="info-item">
              <div className="eyebrow">Shipped</div>
              <div className="v">{project.year}</div>
            </div>
            <div className="info-item">
              <div className="eyebrow">Source</div>
              <div className="v">
                <a
                  href={project.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ borderBottom: '1px solid currentColor' }}
                >
                  github.com/tensalir
                </a>
              </div>
            </div>
          </div>

          <section className="detail-section">
            <span className="eyebrow">
              <span className="bar" />
              Context
            </span>
            <h2 className="h-lg ds-title" style={{ marginTop: 16 }}>
              Why it exists.
            </h2>
            <p className="ds-sub" style={{ fontSize: 17, maxWidth: '62ch' }}>
              {project.description}
            </p>
          </section>

          <section className="detail-section">
            <span className="eyebrow">
              <span className="bar" />
              Key capabilities
            </span>
            <h2
              className="h-lg ds-title"
              style={{ marginTop: 16, marginBottom: 32 }}
            >
              What it does.
            </h2>
            <div className="caps-grid">
              {project.capabilities.map((c) => (
                <div key={c.k} className="cap">
                  <div className="cap-k">{c.k}</div>
                  <div className="cap-v">{c.v}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <span className="eyebrow">
              <span className="bar" />
              Stack
            </span>
            <h2
              className="h-lg ds-title"
              style={{ marginTop: 16, marginBottom: 24 }}
            >
              How it&apos;s built.
            </h2>
            <div className="stack-grid">
              {project.stack.map((s) => (
                <span key={s} className="stack-chip">
                  {s}
                </span>
              ))}
            </div>
          </section>

          <div className="proj-nav">
            <Link className="prev" href={`/admin/showcase/${prev.slug}`}>
              <span className="eyebrow">← Previous</span>
              <span className="name">{prev.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {prev.tagline}
              </span>
            </Link>
            <Link className="next" href={`/admin/showcase/${next.slug}`}>
              <span className="eyebrow">Next →</span>
              <span className="name">{next.name}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {next.tagline}
              </span>
            </Link>
          </div>
        </div>
      </main>

      <footer className="site">
        <div className="container">
          <div
            className="meta-row"
            style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}
          >
            <span>© Loop Earplugs · Creative Technology · Vince Buyssens</span>
            <span>Built with Cursor + Claude Code</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
