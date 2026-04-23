import { authenticateShowcase } from './actions'

export const metadata = {
  title: 'Creative Technology Showcase',
  description: 'Password-protected preview for Loop Earplugs leadership.',
}

export default async function ShowcaseLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const hasError = error === '1'
  const nextPath = next && next.startsWith('/showcase') ? next : '/showcase'

  return (
    <section className="ns-section sl-section" id="login">
      <div className="container sl-container">
        <div className="sl-panel">
          <div className="sl-eyebrow-row">
            <span className="eyebrow">
              <span className="bar" />
              Creative Technology · Loop Earplugs
            </span>
            <span className="eyebrow muted">Access required</span>
          </div>

          <h1 className="h-xl sl-title">
            Creative Technology{' '}
            <span className="accent-word">Showcase</span>.
          </h1>

          <p className="lede sl-lede">
            A private preview of the four tools, the flywheel behind them,
            and the proposal for how Loop scales this as operating
            infrastructure. Enter the access code to continue.
          </p>

          <form action={authenticateShowcase} className="sl-form">
            <label className="sl-field">
              <span className="eyebrow sl-field-label">Access code</span>
              <input
                className="sl-input"
                type="password"
                name="password"
                autoComplete="off"
                autoFocus
                required
                placeholder="Enter access code"
                aria-invalid={hasError || undefined}
              />
            </label>
            <input type="hidden" name="next" value={nextPath} />
            {hasError && (
              <div className="sl-error" role="alert">
                That code doesn&apos;t match. Try again.
              </div>
            )}
            <div className="sl-actions">
              <button className="btn sl-submit" type="submit">
                Enter showcase
                <svg className="arr" width="14" height="14" viewBox="0 0 14 14">
                  <path
                    d="M3 11L11 3M11 3H5M11 3v6"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    fill="none"
                  />
                </svg>
              </button>
              <span className="sl-hint mono-small">
                No account needed. Shared code, single field.
              </span>
            </div>
          </form>
        </div>

        <div className="sl-meta">
          <span>© Loop Earplugs · Creative Technology · Vince Buyssens</span>
          <span>v.2026.04</span>
        </div>
      </div>
    </section>
  )
}
