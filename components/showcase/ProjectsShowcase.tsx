'use client'

import { useState } from 'react'
import type { ShowcaseProject } from '@/lib/showcase/projects'
import { StatusTag } from './StatusTag'
import { ProjectModal } from './ProjectModal'

function repoPath(slug: string) {
  return slug === 'vesper' ? 'Loop-Vesper' : slug
}

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
        <a
          href={project.repo}
          target="_blank"
          rel="noopener noreferrer"
          className="psec-repo"
        >
          github.com/tensalir/{repoPath(project.slug)}
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path
              d="M2 8L8 2M8 2H4M8 2v4"
              stroke="currentColor"
              strokeWidth="1"
              fill="none"
            />
          </svg>
        </a>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.image}
              alt={project.name + ' screenshot'}
              loading="lazy"
            />
          </div>
          <div className="psec-caps psec-caps-tight">
            {project.capabilities.slice(0, 4).map((c) => (
              <div key={c.k} className="psec-cap psec-cap-tight">
                <div className="psec-cap-k">{c.k}</div>
                <div className="psec-cap-v">{c.v}</div>
              </div>
            ))}
          </div>
          <div className="psec-foot">
            <a
              href={project.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="psec-cta psec-cta--ghost"
            >
              Repository
              <svg width="14" height="14" viewBox="0 0 14 14">
                <path
                  d="M3 11L11 3M11 3H5M11 3v6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  fill="none"
                />
              </svg>
            </a>
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
            Each tool started <span className="accent-word">as a prototype</span>
            <br />
            to solve a real problem.
          </h2>
          <p className="lede ps-lede">
            Built by Creative Technology at Loop Studio. Two in production, two
            shipping soon. All four talk to each other through Heimdall.
          </p>
        </div>
      </div>

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
