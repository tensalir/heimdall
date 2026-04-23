'use client'

import { useState } from 'react'
import type { ShowcaseProject } from '@/lib/showcase/projects'
import { StatusTag } from './StatusTag'
import { ProjectModal } from './ProjectModal'
import { ScreenshotGallery } from './ScreenshotGallery'
import { SoftwareForFew } from './SoftwareForFew'

function ProjectMeta({
  project,
  total,
}: {
  project: ShowcaseProject
  total: number
}) {
  return (
    <div className="psec-head">
      <div className="psec-head-l">
        <span className="mono-small psec-idx">
          {project.num} <span className="faint">/ {String(total).padStart(2, '0')}</span>
        </span>
        <span className="psec-divider" />
        <span className="eyebrow">{project.team}</span>
      </div>
      <div className="psec-head-r">
        <StatusTag status={project.status} statusTag={project.statusTag} />
      </div>
    </div>
  )
}

function FrameSection({
  project,
  total,
  onOpen,
}: {
  project: ShowcaseProject
  total: number
  onOpen: (p: ShowcaseProject) => void
}) {
  return (
    <div className="psec-frame-v">
      <ProjectMeta project={project} total={total} />
      <div className="psec-frame-grid">
        <aside className="psec-rail">
          <div className="rail-block">
            <div className="eyebrow">Project</div>
            <h2 className="h-xl psec-name">
              {project.name}
              <span className="psec-period">.</span>
            </h2>
            <div className="psec-tag" style={{ marginTop: 4 }}>
              {project.tagline}
            </div>
            {project.subline && (
              <div className="psec-subline">{project.subline}</div>
            )}
          </div>
          <div className="rail-block">
            <div className="eyebrow">Summary</div>
            <p
              className="psec-lede"
              style={{ fontSize: 16, marginTop: 8, marginBottom: 0 }}
            >
              {project.oneLiner}
            </p>
          </div>
          <div className="rail-block">
            <div className="eyebrow">Workflow shift</div>
            <div className="psec-wf">
              <span className={`psec-wf-mode psec-wf-mode--${project.workflowMode.toLowerCase()}`}>
                {project.workflowMode === 'Repair' && 'Repair'}
                {project.workflowMode === 'Compress' && 'Compress'}
                {project.workflowMode === 'Invent' && 'Invent'}
              </span>
              <p className="psec-wf-txt">{project.workflowAfter}</p>
            </div>
          </div>
          {project.metrics.length > 0 && (
            <div className="rail-block psec-metrics">
              {project.metrics.map((m) => (
                <div key={m.k} className="psec-metric">
                  <div className="psec-metric-v">{m.v}</div>
                  <div className="psec-metric-k">{m.k}</div>
                </div>
              ))}
            </div>
          )}
          <div className="rail-block">
            <div className="eyebrow">Stack</div>
            <div className="psec-stack" style={{ marginTop: 10 }}>
              {project.stack.map((s) => (
                <span key={s} className="pg-chip">
                  {s}
                </span>
              ))}
            </div>
          </div>
        </aside>
        <div className="psec-frame-shot">
          <div className="psec-shot-frame tall">
            {project.screenshots && project.screenshots.length > 1 ? (
              <ScreenshotGallery
                screenshots={project.screenshots}
                name={project.name}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={project.image}
                alt={project.name + ' screenshot'}
                loading="lazy"
              />
            )}
          </div>
          <div className="psec-caps psec-caps-tight">
            {project.capabilities.slice(0, 4).map((c) => (
              <div key={c.k} className="psec-cap psec-cap-tight">
                <div className="psec-cap-k">{c.k}</div>
                <div className="psec-cap-v">{c.v}</div>
              </div>
            ))}
          </div>
          <div className="psec-foot" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => onOpen(project)}
              className="psec-cta"
            >
              View project detail
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectsShowcase({ projects }: { projects: ShowcaseProject[] }) {
  const [open, setOpen] = useState<ShowcaseProject | null>(null)

  return (
    <section className="projects-section-full" id="projects">
      <div className="container">
        <div className="ps-head">
          <span className="eyebrow">
            <span className="bar" />
            Four tools · One roadmap
          </span>
          <h2 className="h-xl ps-title">
            Reinvent workflows,<br />
            <span className="accent-word">pragmatically.</span>
          </h2>
          <p className="lede ps-lede">
            Translating existing workflows to AI is only the first step.
            The real advantage is reimagining them: condensing the full loop
            from analytics to briefing to creation to review, so each cycle
            feeds the next one. Each tool below started by fixing a specific
            friction point, then grew into something the old workflow could
            never have supported.
          </p>
          <div className="ps-legend">
            <div className="ps-legend-item">
              <span className="psec-wf-mode psec-wf-mode--repair">Repair</span>
              <span className="ps-legend-def">Fix the gaps between tools the team must keep using.</span>
            </div>
            <div className="ps-legend-item">
              <span className="psec-wf-mode psec-wf-mode--compress">Compress</span>
              <span className="ps-legend-def">Collapse fragmented steps into one continuous flow.</span>
            </div>
            <div className="ps-legend-item">
              <span className="psec-wf-mode psec-wf-mode--invent">Invent</span>
              <span className="ps-legend-def">Build a workflow that didn&apos;t exist before.</span>
            </div>
          </div>
        </div>
      </div>

      <SoftwareForFew />

      {projects.map((project) => (
        <section
          key={project.id}
          className="psec"
          id={`project-${project.slug}`}
          style={{ ['--accent-card' as string]: project.accent } as React.CSSProperties}
        >
          <div className="container psec-inner">
            <FrameSection
              project={project}
              total={projects.length}
              onOpen={setOpen}
            />
          </div>
        </section>
      ))}

      {open && <ProjectModal project={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
