/**
 * Frontify GraphQL API client for Heimdall.
 * Used for asset linking: list folders, optionally create folder for experiment code.
 */

const FRONTIFY_RETRY_ATTEMPTS = 3
const FRONTIFY_RETRY_BASE_MS = 2000

function getFrontifyToken(): string | null {
  return process.env.FRONTIFY_ACCESS_TOKEN ?? process.env.FRONTIFY_API_KEY ?? null
}

function getFrontifyDomain(): string {
  const domain = process.env.FRONTIFY_DOMAIN ?? 'loop.frontify.com'
  return domain.replace(/^https?:\/\//, '')
}

function getGraphqlUrl(): string {
  return `https://${getFrontifyDomain()}/graphql`
}

export interface FrontifyFolder {
  id: string
  name: string
}

/**
 * Run GraphQL operation against Frontify. Returns null if token missing.
 * Retries with backoff on 429 (rate limit).
 */
export async function frontifyGraphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T | null> {
  const token = getFrontifyToken()
  if (!token) return null
  const url = getGraphqlUrl()
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= FRONTIFY_RETRY_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    })
    if (res.status === 429 && attempt < FRONTIFY_RETRY_ATTEMPTS) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter
        ? Math.min(Number(retryAfter) * 1000, 30000)
        : FRONTIFY_RETRY_BASE_MS * attempt
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }
    if (!res.ok) {
      lastError = new Error(`Frontify API error: ${res.status} ${res.statusText}`)
      throw lastError
    }
    const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
    if (json.errors?.length) {
      lastError = new Error(`Frontify GraphQL: ${json.errors.map((e) => e.message).join('; ')}`)
      throw lastError
    }
    return json.data ?? null
  }
  throw lastError ?? new Error('Frontify API: rate limited')
}

/**
 * List top-level folders in a library (browse root).
 */
export async function getLibraryFolders(libraryId: string): Promise<FrontifyFolder[]> {
  const data = await frontifyGraphql<{
    library?: {
      browse?: {
        folders?: { items?: Array<{ id: string; name: string }> }
      }
    }
  }>(
    `query GetLibraryFolders($libraryId: ID!) {
      library(id: $libraryId) {
        browse {
          folders(limit: 100) {
            items {
              id
              name
            }
          }
        }
      }
    }`,
    { libraryId }
  )
  const items = data?.library?.browse?.folders?.items
  return items ?? []
}

/**
 * Find a folder in the library root by exact name match.
 */
export async function findFolderByName(
  libraryId: string,
  name: string
): Promise<FrontifyFolder | null> {
  const folders = await getLibraryFolders(libraryId)
  const normalized = name.trim()
  return folders.find((f) => f.name.trim() === normalized) ?? null
}

/**
 * Create a subfolder in the library root.
 * Mutation name may vary by Frontify version; if the API does not support
 * folder creation, returns null and callers fall back to URL-only mode.
 */
export async function createLibraryFolder(
  libraryId: string,
  folderName: string,
  parentFolderId?: string | null
): Promise<FrontifyFolder | null> {
  try {
    // Frontify GraphQL may expose createLibrarySubFolder or similar.
    // Attempt common mutation shape; adjust if introspection shows different name.
    const data = await frontifyGraphql<{
      createLibrarySubFolder?: { folder?: { id: string; name: string } }
    }>(
      `mutation CreateLibrarySubFolder($libraryId: ID!, $name: String!, $parentFolderId: ID) {
        createLibrarySubFolder(input: { libraryId: $libraryId, name: $name, parentFolderId: $parentFolderId }) {
          folder {
            id
            name
          }
        }
      }`,
      { libraryId, name: folderName, parentFolderId: parentFolderId ?? null }
    )
    const folder = data?.createLibrarySubFolder?.folder
    return folder ? { id: folder.id, name: folder.name } : null
  } catch {
    // Mutation may not exist or have different shape; fall back to URL-only mode
    return null
  }
}

export function isFrontifyConfigured(): boolean {
  return !!getFrontifyToken()
}
