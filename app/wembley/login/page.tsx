import { authenticateWembley } from './actions'

export const metadata = {
  title: 'Wembley OOH — Access',
  description:
    'Password-protected preview of the Loop x Pleasing Wembley OOH creative map.',
}

function safeNext(value: string | undefined): string {
  if (!value) return '/wembley/'
  if (!value.startsWith('/wembley')) return '/wembley/'
  if (value.startsWith('/wembley/login')) return '/wembley/'
  return value
}

export default async function WembleyLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  const hasError = error === '1'
  const nextPath = safeNext(next)

  return (
    <section className="wembley-login">
      <div className="wembley-login-panel">
        <div className="wembley-eyebrow">
          Loop x Pleasing · Wembley OOH
        </div>
        <h1 className="wembley-title">
          A private preview of the <em>creative route</em>.
        </h1>
        <p className="wembley-lede">
          39 London Underground 48-sheet placements on the route to Wembley
          Stadium, 12 Jun – 12 Jul 2026. Enter the access code to continue.
        </p>

        <form action={authenticateWembley}>
          <label className="wembley-field">
            <span className="wembley-field-label">Access code</span>
            <input
              className="wembley-input"
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
            <p className="wembley-error" role="alert">
              That code doesn&apos;t match. Try again.
            </p>
          )}
          <button className="wembley-submit" type="submit">
            Enter map
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M3 11L11 3M11 3H5M11 3v6"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>
          </button>
        </form>

        <div className="wembley-meta">
          <span>© Loop Earplugs · Pleasing</span>
          <span>v.2026.05</span>
        </div>
      </div>
    </section>
  )
}
