/**
 * Provider adapter interfaces for Monday, Figma, Frontify.
 * Tools depend on these ports; implementations wrap vendor clients.
 */

// Re-export contract types used by providers
import type { IntegrationError } from '../../contracts/integrations.js'

/** Result of a provider call that may fail with a typed error. */
export type ProviderResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IntegrationError }

// ---------------------------------------------------------------------------
//  Monday
// ---------------------------------------------------------------------------

/** Monday.com provider port. Wraps GraphQL and item fetch. */
export interface MondayProvider {
  /** Run a GraphQL query. Returns null if token missing or on API error. */
  graphql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T | null>
  /** Whether the provider is configured (token present). */
  isConfigured(): boolean
}

// ---------------------------------------------------------------------------
//  Figma (shapes match restClient for adapter reuse)
// ---------------------------------------------------------------------------

export interface FigmaFileMeta {
  name: string
  document?: { id: string; name?: string; type?: string; children?: unknown[] }
  version?: string
}

export interface FigmaProject {
  id: string
  name: string
}

export interface FigmaProjectFile {
  key: string
  name: string
  last_modified?: string
  thumbnail_url?: string
}

/** Figma REST provider port. Read-only file/project access. */
export interface FigmaProvider {
  getFile(
    fileKey: string,
    options?: { depth?: number; ids?: string[] }
  ): Promise<FigmaFileMeta | null>
  getTeamProjects(teamId: string): Promise<FigmaProject[]>
  getProjectFiles(projectId: string): Promise<FigmaProjectFile[]>
  hasReadAccess(): boolean
}

// ---------------------------------------------------------------------------
//  Frontify (asset linking + optional folder creation)
// ---------------------------------------------------------------------------

export interface FrontifyFolderInfo {
  id: string
  name: string
}

/** Frontify provider port. Asset URL generation, folder search, optional folder creation. */
export interface FrontifyProvider {
  isConfigured(): boolean
  healthCheck(): Promise<boolean>
  /** Build the Frontify asset link URL for an experiment code (e.g. EXP-LM179). */
  buildAssetUrl(experimentCode: string): string
  /** Search library root for a folder matching the experiment code. Returns null if not configured. */
  searchFolder(experimentCode: string): Promise<FrontifyFolderInfo | null>
  /** Create a folder in the library root for the experiment code. Returns null if not configured or API unsupported. */
  createFolder(experimentCode: string): Promise<FrontifyFolderInfo | null>
}
