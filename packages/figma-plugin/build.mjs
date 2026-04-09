import { build, context } from 'esbuild'
import { config } from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env from repo root (two levels up from packages/figma-plugin)
config({ path: resolve(__dirname, '../../.env.local') })
config({ path: resolve(__dirname, '../../.env') })

const define = {
  __PLUGIN_TOKEN__: JSON.stringify(process.env.HEIMDALL_PLUGIN_SECRET || ''),
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
