/**
 * Job and sync record types for idempotency and audit.
 */

export type PendingSyncJobState = 'queued' | 'running' | 'completed' | 'failed'

export interface PendingSyncJob {
  id: string
  /** Idempotency: monday:itemId:statusTransitionId */
  idempotencyKey: string
  mondayItemId: string
  mondayBoardId: string
  batchCanonical: string
  figmaFileKey: string | null
  expectedFileName: string
  /** Experiment page name for Figma */
  experimentPageName: string
  /** Briefing payload for template fill (sectionName, etc.); kept for backward compat */
  briefingPayload: unknown
  /** Pre-computed text node name → value (from mapping agent); plugin applies by node.name */
  nodeMapping?: Array<{ nodeName: string; value: string }>
  /** Pre-computed frame renames (e.g. NAME-EXP-4x5 → {experimentName}-A-4x5) */
  frameRenames?: Array<{ oldName: string; newName: string }>
  /** Image attachments from Monday file columns / briefing doc; plugin fetches & imports into Figma */
  images?: Array<{ url: string; name: string; source: string; assetId?: string }>
  /** URL references from the Monday doc Reference section; plugin renders them as text in Figma */
  referenceLinks?: Array<{ url: string; label?: string; source: string }>
  state: PendingSyncJobState
  createdAt: string
  updatedAt: string
  /** Set when completed via plugin */
  figmaPageId?: string | null
  figmaFileUrl?: string | null
  errorCode?: string | null
}

export interface SyncRecord {
  mondayItemId: string
  mondayBoardId: string
  batchCanonical: string
  figmaFileKey: string | null
  figmaPageId: string | null
  jobState: PendingSyncJobState
  lastRunAt: string
  errorCode: string | null
  idempotencyKey: string
}
