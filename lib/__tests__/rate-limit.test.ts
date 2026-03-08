import { describe, it, expect } from 'vitest'
import { checkRateLimit, getClientIp } from '../rate-limit.js'

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`
    const result = checkRateLimit(key, 3, 60_000)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks after max attempts', () => {
    const key = `test-block-${Date.now()}`
    checkRateLimit(key, 2, 60_000)
    checkRateLimit(key, 2, 60_000)
    const result = checkRateLimit(key, 2, 60_000)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterMs).toBeGreaterThan(0)
  })

  it('uses separate windows for different keys', () => {
    const key1 = `test-sep-a-${Date.now()}`
    const key2 = `test-sep-b-${Date.now()}`
    checkRateLimit(key1, 1, 60_000)
    const r1 = checkRateLimit(key1, 1, 60_000)
    const r2 = checkRateLimit(key2, 1, 60_000)
    expect(r1.allowed).toBe(false)
    expect(r2.allowed).toBe(true)
  })
})

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.1' },
    })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('returns unknown when no IP headers', () => {
    const req = new Request('http://localhost')
    expect(getClientIp(req)).toBe('unknown')
  })
})
