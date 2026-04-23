export function ShowcaseFooter() {
  return (
    <footer className="site" id="contact">
      <div className="container">
        <div className="row">
          <h3>
            Generation is commoditizing. The compounding{' '}
            <span className="accent-word">advantage</span> lives in the
            intelligence going in.
          </h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <a className="btn" href="mailto:vince.buyssens@loopearplugs.com">
              Get in touch
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
              className="btn btn--ghost"
              href="https://github.com/tensalir"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
        <div className="meta-row">
          <span>© Loop Earplugs · Creative Technology · Vince Buyssens</span>
          <span>Built with Cursor + Claude Code</span>
        </div>
      </div>
    </footer>
  )
}
