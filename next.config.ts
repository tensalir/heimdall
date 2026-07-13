import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: false,
  },
  serverExternalPackages: ['pdf-parse', 'mammoth'],
  outputFileTracingIncludes: {
    '/api/briefing-assistant/generate-briefing': ['./skills/**/*'],
  },
  async headers() {
    const baseHeaders = [
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
      },
    ]

    const defaultCsp = {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'self'",
      ].join('; '),
    }

    // The Wembley OOH preview loads three.js as an ES module from unpkg
    // (so the deliverable stays self-contained as a static file). Allow it
    // explicitly for that path only.
    const wembleyCsp = {
      key: 'Content-Security-Policy',
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        "connect-src 'self' https: wss:",
        "frame-ancestors 'self'",
      ].join('; '),
    }

    return [
      {
        source: '/:path*',
        headers: [...baseHeaders, defaultCsp],
      },
      // Listed after the default so the Wembley-specific CSP wins the
      // header-merge for paths under /wembley/*.
      {
        source: '/wembley/:path*',
        headers: [...baseHeaders, wembleyCsp],
      },
    ]
  },
}

export default nextConfig
