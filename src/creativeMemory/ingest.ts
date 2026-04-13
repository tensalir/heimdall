/**
 * Creative Memory — ingest pipeline.
 *
 * Reads static ad images from Frontify, groups ratio siblings into
 * creative families using naming heuristics, and stores metadata
 * in the creative_families / creative_assets tables.
 *
 * Does NOT run fingerprint analysis — that is a separate step so
 * ingestion can complete quickly and analysis can run in the background.
 */

import { getSupabase } from '@/lib/supabase'
import {
  frontifyGraphql,
  type FrontifyFolder,
} from '@/src/integrations/frontify/client'
import type {
  CanonicalRatio,
  CreativeFamily,
  CreativeAsset,
  IngestFolderRequest,
} from './types.js'

// ---------------------------------------------------------------------------
// Frontify queries for image assets (extends the existing client)
// ---------------------------------------------------------------------------

interface FrontifyImageAsset {
  id: string
  title: string
  filename: string | null
  downloadUrl: string | null
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  createdAt: string
}

async function listImageAssetsInFolder(
  folderId: string,
  limit = 200,
): Promise<FrontifyImageAsset[]> {
  const data = await frontifyGraphql<{
    node?: {
      assets?: {
        items?: Array<{
          id: string
          title: string
          filename?: string | null
          downloadUrl?: string | null
          thumbnailUrl?: string | null
          width?: number | null
          height?: number | null
          createdAt: string
        }>
      }
    }
  }>(
    `query FolderImageAssets($id: ID!, $limit: Int!) {
      node(id: $id) {
        ... on SubFolder {
          assets(first: $limit) {
            items {
              ... on Image {
                id
                title
                filename
                downloadUrl(permanent: true)
                thumbnailUrl
                width
                height
                createdAt
              }
            }
          }
        }
      }
    }`,
    { id: folderId, limit },
  )
  return (data?.node?.assets?.items ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    filename: a.filename ?? null,
    downloadUrl: a.downloadUrl ?? null,
    thumbnailUrl: a.thumbnailUrl ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    createdAt: a.createdAt,
  }))
}

async function listSubfolders(parentFolderId: string): Promise<FrontifyFolder[]> {
  const data = await frontifyGraphql<{
    node?: {
      folders?: { items?: Array<{ id: string; name: string }> }
    }
  }>(
    `query SubFolders($id: ID!) {
      node(id: $id) {
        ... on SubFolder {
          folders(limit: 100) {
            items { id name }
          }
        }
      }
    }`,
    { id: parentFolderId },
  )
  return data?.node?.folders?.items ?? []
}

// ---------------------------------------------------------------------------
// Naming heuristics — derive family key and ratio from filename/title
// ---------------------------------------------------------------------------

const RATIO_PATTERNS: Array<{ pattern: RegExp; ratio: CanonicalRatio }> = [
  { pattern: /9[x×_\-.]16/i, ratio: '9x16' },
  { pattern: /4[x×_\-.]5/i, ratio: '4x5' },
  { pattern: /1[x×_\-.]1/i, ratio: '1x1' },
]

function inferRatioFromName(name: string): CanonicalRatio | null {
  for (const { pattern, ratio } of RATIO_PATTERNS) {
    if (pattern.test(name)) return ratio
  }
  return null
}

function inferRatioFromDimensions(w: number | null, h: number | null): CanonicalRatio | null {
  if (!w || !h) return null
  const r = w / h
  if (r < 0.65) return '9x16'
  if (r >= 0.65 && r < 0.9) return '4x5'
  if (r >= 0.9 && r <= 1.1) return '1x1'
  return null
}

/**
 * Derive a stable family key by stripping the ratio suffix
 * and any trailing extension from the asset title/filename.
 */
