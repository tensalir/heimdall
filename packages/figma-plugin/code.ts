/**
 * Heimdall Figma plugin — command router.
 * Each menu command maps to a dedicated handler in src/commands/.
 * esbuild bundles this into code.js (iife format).
 */

import { runSyncBriefings } from './src/commands/syncBriefings'
import { runExportComments } from './src/commands/exportComments'
import { runLocalization } from './src/commands/localization'
import { BUILD_ID } from './src/constants'

// Log the live build id on every launch so "which bundle is published?" is
// answerable from Plugins → Development → Open console.
console.log('[Heimdall] plugin build ' + BUILD_ID)

const command = figma.command

if (command === 'sync-briefings') {
  runSyncBriefings()
} else if (command === 'export-comments') {
  runExportComments()
} else if (command === 'localization') {
  runLocalization()
} else {
  // Default: show sync UI (backward compat when run without menu)
  runSyncBriefings()
}
