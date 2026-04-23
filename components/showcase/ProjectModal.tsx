'use client'

import { useEffect } from 'react'
import type { ShowcaseProject } from '@/lib/showcase/projects'
import { StatusTag } from './StatusTag'

interface ProjectModalProps {
  project: ShowcaseProject
  onClose: () => void
}

export function ProjectModal({ project, onClose }: ProjectModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div
        className="pm-modal"
        style={{ ['--accent-card' as string]: project.accent } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="pm-close" onClick={onClose} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M3 3l10 10M13 3L3 13"
              stroke="currentColor"
              strokeWidth="1.4"
              fill="none"
            />
          </svg>
        </button>
        <div className="pm-scroll">
          <div className="pm-hero">
            <div className="pm-hero-meta">
              <span className="mono-small psec-idx">{project.num} / 04</span>
              <StatusTag status={project.status} statusTag={project.statusTag} />
              <span className="tag">{project.year}</span>
              <span className="tag">{project.team}</span>
            </div>
            <h2 className="h-xxl pm-title">
              {project.name}
              <span className="psec-period">.</span>
            </h2>
            <div className="psec-tag">{project.tagline}</div>
            <p className="pm-lede">{project.oneLiner}</p>
            <div className="pm-shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={project.image} alt={project.name + ' screenshot'} />
            </div>
          </div>

          <div className="pm-section">
            <span className="eyebrow">
              <span className="bar" />
              Context
            </span>
            <h3 className="h-lg pm-h" style={{ marginTop: 12 }}>
              Why it exists.
            </h3>
            <p className="pm-body">{project.description}</p>
          </div>

          <div className="pm-section">
            <span className="eyebrow">
              <span className="bar" />
              Key capabilities
            </span>
            <h3 className="h-lg pm-h" style={{ marginTop: 12 }}>
              What it does.
            </h3>
            <div className="pm-caps">
              {project.capabilities.map((c, j) => (
                <div key={c.k} className="pm-cap">
                  <div className="pm-cap-n mono-small">0{j + 1}</div>
                  <div>
                    <div className="pm-cap-k">{c.k}</div>
                    <div className="pm-cap-v">{c.v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pm-section">
            <span className="eyebrow">
              <span className="bar" />
              Stack
            </span>
            <div className="psec-stack" style={{ marginTop: 16 }}>
              {project.stack.map((s) => (
                <span key={s} className="pg-chip">
                  {s}
                </span>
              ))}
            </div>
          </div>

          <div className="pm-footer">
            <a
              href={project.repo}
              target="_blank"
              rel="noopener noreferrer"
              className="btn"
            >
              Open repository
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
            <a
              href={`/admin/showcase/${project.slug}`}
              className="btn btn--ghost"
            >
              Open full detail
            </a>
            <button type="button" onClick={onClose} className="btn btn--ghost">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
