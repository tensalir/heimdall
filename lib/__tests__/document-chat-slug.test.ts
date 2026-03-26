import { describe, expect, it } from 'vitest'
import { isValidCollectionSlug } from '../document-chat/slug.js'

describe('isValidCollectionSlug', () => {
  it('accepts valid slugs', () => {
    expect(isValidCollectionSlug('loop-policies')).toBe(true)
    expect(isValidCollectionSlug('a')).toBe(true)
    expect(isValidCollectionSlug('doc42')).toBe(true)
  })

  it('rejects invalid slugs', () => {
    expect(isValidCollectionSlug('')).toBe(false)
    expect(isValidCollectionSlug('-bad')).toBe(false)
    expect(isValidCollectionSlug('UPPER')).toBe(false)
    expect(isValidCollectionSlug('a'.repeat(64))).toBe(false)
  })
})
