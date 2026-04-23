import { SOFTWARE_FOR_FEW_ROWS } from '@/lib/showcase/projects'

export function SoftwareForFew() {
  return (
    <section className="sff-section">
      <div className="container">
        <div className="sff-inner">
          <div className="sff-copy">
            <span className="eyebrow">
              <span className="bar" />
              Where this plays
            </span>
            <h2 className="h-lg sff-title">
              <span className="accent-word">Software</span> for few.
            </h2>
            <p className="sff-lede">
              Off-the-shelf SaaS is too generic. A dev agency is too expensive
              for a team of ten. In that gap,{' '}
              <span className="sff-emph">
                AI lets the team build the tool themselves
              </span>{' '}
              , in days, not months, by the people who understand the problem
              best.
            </p>
          </div>
          <div
            className="sff-viz"
            role="img"
            aria-label="Software for few sits between off-the-shelf SaaS and custom dev agency work"
          >
            {SOFTWARE_FOR_FEW_ROWS.map((row) => (
              <div
                key={row.k}
                className={`sff-row sff-row--${row.variant}`}
              >
                <div className="sff-row-k">{row.k}</div>
                <div className="sff-row-v">{row.v}</div>
                <div className="sff-row-tag mono-small">{row.tag}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
