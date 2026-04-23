import { FOUNDATION_PILLARS } from '@/lib/showcase/projects'

export function FoundationsHero() {
  return (
    <section className="foundations-section foundations-section--lead" id="foundations">
      <div className="container">
        <div className="foundations">
          <div className="foundations-head">
            <div className="hero-eyebrow">
              <span className="eyebrow">
                <span className="bar" />
                Creative Technology · Loop Earplugs
              </span>
              <span className="eyebrow muted">April 2026</span>
            </div>
            <h1 className="h-xxl foundations-lead-title">
              A flywheel. Three steps.
              <br />
              They compound into{' '}
              <span className="accent-word">how Loop builds</span>.
            </h1>
            <p className="foundations-lede">
              For two years, Creative Technology has been embedded in
              Marketing, seeing AI signals early, cultivating adoption from
              inside the work, and shipping tools that make teams
              self-sufficient. The flywheel below is how adoption turns into
              encoded knowledge, then into production-grade tools. The four
              projects that follow show the pattern working, and where it
              goes from here.
            </p>
            <div className="hero-meta hero-meta--lead">
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Lead
                </div>
                <div className="hero-meta-v">
                  Vince Buyssens
                  <br />
                  <span className="muted">
                    Creative Technology · Marketing
                  </span>
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 6 }}>
                  Track record
                </div>
                <div className="hero-meta-v">
                  90% of briefings use AI
                  <br />
                  <span className="muted">
                    6 tools in production · 140 Claude users across departments
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="foundations-track">
            {FOUNDATION_PILLARS.map((p) => (
              <div key={p.n} className="pillar">
                <div className="pillar-n mono-small">{p.n}</div>
                <div className="pillar-label">{p.label}</div>
                <div className="pillar-title">{p.title}</div>
                <div className="pillar-body">{p.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
