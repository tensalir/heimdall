/**
 * Frontify provider adapter. Asset URL generation, folder search, optional folder creation.
 */

import type { FrontifyProvider, FrontifyFolderInfo } from './types.js'
import {
  isFrontifyConfigured,
  findFolderByName,
  createLibraryFolder,
} from '../frontify/client.js'

function getDomain(): string {
  const domain = process.env.FRONTIFY_DOMAIN ?? 'loop.frontify.com'
  return domain.replace(/^https?:\/\//, '')
}

function getDocumentPath(): string {
  return process.env.FRONTIFY_DOCUMENT_PATH ?? 'document/12'
}

function getLibraryId(): string | null {
  return process.env.FRONTIFY_LIBRARY_ID ?? null
}

export const frontifyProvider: FrontifyProvider = {
  isConfigured(): boolean {
    return isFrontifyConfigured()
  },

  async healthCheck(): Promise<boolean> {
    if (!isFrontifyConfigured()) return false
    try {
      const libraryId = getLibraryId()
      if (!libraryId) return true
      await findFolderByName(libraryId, '__health_check__')
      return true
    } catch {
      return false
    }
  },

  buildAssetUrl(experimentCode: string): string {
    const domain = getDomain()
    const path = getDocumentPath().replace(/^\//, '')
    return `https://${domain}/${path}?q=${encodeURIComponent(experimentCode.trim())}`
  },

  async searchFolder(experimentCode: string): Promise<FrontifyFolderInfo | null> {
    if (!isFrontifyConfigured()) return null
    const libraryId = getLibraryId()
    if (!libraryId) return null
    const folder = await findFolderByName(libraryId, experimentCode.trim())
    return folder ? { id: folder.id, name: folder.name } : null
  },

  async createFolder(experimentCode: string): Promise<FrontifyFolderInfo | null> {
    if (!isFrontifyConfigured()) return null
    const libraryId = getLibraryId()
    if (!libraryId) return null
    const folder = await createLibraryFolder(libraryId, experimentCode.trim(), null)
    return folder ? { id: folder.id, name: folder.name } : null
  },
}