function deriveFamilyKey(name: string): string {
  let key = name.replace(/\.[^.]+$/, '') // strip extension
  for (const { pattern } of RATIO_PATTERNS) {
    key = key.replace(pattern, '')
  }
  return key.replace(/[._\-]+$/, '').trim()
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface IngestResult {
  familiesCreated: number
  assetsLinked: number
  errors: string[]
}

/**
 * Ingest a single Frontify folder into the creative memory.
 * Scans for image assets, groups them into families, and upserts records.
 */
export async function ingestFolder(request: IngestFolderRequest): Promise<IngestResult> {
  const db = getSupabase()
  if (!db) return { familiesCreated: 0, assetsLinked: 0, errors: ['Supabase not configured'] }

  const errors: string[] = []
  let familiesCreated = 0
  let assetsLinked = 0

  const assets = await listImageAssetsInFolder(request.frontifyFolderId)
  const subfolders = await listSubfolders(request.frontifyFolderId)

  // Also scan one level of subfolders (common structure: parent folder > ratio subfolders)
  for (const sub of subfolders) {
    const subAssets = await listImageAssetsInFolder(sub.id)
    assets.push(...subAssets)
  }

  if (assets.length === 0) {
    return { familiesCreated: 0, assetsLinked: 0, errors: ['No image assets found in folder'] }
  }

  // Group by family key
  const familyMap = new Map<string, FrontifyImageAsset[]>()
  for (const asset of assets) {
    const name = asset.title || asset.filename || ''
    const key = deriveFamilyKey(name)
    if (!key) {
      errors.push(`Could not derive family key for asset "${name}" (${asset.id})`)
      continue
    }
    const group = familyMap.get(key) ?? []
    group.push(asset)
    familyMap.set(key, group)
  }

  for (const [familyKey, familyAssets] of familyMap) {
    try {
      // Upsert creative family
      const { data: familyRow, error: familyErr } = await db
        .from('creative_families')
        .upsert(
          {
            family_name: familyKey,
            product: request.product ?? null,
            use_case: request.useCase ?? null,
            campaign_token: request.campaignToken ?? null,
            status: request.status,
            frontify_folder_id: request.frontifyFolderId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'family_name' },
        )
        .select('id')
        .single()

      if (familyErr || !familyRow) {
        errors.push(`Failed to upsert family "${familyKey}": ${familyErr?.message ?? 'no data'}`)
        continue
      }

      familiesCreated++

      // Upsert each ratio sibling
      for (const asset of familyAssets) {
        const name = asset.title || asset.filename || ''
        const ratio =
          inferRatioFromName(name) ??
          inferRatioFromDimensions(asset.width, asset.height) ??
          '4x5' // safe default

        const { error: assetErr } = await db
          .from('creative_assets')
          .upsert(
            {
              family_id: familyRow.id,
              ratio,
              frontify_asset_id: asset.id,
              download_url: asset.downloadUrl,
              thumbnail_url: asset.thumbnailUrl,
              width: asset.width,
              height: asset.height,
              created_at: asset.createdAt,
            },
            { onConflict: 'frontify_asset_id' },
          )

        if (assetErr) {
          errors.push(`Failed to upsert asset "${name}" (${asset.id}): ${assetErr.message}`)
        } else {
          assetsLinked++
        }
      }
    } catch (err) {
      errors.push(`Family "${familyKey}": ${(err as Error).message}`)
    }
  }

  return { familiesCreated, assetsLinked, errors }
}

/**
 * Run fingerprint analysis for families that don't have one yet.
 * Processes in small batches to stay within rate limits.
 */
export async function runPendingAnalysis(batchSize = 5): Promise<{ analyzed: number; errors: string[] }> {
  const db = getSupabase()
  if (!db) return { analyzed: 0, errors: ['Supabase not configured'] }

  const { analyzeAdImage } = await import('./fingerprint.js')
  const { buildEmbeddingText } = await import('./fingerprint.js')
  const { embedCreativeMemory } = await import('./store.js')

  // Find assets without fingerprints
  const { data: pending } = await db
    .from('creative_assets')
    .select('id, family_id, ratio, download_url, thumbnail_url, width, height')
    .is('fingerprint', null)
    .not('download_url', 'is', null)
    .limit(batchSize)

  if (!pending?.length) return { analyzed: 0, errors: [] }

  const errors: string[] = []
  let analyzed = 0

  for (const asset of pending) {
    try {
      // Load family metadata for context
      const { data: family } = await db
        .from('creative_families')
        .select('family_name, product, use_case')
        .eq('id', asset.family_id)
        .single()

      const imageUrl = asset.download_url as string
      const { fingerprint, retrievalSummary } = await analyzeAdImage(
        { url: imageUrl },
        {
          product: (family?.product as string) ?? undefined,
          useCase: (family?.use_case as string) ?? undefined,
          familyName: (family?.family_name as string) ?? undefined,
        },
      )

      const embeddingText = buildEmbeddingText(
        retrievalSummary,
        (family?.family_name as string) ?? undefined,
      )

      await db
        .from('creative_assets')
        .update({
          fingerprint: fingerprint as unknown as string,
          retrieval_summary: retrievalSummary.text,
        })
        .eq('id', asset.id)

      await embedCreativeMemory(
        asset.family_id as string,
        asset.id as string,
        embeddingText,
        {
          product: (family?.product as string) ?? null,
          useCase: (family?.use_case as string) ?? null,
          compositionArchetype: fingerprint.compositionArchetype,
          paletteMood: fingerprint.paletteMood,
        },
      )

      analyzed++
    } catch (err) {
      errors.push(`Asset ${asset.id}: ${(err as Error).message}`)
    }
  }

  return { analyzed, errors }
}
