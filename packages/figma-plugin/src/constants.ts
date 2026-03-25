/**
 * Default Heimdall API origin (no trailing slash).
 * Users can override via plugin Settings (persisted in figma.clientStorage).
 */
export const DEFAULT_HEIMDALL_API =
  'https://bifrost-rose.vercel.app'

/**
 * Default plugin token (matches HEIMDALL_PLUGIN_SECRET on Vercel).
 * Used when figma.clientStorage has no saved token yet.
 */
export const DEFAULT_PLUGIN_TOKEN =
  'aefd1d4c24c0af7139ee2f2338926f9459aa40d33209fef9c8edf52d83f41575'

/**
 * Default Vercel Deployment Protection bypass secret.
 * Appended as ?x-vercel-protection-bypass=... to skip SSO gate.
 */
export const DEFAULT_VERCEL_BYPASS =
  '0MtafaprhUZvqLK754AGoKpaNpnIz3yK'
