import { afterEach, describe, expect, it } from 'vitest'
import {
  hasFullAccess,
  isBriefingOnlyUser,
  isPrivilegedEmail,
} from '../access-control.js'

const ORIGINAL_ALLOWED_DOMAINS = process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS
const ORIGINAL_BRIEFING_ONLY_USERS = process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS

afterEach(() => {
  if (ORIGINAL_ALLOWED_DOMAINS === undefined) {
    delete process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS
  } else {
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS = ORIGINAL_ALLOWED_DOMAINS
  }

  if (ORIGINAL_BRIEFING_ONLY_USERS === undefined) {
    delete process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS
  } else {
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS = ORIGINAL_BRIEFING_ONLY_USERS
  }
})

describe('access-control', () => {
  it('treats allowed email domains as privileged', () => {
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS = 'loopearplugs.com'

    expect(isPrivilegedEmail('vince.buyssens@loopearplugs.com')).toBe(true)
    expect(isPrivilegedEmail('vince@example.com')).toBe(false)
  })

  it('respects the explicit briefing-only allowlist', () => {
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS = 'briefing.only@loopearplugs.com'

    expect(isBriefingOnlyUser('briefing.only@loopearplugs.com')).toBe(true)
    expect(isBriefingOnlyUser('vince.buyssens@loopearplugs.com')).toBe(false)
  })

  it('grants full access to privileged users who are not briefing-only', () => {
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS = 'loopearplugs.com'
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS = 'briefing.only@loopearplugs.com'

    expect(hasFullAccess({ role: 'user' }, 'vince.buyssens@loopearplugs.com')).toBe(true)
  })

  it('keeps briefing-only users out of full access without admin role', () => {
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS = 'loopearplugs.com'
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS = 'briefing.only@loopearplugs.com'

    expect(hasFullAccess({ role: 'user' }, 'briefing.only@loopearplugs.com')).toBe(false)
  })

  it('always grants full access to admins', () => {
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS = ''
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS = 'admin@elsewhere.com'

    expect(hasFullAccess({ role: 'admin' }, 'admin@elsewhere.com')).toBe(true)
  })
})
