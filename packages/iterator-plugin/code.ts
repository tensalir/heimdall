/**
 * Iterator Figma plugin — command router.
 * Each menu command maps to a dedicated handler in src/commands/.
 * esbuild bundles this into code.js (iife format).
 */

import { runIterate } from './src/commands/iterate'
import { runGenerate } from './src/commands/generate'
import { runDeriveVariants } from './src/commands/deriveVariants'

const command = figma.command

if (command === 'iterate') {
  runIterate()
} else if (command === 'generate') {
  runGenerate()
} else if (command === 'derive-variants') {
  runDeriveVariants()
} else {
  runIterate()
}
