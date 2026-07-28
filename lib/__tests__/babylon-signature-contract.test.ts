/**
 * Cross-repo signature contract with Babylon.
 *
 * Heimdall signs; Babylon verifies. The two implementations live in separate
 * repositories and share no code, so nothing but these fixed vectors keeps
 * them in step. The IDENTICAL vectors are asserted on the Babylon side in
 * src/lib/localization/plugin-auth.test.ts against its `signPluginRequest`.
 *
 * If either side changes how it builds the canonical string, its own test
 * fails here — instead of the mismatch surfacing as an unexplained 401 in
 * production, long after the change.
 *
 * Canonical string: `${timestamp}.${METHOD}.${pathAndQuery}.${rawBody}`
 */
import { describe, it, expect } from 'vitest'
import { babylonCanonicalString, signBabylonRequest } from '../babylon-plugin-client.js'

const SECRET = 'test-secret'
const TS = '1700000000000'

describe('Babylon signature contract', () => {
  it('POST with a body', async () => {
    await expect(
      signBabylonRequest(SECRET, TS, 'POST', '/api/localization/plugin/extract', '{"project_id":"p1"}'),
    ).resolves.toBe('9618eb4d1c014c021b60c28398e1e78dd8ba7f56a51e396529c28423f1e2d28f')
  })

  it('GET with a query string and empty body', async () => {
    await expect(
      signBabylonRequest(SECRET, TS, 'GET', '/api/localization/plugin/pack?projectId=abc', ''),
    ).resolves.toBe('c591b4473c7bf87d56628d44f4787c8902e93495d3d9cbd0d07b200c9373b1c0')
  })

  it('GET with multiple query params', async () => {
    await expect(
      signBabylonRequest(SECRET, TS, 'GET', '/api/localization/plugin/locale-package?runId=r1&langs=nl', ''),
    ).resolves.toBe('0bc202e2628c4394e246f7eb4d4f646ba4eabd98da22c8b005e90e9d61913597')
  })

  it('normalizes method casing the same way Babylon does', () => {
    expect(babylonCanonicalString(TS, 'post', '/x', '')).toBe(babylonCanonicalString(TS, 'POST', '/x', ''))
  })

  it('includes the query string — dropping it would let one signature cover every read', () => {
    expect(babylonCanonicalString(TS, 'GET', '/p?a=1', '')).not.toBe(
      babylonCanonicalString(TS, 'GET', '/p?a=2', ''),
    )
  })

  it('binds the method, so a GET signature cannot be replayed as a POST', () => {
    expect(babylonCanonicalString(TS, 'GET', '/p', '')).not.toBe(babylonCanonicalString(TS, 'POST', '/p', ''))
  })
})
