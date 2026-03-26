import { describe, expect, it } from 'vitest'
import { timingSafeEqualSecret } from '../crypto-compare.js'

describe('timingSafeEqualSecret', () => {
  it('returns true for identical secrets', async () => {
    expect(await timingSafeEqualSecret('same-secret-value', 'same-secret-value')).toBe(true)
  })

  it('returns false for different secrets', async () => {
    expect(await timingSafeEqualSecret('expected', 'wrong')).toBe(false)
  })

  it('returns false for empty or missing provided', async () => {
    expect(await timingSafeEqualSecret('expected', '')).toBe(false)
    expect(await timingSafeEqualSecret('expected', null)).toBe(false)
    expect(await timingSafeEqualSecret('expected', undefined)).toBe(false)
  })
})
