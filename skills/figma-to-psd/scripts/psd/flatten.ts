/**
 * Figma node tree -> PsdPlan.
 *
 * ISOMORPHIC and PURE. No I/O, no pixels. This is the testable core: get this
 * right and the rest is bookkeeping.
 *
 * Tuned for the external-partner hand-off (Amazon A+ content): coarse, clean,
 * well-named layers. Instances are flattened; we are not trying to reproduce
 * every vector node.
 */

import { mapBlend, SOFT_LIGHT_DRIFTS } from './blendMode.js'
import { isDisjoint } from './geometry.js'
import type {
  FigmaNodeLite,
  PsdPlan,
  PsdPlanNode,
  Rect,
  Warning,
} from './types.js'

/** Nodes rendered as one raster layer; we never descend into them. */
export const ATOMIC_TYPES = new Set([
  'TEXT',
  'VECTOR',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'REGULAR_POLYGON',
  'STAR',
  'BOOLEAN_OPERATION', // children are boolean operands, not layers
  'INSTANCE', // overrides make descendant names meaningless; explodes layer count
  'WIDGET',
  'EMBED',
  'LINK_UNFURL',
  'MEDIA',
  'STICKY',
  'CONNECTOR',
])

export const CONTAINER_TYPES = new Set(['FRAME', 'GROUP', 'SECTION', 'COMPONENT', 'COMPONENT_SET'])

export interface FlattenOptions {
  scale: number
  maxDepth?: number
  maxLayers?: number
  /** Descend one level into INSTANCEs. Auto-enabled for instance-only frames. */
  explodeInstances?: boolean
}

const DEFAULT_MAX_DEPTH = 4
const DEFAULT_MAX_LAYERS = 200

/**
 * Effects and mask types that cannot survive isolated rendering.
 *
 * BACKGROUND_BLUR blurs whatever is *behind* the node. Rendered alone, there is
 * nothing behind it, so Figma returns a clear pane. LUMINANCE masks likewise
 * need the masked content present. Either poisons the whole ancestor chain: the
 * subtree must be flattened at or above the offending node, or the PSD is
 * silently, invisibly wrong.
 */
function isUnsafeInIsolation(n: FigmaNodeLite): boolean {
  return n.effectTypes.includes('BACKGROUND_BLUR') || n.maskType === 'LUMINANCE'
}

/** Bottom-up: mark every node whose subtree contains an isolation-unsafe node. */
function markUnsafe(n: FigmaNodeLite, out: Map<string, boolean>): boolean {
  let unsafe = isUnsafeInIsolation(n)
  for (const child of n.children) {
    if (markUnsafe(child, out)) unsafe = true
  }
  out.set(n.id, unsafe)
  return unsafe
}

function countLeaves(n: FigmaNodeLite): number {
  if (n.children.length === 0) return 1
  if (ATOMIC_TYPES.has(n.type)) return 1
  return n.children.reduce((sum, c) => sum + countLeaves(c), 0)
}

/**
 * A frame whose only meaningful child is an INSTANCE would flatten to a single
 * layer — i.e. a PNG with extra steps. Descend one level in that case.
 */
function shouldAutoExplode(frame: FigmaNodeLite): boolean {
  const meaningful = frame.children.filter((c) => c.visible && c.type !== 'SLICE')
  return meaningful.length <= 2 && meaningful.some((c) => c.type === 'INSTANCE')
}

