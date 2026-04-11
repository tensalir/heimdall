/**
 * Figma frame extraction utilities for Iterator.
 *
 * Uses the Figma REST API (server-side) to inspect frames,
 * export images, and extract layer structure for analysis.
 */

import { getFileNodes, exportNodeImages } from '../../integrations/figma/restClient'

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
    const nodes = await getFileNodes(fileKey, [nodeId])
    const node = nodes?.[nodeId]?.document
    if (!node) return null

    const children: LayerSummary[] = (node.children || []).map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
      type: c.type as string,
      x: Math.round(c.x as number || 0),
      y: Math.round(c.y as number || 0),
      width: Math.round((c.absoluteBoundingBox as Record<string, number>)?.width || c.size?.x || 0),
      height: Math.round((c.absoluteBoundingBox as Record<string, number>)?.height || c.size?.y || 0),
      visible: c.visible !== false,
      characters: c.characters as string | undefined,
    }))

    const bbox = node.absoluteBoundingBox as { width: number; height: number } | undefined
    const width = Math.round(bbox?.width || 0)
    const height = Math.round(bbox?.height || 0)

    return {
      id: nodeId,
      name: node.name as string,
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
