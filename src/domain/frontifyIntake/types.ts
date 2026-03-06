import { z } from 'zod'

export const DEFAULT_FRONTIFY_INBOX_NAME = 'Asset Submission Inbox'

export const frontifyIntakeLibrarySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  libraryId: z.string().min(1),
  inboxFolderName: z.string().min(1).default(DEFAULT_FRONTIFY_INBOX_NAME),
  enabled: z.boolean().default(true),
})

export const frontifyIntakeSettingsSchema = z.object({
  libraries: z.array(frontifyIntakeLibrarySchema).default([]),
})

export type FrontifyIntakeLibraryConfig = z.infer<typeof frontifyIntakeLibrarySchema>
export type FrontifyIntakeSettings = z.infer<typeof frontifyIntakeSettingsSchema>

export interface FrontifyIntakeAssetItem {
  id: string
  title: string
  createdAt: string
  modifiedAt: string | null
  status: string
  author: string | null
}

export interface FrontifyIntakeDayFolder {
  id: string
  name: string
  assetCount: number
  assets: FrontifyIntakeAssetItem[]
}

export interface FrontifyIntakeLibraryOverview {
  config: FrontifyIntakeLibraryConfig
  inboxFolderId: string | null
  rootAssets: FrontifyIntakeAssetItem[]
  dayFolders: FrontifyIntakeDayFolder[]
  totalAssets: number
  error?: string
}

export interface FrontifyIntakeOverviewResponse {
  hasToken: boolean
  configured: boolean
  settings: FrontifyIntakeSettings
  libraries: FrontifyIntakeLibraryOverview[]
  totals: {
    libraries: number
    dayFolders: number
    assets: number
  }
  lastSyncedAt: string
  message?: string
}
