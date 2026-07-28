/**
 * Structural guard for the `/api/plugin/localization/*` broker routes.
 *
 * Middleware classifies these as 'user_token' and only verifies that a bearer
 * header is PRESENT — resolving the token there would put a database lookup on
 * the Edge for every request. So a handler that skips `requirePluginUser` is
 * reachable by anyone who sends `Authorization: Bearer anything`. This test
 * fails the build rather than leaving that to review.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { classifyApiRoute } from '../route-auth.js'

const BROKER_DIR = path.resolve(process.cwd(), 'app/api/plugin/localization')

function findRouteFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...findRouteFiles(full))
    else if (entry.name === 'route.ts') out.push(full)
  }
  return out
}

describe('localization broker routes are authenticated by construction', () => {
  const routes = findRouteFiles(BROKER_DIR)

  it('finds the expected routes (guards against a silently empty sweep)', () => {
    const names = routes.map((r) => path.basename(path.dirname(r))).sort()
    expect(names).toEqual(['approve', 'extract', 'import', 'locale-package', 'pack', 'sheet'])
  })

  it.each(routes.map((r) => [path.basename(path.dirname(r)), r] as const))(
    '%s route goes through brokerRoute',
    (_name, file) => {
      const src = fs.readFileSync(file, 'utf8')
      expect(src).toContain('brokerRoute')

      // A bare `export async function POST` would bypass requirePluginUser.
      const bare = src.match(/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)/g)
      expect(bare, `${file} declares a handler outside brokerRoute`).toBeNull()

      const wrapped = src.match(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*brokerRoute\(/g)
      expect(wrapped, `${file} exports no brokerRoute-wrapped handler`).not.toBeNull()
    },
  )

  it.each(routes.map((r) => [path.basename(path.dirname(r))] as const))(
    '%s is classified user_token, not machine',
    (name) => {
      // If this ever reports 'machine', the shared secret baked into the plugin
      // bundle would be accepted for these routes.
      expect(classifyApiRoute(`/api/plugin/localization/${name}`)).toBe('user_token')
    },
  )
})
