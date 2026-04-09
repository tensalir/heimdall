import { describe, it, expect } from 'vitest'
import { classifyApiRoute } from '@/lib/route-auth'
import {
  MIMIR_TEXT_MODEL,
  MAPPING_MODEL,
  MIMIR_IMAGE_MODEL,
  MIMIR_BRIEFING_MAX_TOKENS,
  MIMIR_ANALYSIS_MAX_TOKENS,
} from './models'
import {
  DATASOURCE_IDS,
  UI_DATASOURCE_IDS,
  validateDatasourceIds,
} from './datasources'
import { customerInsightsAdapter } from './sources/customerInsightsAdapter'

describe('Mimir model configuration', () => {
  it('text model is a valid Anthropic model string', () => {
    expect(MIMIR_TEXT_MODEL).toMatch(/^claude-/)
  })

  it('mapping model is Opus for extended thinking', () => {
    expect(MAPPING_MODEL).toMatch(/^claude-opus/)
  })

  it('image model is Gemini-based', () => {
    expect(MIMIR_IMAGE_MODEL).toMatch(/gemini/)
  })

  it('token limits are within reasonable bounds', () => {
    expect(MIMIR_BRIEFING_MAX_TOKENS).toBeGreaterThanOrEqual(1024)
    expect(MIMIR_BRIEFING_MAX_TOKENS).toBeLessThanOrEqual(8192)
    expect(MIMIR_ANALYSIS_MAX_TOKENS).toBeGreaterThanOrEqual(512)
    expect(MIMIR_ANALYSIS_MAX_TOKENS).toBeLessThanOrEqual(4096)
  })
})

describe('Mimir evidence pipeline', () => {
  it('canonical datasource IDs include the real adapters', () => {
    expect(DATASOURCE_IDS).toContain('ad_performance')
    expect(DATASOURCE_IDS).toContain('social_comments')
    expect(DATASOURCE_IDS).toContain('prior_briefings')
  })

  it('UI datasource IDs exclude static_fallback', () => {
    expect(UI_DATASOURCE_IDS).not.toContain('static_fallback')
  })

  it('validateDatasourceIds filters invalid IDs', () => {
    const result = validateDatasourceIds(['ad_performance', 'bogus', 'social_comments'])
    expect(result).toEqual(['ad_performance', 'social_comments'])
  })

  it('customer insights adapter returns empty (not stubbed data)', async () => {
    const evidence = await customerInsightsAdapter.getEvidence({})
    expect(evidence).toEqual([])
  })
})

describe('Mimir route auth classification', () => {
  it('briefing-assistant API routes default to user policy', () => {
    expect(classifyApiRoute('/api/briefing-assistant/generate-briefing')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/send-to-monday')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/meta-ads')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/generate-asset')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/analysis')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/angles')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/board-items')).toBe('user')
    expect(classifyApiRoute('/api/briefing-assistant/source-items')).toBe('user')
  })

  it('briefing auth is public (password login endpoint)', () => {
    expect(classifyApiRoute('/api/briefing-assistant/auth')).toBe('public')
  })

  it('discovery endpoints are dual-auth (user + machine)', () => {
    expect(classifyApiRoute('/api/briefing-assistant/trends/discover')).toBe('dual')
    expect(classifyApiRoute('/api/briefing-assistant/social-comments/discover')).toBe('dual')
  })
})
