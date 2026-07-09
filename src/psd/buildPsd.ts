/**
 * PsdPlan + rendered pixels -> an ag-psd `Psd` object.
 *
 * ISOMORPHIC. Returns a `Psd`, NOT bytes: Node calls `writePsdBuffer`, a plugin
 * iframe calls `writePsd`. Keeping the split at the host boundary is what makes
 * a plugin fallback a two-file addition rather than a rewrite.
 *
 * Z-ORDER: verified empirically against ag-psd 31.0.0 — `children[0]` is written
 * as the FIRST layer record, and the PSD spec stores records bottom-to-top, so
 * `children[0]` is the BOTTOM layer. Figma's `children[]` is also bottom-first.
 * The orders agree; no reversal. Guarded by the z-order test.
 */

import type { Layer, PixelData, Psd } from 'ag-psd'
import type { PsdPlan, PsdPlanNode, RenderedLayer, Warning } from './types.js'

/** ag-psd children[0] == bottom layer, same convention as Figma. See header. */
export const Z_ORDER_REVERSED = false

/**
 * A 1x1 all-but-transparent pixel, for placeholder layers.
 *
 * Alpha is 1, not 0. `writePsdBuffer({ trimImageData: true })` trims any row or
 * column whose alpha is entirely zero, so a fully transparent pixel collapses to
 * zero-size layer bounds — a spec grey area, and it discards the position that
 * told the designer where the missing content used to be. Alpha 1/255 over
 * anything is imperceptible, and these layers are `hidden` regardless.
 */
function placeholderPixel(): PixelData {
  const data = new Uint8ClampedArray(4)
  data[3] = 1
  return { data, width: 1, height: 1 }
}

export interface BuildPsdResult {
  psd: Psd
  warnings: Warning[]
  /** Nodes the plan wanted but the source could not deliver. */
  missing: string[]
}

export function buildPsd(
  plan: PsdPlan,
  rendered: Map<string, RenderedLayer | null>,
  composite: PixelData
): BuildPsdResult {
  if (composite.width !== plan.width || composite.height !== plan.height) {
    throw new Error(
      `Composite is ${composite.width}x${composite.height}, expected ${plan.width}x${plan.height}. ` +
        `ag-psd throws on a document/composite size mismatch.`
    )
  }

  const warnings: Warning[] = [...plan.warnings]
  const missing: string[] = []

  function toLayer(node: PsdPlanNode): Layer | null {
    if (node.kind === 'group') {
      const children = node.children.map(toLayer).filter((l): l is Layer => l !== null)
      if (children.length === 0) return null
      return {
        name: node.name,
        opacity: node.opacity,
        blendMode: node.blendMode,
        opened: true,
        children,
      }
    }

    if (node.kind === 'placeholder') {
      const left = Math.round((node.bbox.x - plan.frameBbox.x) * plan.scale)
      const top = Math.round((node.bbox.y - plan.frameBbox.y) * plan.scale)
      return {
        name: `${node.name} ⟨${node.reason}⟩`,
        hidden: true,
        left,
        top,
        right: left + 1,
        bottom: top + 1,
        imageData: placeholderPixel(),
      }
    }

    const layer = rendered.get(node.nodeId)
    if (!layer) {
      // Requested but undeliverable. Downgrade to a placeholder rather than
      // silently dropping content.
      missing.push(node.nodeId)
      warnings.push({
        code: 'render-failed',
        nodeId: node.nodeId,
        nodeName: node.name,
        detail: 'no pixels returned; emitted as a hidden placeholder',
      })
      return {
        name: `${node.name} ⟨render-failed⟩`,
        hidden: true,
        left: 0,
        top: 0,
        right: 1,
        bottom: 1,
        imageData: placeholderPixel(),
      }
    }

    return {
      name: node.name,
      left: layer.rect.left,
      top: layer.rect.top,
      right: layer.rect.right,
      bottom: layer.rect.bottom,
      // Always 1: Figma baked the node's own opacity into the alpha channel when
      // it rendered the node in isolation. Setting it here would double-apply.
      opacity: 1,
      blendMode: node.blendMode,
      clipping: node.clipping,
      imageData: layer.pixels,
    }
  }

  const children = plan.root.map(toLayer).filter((l): l is Layer => l !== null)

  const psd: Psd = {
    width: plan.width,
    height: plan.height,
    children,
    // Mandatory. ag-psd never synthesizes a composite from layer data; without
    // this the PSD reads back as opaque black outside Photoshop.
    imageData: composite,
  }

  return { psd, warnings, missing }
}
