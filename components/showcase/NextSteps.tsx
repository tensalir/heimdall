import { NEXT_STEP_ROLES, PARTNER_MODEL } from '@/lib/showcase/projects'

export function NextSteps() {
  return (
    <section className="ns-section" id="next">
      <div className="container">
        <div className="ns-head">
          <span className="eyebrow">
            <span className="bar" />
            Scaling the flywheel
          </span>
          <h2 className="h-lg ns-title">
            The method works.{' '}
            <span className="accent-word">Now multiply it.</span>
          </h2>
          <p className="lede ns-lede">
            Four tools prove the pattern: embed in the work, prototype fast,
            encode what works, and expand. The next step is building the team
            and the partnerships to run this across the company, not as a
            program, but as operational infrastructure.
          </p>
        </div>

        <div className="ns-roles">
          <div className="ns-roles-label">
            <span className="eyebrow">
              <span className="bar" />
              The team
            </span>
          </div>
          <div className="ns-roles-grid">
            {NEXT_STEP_ROLES.map((role) => (
              <div key={role.label} className="ns-role">
                <div className="ns-role-label mono-small">{role.label}</div>
                <div className="ns-role-title">{role.title}</div>
                <p className="ns-role-body">{role.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ns-partner">
          <div className="ns-partner-label">
            <span className="eyebrow">
              <span className="bar" />
              Internal + external
            </span>
          </div>
          <div className="ns-partner-grid">
            {PARTNER_MODEL.map((p) => (
              <div key={p.label} className="ns-partner-card">
                <div className="ns-partner-card-label mono-small">
                  {p.label}
                </div>
                <p className="ns-partner-card-body">{p.body}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="ns-why-now">
          <span className="eyebrow">
            <span className="bar" />
            Why now
          </span>
          <h3 className="h-md ns-why-title" style={{ marginTop: 16 }}>
            The UI is not the advantage anymore.
          </h3>
          <p className="ns-why-body">
            Salesforce just rebuilt their entire platform as headless
            infrastructure for AI agents: APIs, not screens. Their bet is that
            the advantage sits in the data, the workflows, the business logic,
            and the trust layer underneath. The same principle applies here.
            Loop&apos;s edge is not in any single tool. It&apos;s in the clean
            data, the encoded knowledge, the reusable components, and the team
            that keeps things moving faster than any outside dependency could.
          </p>
        </div>
      </div>
    </section>
  )
}
