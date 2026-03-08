import { describe, it, expect } from 'vitest'
import { isValidMediaUrl, thumbnailStatus } from '../media-utils.js'

describe('isValidMediaUrl', () => {
  it('rejects null and empty', () => {
    expect(isValidMediaUrl(null)).toBe(false)
    expect(isValidMediaUrl('')).toBe(false)
  })

  it('rejects data URIs', () => {
    expect(isValidMediaUrl('data:image/png;base64,abc')).toBe(false)
  })

  it('rejects internal API paths', () => {
    expect(isValidMediaUrl('/api/briefing-assistant/meta-ads/123/preview')).toBe(false)
  })

  it('rejects Meta render_ad URLs', () => {
    expect(isValidMediaUrl('https://facebook.com/ads/archive/render_ad/?id=123')).toBe(false)
  })

  it('rejects Meta library URLs', () => {
    expect(isValidMediaUrl('https://facebook.com/ads/library/?id=123')).toBe(false)
  })

  it('accepts valid HTTPS URLs', () => {
    expect(isValidMediaUrl('https://example.com/image.jpg')).toBe(true)
  })

  it('accepts valid HTTP URLs', () => {
    expect(isValidMediaUrl('http://cdn.example.com/thumb.png')).toBe(true)
  })

  it('accepts Supabase storage URLs', () => {
    expect(isValidMediaUrl('https://abc.supabase.co/storage/v1/object/public/briefing-media/thumb.jpg')).toBe(true)
  })

  it('rejects malformed URLs', () => {
    expect(isValidMediaUrl('not-a-url')).toBe(false)
  })
})

describe('thumbnailStatus', () => {
  it('returns pending for null', () => {
    expect(thumbnailStatus(null)).toBe('pending')
  })

  it('returns ready for valid URL', () => {
    expect(thumbnailStatus('https://cdn.example.com/img.jpg')).toBe('ready')
  })

  it('returns invalid for data URI', () => {
    expect(thumbnailStatus('data:image/png;base64,abc')).toBe('invalid')
  })

  it('returns invalid for render_ad URL', () => {
    expect(thumbnailStatus('https://facebook.com/ads/archive/render_ad/?id=123')).toBe('invalid')
  })
})
