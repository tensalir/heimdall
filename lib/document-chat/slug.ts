const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}$/

export function isValidCollectionSlug(slug: string): boolean {
  return SLUG_RE.test(slug)
}