export function flattenFrame(frame: FigmaNodeLite, options: FlattenOptions): PsdPlan {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const maxLayers = options.maxLayers ?? DEFAULT_MAX_LAYERS
  const scale = options.scale

  const frameBbox = frame.absoluteBoundingBox
  if (!frameBbox) {
    throw new Error(`Frame ${frame.id} "${frame.name}" has no absoluteBoundingBox`)
  }

  const warnings: Warning[] = []
  const rasterIds: string[] = []
  const textNodes: FigmaNodeLite[] = []
  let layerBudget = maxLayers
  let sawSoftLight = false

  const unsafe = new Map<string, boolean>()
  markUnsafe(frame, unsafe)

  const explodeInstances = options.explodeInstances ?? shouldAutoExplode(frame)

  const warn = (code: Warning['code'], n: FigmaNodeLite, detail?: string) =>
    warnings.push({ code, nodeId: n.id, nodeName: n.name, detail })

  const noteBlend = (n: FigmaNodeLite) => {
    if (n.blendMode === SOFT_LIGHT_DRIFTS) sawSoftLight = true
  }

  /** Emit `n` as a single raster layer, without descending. */
  function emitRaster(n: FigmaNodeLite, clipping: boolean): PsdPlanNode {
    noteBlend(n)
    layerBudget--
    rasterIds.push(n.id)
    if (n.type === 'TEXT') textNodes.push(n)
    return {
      kind: 'raster',
      nodeId: n.id,
      name: n.name,
      blendMode: mapBlend(n.blendMode, false),
      clipping,
    }
  }

  /**
   * `instanceDepth` counts how many INSTANCE boundaries we have crossed. We
   * allow at most one, so nested instances stay atomic.
   */
  function visit(n: FigmaNodeLite, depth: number, instanceDepth: number): PsdPlanNode | null {
    // 1. Slices are export guides, not content.
    if (n.type === 'SLICE') return null

    // 2/3. Figma cannot render these; emit a named placeholder so the designer
    // learns the content existed rather than silently losing it.
    if (!n.visible || n.opacity === 0) {
      const bbox = n.absoluteBoundingBox
      if (!bbox) return null
      const reason = !n.visible ? ('hidden' as const) : ('zero-opacity' as const)
      warn(reason, n)
      layerBudget--
      return { kind: 'placeholder', nodeId: n.id, name: n.name, reason, bbox }
    }

    const bbox = n.absoluteBoundingBox
    if (!bbox) return null

    // 4. Sub-pixel after scaling: nothing to render.
    if (bbox.width * scale < 1 || bbox.height * scale < 1) {
      warn('zero-area', n, `${bbox.width}x${bbox.height} @ ${scale}x`)
      return null
    }

    // 5. Entirely outside a clipping frame.
    if (frame.clipsContent && isDisjoint(n.absoluteRenderBounds ?? bbox, frameBbox!)) {
      warn('off-canvas', n)
      return null
    }

    if (layerBudget <= 0) {
      warn('layer-cap', n, `exceeded ${maxLayers} layers`)
      return emitRaster(n, false)
    }

    // 6. Masks. PSD `clipping` is genuinely equivalent to Figma's
    // mask-affects-later-siblings, but mask emulation is where subtle wrongness
    // hides. v1 flattens the whole masked group and says so.
    const hasMaskChild = n.children.some((c) => c.isMask)
    if (n.isMask || hasMaskChild) {
      warn('mask-flattened', n, n.maskType ?? (n.isMask ? 'mask node' : 'contains mask'))
      return emitRaster(n, false)
    }

    // 7. Atomic by type.
    const isInstance = n.type === 'INSTANCE'
    const canDescendInstance = isInstance && explodeInstances && instanceDepth === 0
    if (ATOMIC_TYPES.has(n.type) && !canDescendInstance) {
      return emitRaster(n, false)
    }

    const isContainer = CONTAINER_TYPES.has(n.type) || canDescendInstance
    if (!isContainer || n.children.length === 0) {
      return emitRaster(n, false)
    }

    // 8. Containers we must not descend into.
    if (unsafe.get(n.id)) {
      warn('unsafe-flattened', n, 'background blur or luminance mask in subtree')
      return emitRaster(n, false)
    }
    if (depth >= maxDepth) {
      warn('depth-capped', n, `depth ${depth} >= ${maxDepth}`)
      return emitRaster(n, false)
    }
    if (countLeaves(n) > layerBudget) {
      warn('layer-cap', n, `subtree of ${countLeaves(n)} exceeds remaining budget ${layerBudget}`)
      return emitRaster(n, false)
    }
    // A container with its own effects (drop shadow, blur) must render as one
    // unit: the effect applies to the composited subtree, not to each child.
    if (n.effectTypes.length > 0) {
      warn('unsafe-flattened', n, `container effects: ${n.effectTypes.join(', ')}`)
      return emitRaster(n, false)
    }
    // A container that paints its own background (fill/stroke — e.g. a pill CTA:
    // white fill + corner radius wrapping a text child) must render as one unit.
    // Descending would emit the children but silently drop the frame's own paint.
    if (n.paintsOwnBackground) {
      warn('painted-flattened', n, 'container paints its own fill/stroke')
      return emitRaster(n, false)
    }

    // 9. A real group. Recurse.
    noteBlend(n)
    const nextInstanceDepth = isInstance ? instanceDepth + 1 : instanceDepth
    const children: PsdPlanNode[] = []
    for (const child of n.children) {
      const emitted = visit(child, depth + 1, nextInstanceDepth)
      if (emitted) children.push(emitted)
    }

    if (children.length === 0) return null

    // Hoist a group that wraps exactly one raster: it adds nesting, not meaning.
    if (children.length === 1 && children[0]!.kind === 'raster' && n.opacity === 1) {
      return children[0]!
    }

    return {
      kind: 'group',
      nodeId: n.id,
      name: n.name,
      blendMode: mapBlend(n.blendMode, true),
      // A group emits no pixels, so nothing baked its opacity in. Carry the real
      // value. (Contrast with PsdPlanRaster, where opacity is always 1.)
      opacity: n.opacity,
      children,
    }
  }

  const root: PsdPlanNode[] = []
  for (const child of frame.children) {
    const emitted = visit(child, 1, 0)
    if (emitted) root.push(emitted)
  }

  if (sawSoftLight) {
    warnings.push({
      code: 'soft-light-drift',
      nodeId: frame.id,
      nodeName: frame.name,
      detail: 'Figma and Photoshop implement soft light differently; expect slight drift',
    })
  }

  const width = Math.round(frameBbox.width * scale)
  const height = Math.round(frameBbox.height * scale)

  return {
    frameId: frame.id,
    frameName: frame.name,
    frameBbox: frameBbox as Rect,
    scale,
    width,
    height,
    root,
    warnings,
    rasterIds,
    textNodes,
  }
}
