/**
 * Figma frame extraction utilities for Iterator.
 *
 * Uses the Figma REST API (server-side) to inspect frames,
 * export images, and extract layer structure for analysis.
 */

import { getFileNodes, exportNodeImages } from '../../integrations/figma/restClient.js'

export interface FrameLayerData {
  id: string
  name: string
  width: number
  height: number
  children: LayerSummary[]
  detectedRatio: string | null
}

export interface LayerSummary {
  id: string
  name: string
  type: string
  x: number
  y: number
  width: number
  height: number
  visible: boolean
  characters?: string
}

const ASSET_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5': { w: 1440, h: 1800 },
  '1x1': { w: 1440, h: 1440 },
}

export function detectRatio(w: number, h: number): string | null {
  for (const [key, dim] of Object.entries(ASSET_SIZES)) {
    if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key
  }
  return null
}

export async function extractFrameData(fileKey: string, nodeId: string): Promise<FrameLayerData | null> {
  try {
    const response = await getFileNodes(fileKey, [nodeId])
    if (!response) return null

    const nodeEntry = response.nodes[nodeId]
    if (!nodeEntry?.document) return null

    const doc = nodeEntry.document as Record<string, unknown>
    const docChildren = (doc.children || []) as Array<Record<string, unknown>>

    const children: LayerSummary[] = docChildren.map((c) => {
      const bbox = c.absoluteBoundingBox as { width?: number; height?: number } | undefined
      return {
        id: c.id as string,
        name: c.name as string,
        type: c.type as string,
        x: Math.round((c.x as number) || 0),
        y: Math.round((c.y as number) || 0),
        width: Math.round(bbox?.width || 0),
        height: Math.round(bbox?.height || 0),
        visible: c.visible !== false,
        characters: c.characters as string | undefined,
      }
    })

    const bbox = doc.absoluteBoundingBox as { width?: number; height?: number } | undefined
    const width = Math.round(bbox?.width || 0)
    const height = Math.round(bbox?.height || 0)

    return {
      id: nodeId,
      name: doc.name as string,
      width,
      height,
      children,
      detectedRatio: detectRatio(width, height),
    }
  } catch (err) {
    console.error('[iterator/extraction] Failed to extract frame data:', (err as Error).message)
    return null
  }
}

export async function exportFrameAsImage(fileKey: string, nodeId: string, scale = 1): Promise<string | null> {
  try {
    const images = await exportNodeImages(fileKey, [nodeId], { format: 'png', scale })
    return images?.[nodeId] || null
  } catch {
    return null
  }
}
