/**
 * Default Heimdall API origin (no trailing slash).
 * Users can override via plugin Settings (persisted in figma.clientStorage).
 */
export const DEFAULT_HEIMDALL_API =
  'https://bifrost-rose.vercel.app'

/**
 * Default plugin token (matches HEIMDALL_PLUGIN_SECRET on Vercel).
 * Injected at build time via esbuild --define. Empty string if not set.
 */
declare const __PLUGIN_TOKEN__: string
export const DEFAULT_PLUGIN_TOKEN: string =
  typeof __PLUGIN_TOKEN__ !== 'undefined' ? __PLUGIN_TOKEN__ : ''
