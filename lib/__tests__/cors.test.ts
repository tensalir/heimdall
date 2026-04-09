import { describe, expect, it } from 'vitest'
import { resolveCorsOrigin } from '../cors.js'

describe('resolveCorsOrigin', () => {
  it('allows explicit configured origins', () => {
    expect(
      resolveCorsOrigin('https://internal.example.com', 'https://bifrost-rose.vercel.app', ['https://internal.example.com'])
    ).toBe('https://internal.example.com')
  })

  it('allows figma origins for plugin requests', () => {
    expect(resolveCorsOrigin('https://www.figma.com', 'https://bifrost-rose.vercel.app')).toBe('https://www.figma.com')
    expect(resolveCorsOrigin('https://figma.com', 'https://bifrost-rose.vercel.app')).toBe('https://figma.com')
  })

  it('allows vercel app origins', () => {
    expect(resolveCorsOrigin('https://preview-123.vercel.app', 'https://bifrost-rose.vercel.app')).toBe('https://preview-123.vercel.app')
  })

  it('allows same-origin requests', () => {
    expect(resolveCorsOrigin('https://bifrost-rose.vercel.app', 'https://bifrost-rose.vercel.app')).toBe('https://bifrost-rose.vercel.app')
  })

  it('rejects unknown origins', () => {
    expect(resolveCorsOrigin('https://evil.example.com', 'https://bifrost-rose.vercel.app')).toBe('')
  })
})
