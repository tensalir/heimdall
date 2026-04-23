import Link from 'next/link'
import type { ShowcaseProject } from '@/lib/showcase/projects'
import { StatusTag } from './StatusTag'
import { ShowcaseTopBar } from './ShowcaseTopBar'
import { ScreenshotGallery } from './ScreenshotGallery'

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
              <Link className="btn" href="/admin/showcase#projects">
                Back to showcase
              </Link>
            </div>
            <div className="dh-shot">
              {project.screenshots && project.screenshots.length > 1 ? (
                <ScreenshotGallery
                  screenshots={project.screenshots}
                  name={project.name}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.image} alt={project.name + ' screenshot'} />
              )}
            </div>
          </div>
        </section>

        <div className="container">
          {project.metrics.length > 0 && (
            <div className="detail-metrics-strip">
              {project.metrics.map((m) => (
                <div key={m.k} className="detail-metric">
                  <div className="detail-metric-v">{m.v}</div>
                  <div className="detail-metric-k">{m.k}</div>
                </div>
              ))}
            </div>
          )}

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
              Workflow shift
            </span>
            <h2 className="h-lg ds-title" style={{ marginTop: 16 }}>
              What changed.
            </h2>
            <span className={`ds-wf-mode ds-wf-mode--${project.workflowMode.toLowerCase()}`}>
              Workflow {project.workflowMode.toLowerCase()}
            </span>
            <div className="ds-wf-compare">
              <div className="ds-wf-col">
                <div className="ds-wf-label mono-small">Before</div>
                <p className="ds-wf-text">{project.workflowBefore}</p>
              </div>
              <div className="ds-wf-col ds-wf-col--after">
                <div className="ds-wf-label mono-small">After</div>
                <p className="ds-wf-text">{project.workflowAfter}</p>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <span className="eyebrow">
              <span className="bar" />
              From prototype to platform
            </span>
            <h2 className="h-lg ds-title" style={{ marginTop: 16 }}>
              How it grew.
            </h2>
            <div className="ds-proto-grid">
              <div className="ds-proto-item">
                <div className="ds-proto-label mono-small">What sparked it</div>
                <p className="ds-proto-text">{project.prototypeOrigin}</p>
              </div>
              <div className="ds-proto-item">
                <div className="ds-proto-label mono-small">What became reusable</div>
                <p className="ds-proto-text">{project.reuseSignal}</p>
              </div>
            </div>
          </section>

          <section className="detail-section">
            <span className="eyebrow">
              <span className="bar" />
              Beyond this team
            </span>
            <h2 className="h-lg ds-title" style={{ marginTop: 16 }}>
              Where it goes next.
            </h2>
            <p className="ds-sub" style={{ fontSize: 17, maxWidth: '62ch' }}>
              {project.companyLeverage}
            </p>
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
