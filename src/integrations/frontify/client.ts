/**
 * Frontify GraphQL API client for Heimdall.
 * Used for asset linking: list folders, optionally create folder for experiment code.
 */

import {
  DEFAULT_FRONTIFY_INBOX_NAME,
  type FrontifyIntakeAssetItem,
  type FrontifyIntakeDayFolder,
} from '../../domain/frontifyIntake/types.js'

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

interface FrontifyFolderContents {
  id: string
  name: string
  folders: FrontifyFolder[]
  assets: FrontifyIntakeAssetItem[]
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
    const data = await frontifyGraphql<{
      createFolder?: { folder?: { id: string; name: string } }
    }>(
      `mutation CreateFolder($parentId: ID!, $name: String!) {
        createFolder(input: { parentId: $parentId, name: $name }) {
          folder {
            id
            name
          }
        }
      }`,
      { parentId: parentFolderId ?? libraryId, name: folderName }
    )
    const folder = data?.createFolder?.folder
    return folder ? { id: folder.id, name: folder.name } : null
  } catch {
    // Keep callers resilient if folder creation is unavailable in a given instance.
    return null
  }
}

function mapAssetItem(asset: {
  id: string
  title: string
  createdAt: string
  modifiedAt?: string | null
  status: string
  author?: string | null
}): FrontifyIntakeAssetItem {
  return {
    id: asset.id,
    title: asset.title,
    createdAt: asset.createdAt,
    modifiedAt: asset.modifiedAt ?? null,
    status: asset.status,
    author: asset.author ?? null,
  }
}

function sortAssetsByCreatedAt<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function sortDayFolders(items: FrontifyIntakeDayFolder[]): FrontifyIntakeDayFolder[] {
  return [...items].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
}

/**
 * Read a Frontify folder (SubFolder) and return its child folders plus asset items.
 */
export async function getFolderContents(folderId: string): Promise<FrontifyFolderContents | null> {
  const data = await frontifyGraphql<{
    node?: {
      id: string
      name?: string
      folders?: { items?: Array<{ id: string; name: string }> }
      assets?: {
        items?: Array<{
          id: string
          title: string
          createdAt: string
          modifiedAt?: string | null
          status: string
          author?: string | null
        }>
      }
    }
  }>(
    `query GetFolderContents($folderId: ID!) {
      node(id: $folderId) {
        id
        ... on SubFolder {
          name
          folders(limit: 100) {
            items {
              id
              name
            }
          }
          assets(limit: 100) {
            items {
              id
              title
              createdAt
              modifiedAt
              status
              author
            }
          }
        }
      }
    }`,
    { folderId }
  )

  const node = data?.node
  if (!node?.name) return null

  return {
    id: node.id,
    name: node.name,
    folders: node.folders?.items ?? [],
    assets: sortAssetsByCreatedAt((node.assets?.items ?? []).map(mapAssetItem)),
  }
}

/**
 * Read the auto-created Asset Submission Inbox and return dated subfolders + assets.
 * This powers Heimdall's operator-facing intake overview.
 */
export async function getSubmissionInboxOverview(
  libraryId: string,
  inboxFolderName = DEFAULT_FRONTIFY_INBOX_NAME
): Promise<{
  inboxFolderId: string | null
  rootAssets: FrontifyIntakeAssetItem[]
  dayFolders: FrontifyIntakeDayFolder[]
  totalAssets: number
}> {
  const inboxFolder = await findFolderByName(libraryId, inboxFolderName)
  if (!inboxFolder) {
    return {
      inboxFolderId: null,
      rootAssets: [],
      dayFolders: [],
      totalAssets: 0,
    }
  }

  const inboxContents = await getFolderContents(inboxFolder.id)
  if (!inboxContents) {
    return {
      inboxFolderId: inboxFolder.id,
      rootAssets: [],
      dayFolders: [],
      totalAssets: 0,
    }
  }

  const dayFolderContents = await Promise.all(
    inboxContents.folders.map(async (folder) => {
      const contents = await getFolderContents(folder.id)
      return contents
        ? {
            id: contents.id,
            name: contents.name,
            assetCount: contents.assets.length,
            assets: contents.assets,
          }
        : {
            id: folder.id,
            name: folder.name,
            assetCount: 0,
            assets: [],
          }
    })
  )

  const rootAssets = inboxContents.assets
  const dayFolders = sortDayFolders(dayFolderContents)
  const totalAssets =
    rootAssets.length + dayFolders.reduce((sum, folder) => sum + folder.assetCount, 0)

  return {
    inboxFolderId: inboxFolder.id,
    rootAssets,
    dayFolders,
    totalAssets,
  }
}

export function isFrontifyConfigured(): boolean {
  return !!getFrontifyToken()
}
