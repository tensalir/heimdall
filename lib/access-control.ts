const DEFAULT_PRIVILEGED_EMAIL_DOMAINS = 'thoughtform.co,loopearplugs.com'

function parseCommaSeparatedLower(raw: string | undefined, fallback = ''): string[] {
  const source = raw && raw.trim() ? raw : fallback
  return source
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function getPrivilegedEmailDomains(): string[] {
  return parseCommaSeparatedLower(
    process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS
      ?? process.env.HEIMDALL_ALLOWED_EMAIL_DOMAINS,
    DEFAULT_PRIVILEGED_EMAIL_DOMAINS,
  )
}

function getBriefingOnlyEmails(): string[] {
  return parseCommaSeparatedLower(
    process.env.NEXT_PUBLIC_HEIMDALL_BRIEFING_ONLY_USERS
      ?? process.env.HEIMDALL_BRIEFING_ONLY_USERS,
  )
}

export function isAdminRole(userMetadata: Record<string, unknown> | undefined): boolean {
  return userMetadata?.role === 'admin'
}

export function isPrivilegedEmail(email: string | undefined): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return getPrivilegedEmailDomains().includes(domain ?? '')
}

export function isBriefingOnlyUser(email: string | undefined): boolean {
  if (!email) return false
  return getBriefingOnlyEmails().includes(email.toLowerCase())
}

export function hasFullAccess(
  userMetadata: Record<string, unknown> | undefined,
  email: string | undefined,
): boolean {
  return isAdminRole(userMetadata) || (isPrivilegedEmail(email) && !isBriefingOnlyUser(email))
}
