/**
 * Figma REST JSON -> FigmaNodeLite.
 *
 * ISOMORPHIC (pure shape translation). Kept separate from restLayerSource so a
 * plugin implementation can supply its own SceneNode -> FigmaNodeLite mapper
 * without dragging in `sharp`.
 */

import type { FigmaNodeLite, Rect } from './types.js'

interface RawRect {
  x?: number
  y?: number
  width?: number
  height?: number
}

interface RawNode {
  id: string
  name?: string
  type?: string
  /** Figma OMITS this when true. Absence means visible. */
  visible?: boolean
  /** Figma omits when 1. */
  opacity?: number
  blendMode?: string
  isMask?: boolean
  maskType?: string
  clipsContent?: boolean
  effects?: Array<{ type?: string; visible?: boolean }>
  absoluteBoundingBox?: RawRect | null
  absoluteRenderBounds?: RawRect | null
  characters?: string
  style?: Record<string, unknown>
  fills?: unknown[]
  strokes?: unknown[]
  children?: RawNode[]
}

function toRect(r: RawRect | null | undefined): Rect | null {
  if (!r || r.x == null || r.y == null || r.width == null || r.height == null) return null
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

/** A Figma Paint array with at least one visible entry. (Paints omit `visible` when true.) */
function hasVisiblePaint(paints: unknown[] | undefined): boolean {
  if (!Array.isArray(paints)) return false
  return paints.some((p) => {
    const paint = p as { visible?: boolean; type?: unknown }
    return paint != null && typeof paint.type === 'string' && paint.visible !== false
  })
}

export function normalizeFigmaNode(raw: unknown): FigmaNodeLite {
  const n = raw as RawNode
  return {
    id: n.id,
    name: n.name ?? '(unnamed)',
    type: n.type ?? 'UNKNOWN',
    // Critical: Figma only emits `visible` when it is false.
    visible: n.visible !== false,
    opacity: n.opacity ?? 1,
    blendMode: n.blendMode ?? 'NORMAL',
    isMask: n.isMask === true,
    maskType: n.maskType as FigmaNodeLite['maskType'],
    clipsContent: n.clipsContent === true,
    effectTypes: (n.effects ?? [])
      .filter((e) => e.visible !== false && typeof e.type === 'string')
      .map((e) => e.type as string),
    absoluteBoundingBox: toRect(n.absoluteBoundingBox),
    absoluteRenderBounds: toRect(n.absoluteRenderBounds),
    characters: n.characters,
    style: n.style,
    fills: n.fills,
    paintsOwnBackground: hasVisiblePaint(n.fills) || hasVisiblePaint(n.strokes),
    children: (n.children ?? []).map(normalizeFigmaNode),
  }
}

/** Depth-first walk, parents before children. */
export function walk(n: FigmaNodeLite, fn: (node: FigmaNodeLite, depth: number) => void, depth = 0): void {
  fn(n, depth)
  for (const c of n.children) walk(c, fn, depth + 1)
}
