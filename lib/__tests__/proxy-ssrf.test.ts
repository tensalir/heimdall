import { describe, it, expect } from 'vitest'

/**
 * Tests the isAllowedUrl logic from the image proxy.
 * We re-implement the check here to test it in isolation
 * without importing the full route (which has sharp dependency).
 */

const ALLOWED_HOSTS = [
  'monday.com',
  '.monday.com',
  'monday-files.s3.amazonaws.com',
  'files-monday-com.s3.amazonaws.com',
  'figma-alpha-api.s3.us-west-2.amazonaws.com',
  's3-alpha.figma.com',
  's3-alpha-sig.figma.com',
  '.figma.com',
  'figma-alpha.s3.us-west-2.amazonaws.com',
]

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
  /^fd/,
]

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (PRIVATE_IP_PATTERNS.some((p) => p.test(parsed.hostname))) return false
    if (parsed.hostname === 'localhost') return false
    return ALLOWED_HOSTS.some((host) => {
      if (host.startsWith('.')) {
        return parsed.hostname === host.slice(1) || parsed.hostname.endsWith(host)
      }
      return parsed.hostname === host
    })
  } catch {
    return false
  }
}

describe('Image proxy SSRF protection', () => {
  it('allows Monday.com URLs', () => {
    expect(isAllowedUrl('https://monday.com/image.png')).toBe(true)
    expect(isAllowedUrl('https://cdn.monday.com/image.png')).toBe(true)
  })

  it('allows Figma CDN URLs', () => {
    expect(isAllowedUrl('https://s3-alpha.figma.com/img/abc')).toBe(true)
    expect(isAllowedUrl('https://figma-alpha-api.s3.us-west-2.amazonaws.com/img/abc')).toBe(true)
  })

  it('blocks subdomain confusion attacks', () => {
    expect(isAllowedUrl('https://notmonday.com/image.png')).toBe(false)
    expect(isAllowedUrl('https://evil-monday.com/image.png')).toBe(false)
  })

  it('blocks private IPs', () => {
    expect(isAllowedUrl('http://127.0.0.1/admin')).toBe(false)
    expect(isAllowedUrl('http://10.0.0.1/internal')).toBe(false)
    expect(isAllowedUrl('http://192.168.1.1/')).toBe(false)
    expect(isAllowedUrl('http://172.16.0.1/')).toBe(false)
    expect(isAllowedUrl('http://169.254.169.254/latest/meta-data/')).toBe(false)
  })

  it('blocks localhost', () => {
    expect(isAllowedUrl('http://localhost:3000/')).toBe(false)
    expect(isAllowedUrl('http://localhost/')).toBe(false)
  })

  it('blocks non-HTTP protocols', () => {
    expect(isAllowedUrl('ftp://monday.com/file')).toBe(false)
    expect(isAllowedUrl('file:///etc/passwd')).toBe(false)
    expect(isAllowedUrl('javascript:alert(1)')).toBe(false)
  })

  it('blocks arbitrary external hosts', () => {
    expect(isAllowedUrl('https://evil.com/payload')).toBe(false)
    expect(isAllowedUrl('https://google.com/')).toBe(false)
  })
})
