import { build, context } from 'esbuild'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env from repo root (two levels up from packages/figma-plugin)
config({ path: resolve(__dirname, '../../.env.local') })
config({ path: resolve(__dirname, '../../.env') })

// Build stamp (git short sha + build time) so we can tell which bundle is
// actually published. Injected via --define and surfaced in the plugin UI.
let buildId
try {
  const sha = execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  buildId = sha + ' @ ' + new Date().toISOString()
} catch {
  buildId = 'unknown @ ' + new Date().toISOString()
}
console.log('[build] plugin build ' + buildId)

const define = {
  __PLUGIN_TOKEN__: JSON.stringify(process.env.HEIMDALL_PLUGIN_SECRET || ''),
  __BUILD_ID__: JSON.stringify(buildId),
}

const opts = {
  entryPoints: ['code.ts'],
  bundle: true,
  outfile: 'code.js',
  format: 'iife',
  target: 'es2017',
  define,
}

const isWatch = process.argv.includes('--watch')

if (isWatch) {
  const ctx = await context(opts)
  await ctx.watch()
  console.log('Watching...')
} else {
  await build(opts)
}
