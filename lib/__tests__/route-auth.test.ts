import { describe, it, expect } from 'vitest'
import { classifyApiRoute } from '../route-auth.js'

describe('classifyApiRoute', () => {
  it('classifies auth callback as public', () => {
    expect(classifyApiRoute('/api/auth/callback')).toBe('public')
  })

  it('classifies health as public', () => {
    expect(classifyApiRoute('/api/health')).toBe('public')
  })

  it('classifies webhook routes as webhook', () => {
    expect(classifyApiRoute('/api/webhooks/monday')).toBe('webhook')
  })

  it('classifies job routes as machine', () => {
    expect(classifyApiRoute('/api/jobs/queue')).toBe('machine')
    expect(classifyApiRoute('/api/jobs/complete')).toBe('machine')
  })

  it('classifies plugin routes as machine', () => {
    expect(classifyApiRoute('/api/plugin/sync')).toBe('machine')
  })

  it('classifies trend discovery as dual (user POST + cron GET)', () => {
    expect(classifyApiRoute('/api/briefing-assistant/trends/discover')).toBe('dual')
  })

  it('classifies social discovery as dual (user POST + cron GET)', () => {
    expect(classifyApiRoute('/api/briefing-assistant/social-comments/discover')).toBe('dual')
  })

  it('classifies user-facing routes as user', () => {
    expect(classifyApiRoute('/api/briefing-assistant/meta-ads')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/trends')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/source-items')).toBe('user')
    expect(classifyApiRoute('/api/feedback')).toBe('user')
    expect(classifyApiRoute('/api/forecast/runs')).toBe('user')
    expect(classifyApiRoute('/api/comments/sheet')).toBe('user')
  })

  it('classifies briefing login endpoint as public', () => {
    expect(classifyApiRoute('/api/briefing-assistant/auth')).toBe('public')
  })

  it('classifies sheets login endpoint as public', () => {
    expect(classifyApiRoute('/api/sheets/auth')).toBe('public')
  })

  it('classifies images proxy as public', () => {
    expect(classifyApiRoute('/api/images/proxy')).toBe('public')
  })

  it('defaults unknown routes to user', () => {
    expect(classifyApiRoute('/api/unknown/path')).toBe('user')
  })
})
