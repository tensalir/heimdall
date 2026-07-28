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

  describe('plugin localization routes use per-user tokens, not the shared secret', () => {
    // These paths are nested under /api/plugin/, which is a MACHINE prefix.
    // If the user_token check is ever moved below MACHINE_PREFIXES,
    // first-match-wins silently downgrades them to accepting the shared secret
    // that ships inside the plugin bundle. These tests are the tripwire.
    it('classifies localization routes as user_token', () => {
      expect(classifyApiRoute('/api/plugin/localization/pack')).toBe('user_token')
      expect(classifyApiRoute('/api/plugin/localization/extract')).toBe('user_token')
      expect(classifyApiRoute('/api/plugin/localization/import')).toBe('user_token')
    })

    it('does NOT fall through to machine despite sitting under /api/plugin/', () => {
      expect(classifyApiRoute('/api/plugin/localization/anything')).not.toBe('machine')
    })

    it('leaves sibling plugin routes on the shared-secret policy', () => {
      expect(classifyApiRoute('/api/plugin/briefings')).toBe('machine')
      expect(classifyApiRoute('/api/plugin/iterator/generate')).toBe('machine')
    })

    it('leaves the pairing handshake public — it is how a token is obtained', () => {
      expect(classifyApiRoute('/api/plugin/pair/start')).toBe('public')
      expect(classifyApiRoute('/api/plugin/pair/poll')).toBe('public')
    })
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

  it('classifies GPT Actions OpenAPI as public', () => {
    expect(classifyApiRoute('/api/gpt-actions/openapi')).toBe('public')
  })

  it('classifies GPT Actions operations as gpt_actions', () => {
    expect(classifyApiRoute('/api/gpt-actions/search')).toBe('gpt_actions')
    expect(classifyApiRoute('/api/gpt-actions/answer')).toBe('gpt_actions')
  })
})
