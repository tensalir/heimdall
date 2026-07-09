/**
 * Figma -> PSD export: shared types and the LayerSource seam.
 *
 * ISOMORPHIC. This module and its siblings (blendMode, geometry, flatten,
 * buildPsd, concurrency) must run unchanged in Node and in a Figma plugin
 * iframe. No `sharp`, no `Buffer`, no `node:*`.
 *
 * Why: a plugin fallback cannot ship 200 full-scale layer PNGs to the backend
 * (see packages/iterator-plugin/src/commands/deriveVariants.ts, which
 * JSON-serializes bytes as `Array.from(...)` — fine for one 0.5x rect, fatal
 * here). It would have to build the PSD in its own iframe. So the currency
 * across the seam is decoded `PixelData`, never PNG bytes: only the *source* is
 * host-specific.
 */

import type { BlendMode, PixelData } from 'ag-psd'

/** Axis-aligned rectangle in Figma absolute-canvas coordinates. */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Integer rectangle in PSD canvas space. May extend outside the canvas. */
export interface PsdRect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Normalized Figma node. Both the REST JSON and a plugin `SceneNode` project
 * onto this shape, so `flatten.ts` never learns which one it came from.
 */
export interface FigmaNodeLite {
  id: string
  name: string
  type: string
  /** Figma omits `visible` when true. Normalizers must default it to true. */
  visible: boolean
  /** 0..1. Figma omits when 1. */
  opacity: number
  /** Figma enum, e.g. 'NORMAL' | 'MULTIPLY' | 'PASS_THROUGH'. */
  blendMode: string
  isMask: boolean
  maskType?: 'ALPHA' | 'VECTOR' | 'LUMINANCE'
  clipsContent: boolean
  /** Types of *visible* effects only, e.g. ['DROP_SHADOW', 'BACKGROUND_BLUR']. */
  effectTypes: string[]
  absoluteBoundingBox: Rect | null
  /**
   * Bounds including drop shadows and thick strokes. This — not
   * `absoluteBoundingBox` — is what the rendered PNG corresponds to.
   * `null` for invisible nodes and for most container types.
   */
  absoluteRenderBounds: Rect | null
  /** TEXT nodes only. */
  characters?: string
  /** TEXT nodes only: typography, for the .text.json sidecar. */
  style?: Record<string, unknown>
  fills?: unknown[]
  /**
   * The node paints its own background — a visible fill or stroke on the node
   * itself (not its children). A CONTAINER that does so (e.g. a pill-shaped CTA
   * frame: white fill + corner radius, text child) cannot be treated as a
   * pixel-less group; its paint would vanish. Such containers render atomically.
   */
  paintsOwnBackground: boolean
  children: FigmaNodeLite[]
}

/** A node's pixels, decoded, plus where they sit on the PSD canvas. */
export interface RenderedLayer {
  /** RGBA8, straight (unassociated) alpha. */
  pixels: PixelData
  rect: PsdRect
}

export type WarningCode =
  | 'hidden'
  | 'zero-opacity'
  | 'zero-area'
  | 'off-canvas'
  | 'mask-flattened'
  | 'unsafe-flattened'
  | 'depth-capped'
  | 'layer-cap'
  | 'pixel-budget'
  | 'bounds-drift'
  | 'render-failed'
  | 'soft-light-drift'
  | 'painted-flattened'

export interface Warning {
  code: WarningCode
  nodeId: string
  nodeName: string
  detail?: string
}

/** Thrown for conditions that make the output PSD untrustworthy. */
export class PsdExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PsdExportError'
  }
}

// ── Plan (output of flatten.ts) ───────────────────────────────────

export type PlaceholderReason = 'hidden' | 'zero-opacity' | 'render-failed'

/**
 * A group emits no pixels of its own. Because nothing baked its opacity into
 * anything, it carries the real Figma opacity — unlike a raster leaf.
 */
export interface PsdPlanGroup {
  kind: 'group'
  nodeId: string
  name: string
  blendMode: BlendMode
  opacity: number
  children: PsdPlanNode[]
}

/**
 * A raster leaf. `opacity` is always 1: Figma renders a node in isolation with
 * its own opacity already baked into the alpha channel, so setting the layer
 * opacity too would double-apply it. Blend mode, by contrast, has nothing to
 * blend against in isolation and so is NOT baked — it must be mapped.
 */
export interface PsdPlanRaster {
  kind: 'raster'
  nodeId: string
  name: string
  blendMode: BlendMode
  clipping: boolean
}

/** A node Figma refuses to render. Emitted so the designer knows it existed. */
export interface PsdPlanPlaceholder {
  kind: 'placeholder'
  nodeId: string
  name: string
  reason: PlaceholderReason
  bbox: Rect
}

export type PsdPlanNode = PsdPlanGroup | PsdPlanRaster | PsdPlanPlaceholder

export interface PsdPlan {
  frameId: string
  frameName: string
  /** Canvas origin + size, in Figma absolute coordinates, before scaling. */
  frameBbox: Rect
  scale: number
  width: number
  height: number
  root: PsdPlanNode[]
  warnings: Warning[]
  /** Flat list of node ids needing a render, in no particular order. */
  rasterIds: string[]
  /** TEXT nodes encountered, for the sidecar. */
  textNodes: FigmaNodeLite[]
}

// ── The seam ──────────────────────────────────────────────────────

export interface RenderContext {
  scale: number
  frameBbox: Rect
}

export interface LayerSource {
  readonly kind: 'rest' | 'plugin'

  getFrameTree(frameId: string): Promise<FigmaNodeLite>

  /**
   * Render nodes in isolation. Never throws for a single id: yields `null` when
   * a node is unrenderable. Async-iterable so a source can free each PNG buffer
   * immediately after decode rather than holding all of them.
   */
  render(
    ids: string[],
    ctx: RenderContext
  ): AsyncIterable<readonly [string, RenderedLayer | null]>

  /**
   * The flattened preview, exactly `width x height`.
   *
   * NOT optional. ag-psd does not synthesize a composite from layer data, and a
   * PSD without one reads back as opaque black in every non-Photoshop viewer
   * (verified against Pillow). The cheapest correct composite is one extra
   * render of the frame itself with `use_absolute_bounds=true`.
   */
  renderComposite(frameId: string, ctx: RenderContext): Promise<PixelData>
}
