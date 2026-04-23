export function ShowcaseFooter() {
  return (
    <footer className="site" id="contact">
      <div className="container">
        <div className="row">
          <div className="site-quote-wrap">
            <h3 className="site-quote">
              <span className="site-quote-mark" aria-hidden="true">
                &ldquo;
              </span>
              What I cannot <span className="accent-word">create</span>, I do
              not understand.
            </h3>
            <div className="site-quote-attr mono-small">
              — Richard Feynman
            </div>
            <p className="site-quote-outro">
              That&apos;s the flywheel in one line. Two years of building to
              understand the work, then encoding it so the whole team can
              build from it.
            </p>
          </div>
          <div className="site-cta">
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
