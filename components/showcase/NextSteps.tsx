import { NEXT_STEP_ROLES } from '@/lib/showcase/projects'

const PROOF_POINTS: { v: string; k: string }[] = [
  { v: '4', k: 'Tools in production' },
  { v: '140', k: 'Claude users' },
  { v: '90%', k: 'Briefings use AI' },
  { v: '2 yrs', k: 'Embedded in Marketing' },
]

export function NextSteps() {
  const [lead, ...supporting] = NEXT_STEP_ROLES

  return (
    <section className="ns-section" id="next">
      <div className="container">
        <div className="ns-head">
          <span className="eyebrow">
            <span className="bar" />
            Scaling the flywheel
          </span>
          <h2 className="h-lg ns-title">
            Four tools prove the pattern.{' '}
            <span className="accent-word">Now make it how Loop builds.</span>
          </h2>
          <p className="lede ns-lede">
            Embed in the work, prototype fast, encode what works, expand. The
            next step is building the team to run this across the company,
            not as a program, but as operational infrastructure.
          </p>
        </div>

        <div className="ns-proof" aria-label="What the method has delivered so far">
          {PROOF_POINTS.map((p) => (
            <div key={p.k} className="ns-proof-item">
              <div className="ns-proof-v">{p.v}</div>
              <div className="ns-proof-k mono-small">{p.k}</div>
            </div>
          ))}
        </div>

        <div className="ns-roles">
          <div className="ns-roles-label">
            <span className="eyebrow">
              <span className="bar" />
              The team
            </span>
          </div>

          {lead && (
            <div className="ns-roles-lead">
              <div className="ns-role-n mono-small">01</div>
              <div className="ns-role-label mono-small">The hub · {lead.label}</div>
              <div className="ns-role-title">{lead.title}</div>
              <p className="ns-role-body">{lead.body}</p>
            </div>
          )}

          <div className="ns-roles-grid">
            {supporting.map((role, i) => (
              <div key={role.label} className="ns-role">
                <div className="ns-role-n mono-small">{String(i + 2).padStart(2, '0')}</div>
                <div className="ns-role-label mono-small">Supporting · {role.label}</div>
                <div className="ns-role-title">{role.title}</div>
                <p className="ns-role-body">{role.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
