/**
 * Coordinate math: Figma absolute space -> PSD canvas space.
 *
 * ISOMORPHIC. See types.ts for the constraint.
 */

import { PsdExportError, type PsdRect, type Rect } from './types.js'

/** Δ ≤ this many pixels is normal Figma rounding: accept silently. */
const DRIFT_SILENT_PX = 1
/** Δ ≤ this is suspicious but survivable: accept and warn. */
const DRIFT_WARN_PX = 3

export interface ReconcileResult {
  rect: PsdRect
  /** Set when drift exceeded DRIFT_SILENT_PX but stayed within DRIFT_WARN_PX. */
  drift?: { expectedW: number; expectedH: number; actualW: number; actualH: number }
}

export function psdCanvasSize(frameBbox: Rect, scale: number): { width: number; height: number } {
  return {
    width: Math.round(frameBbox.width * scale),
    height: Math.round(frameBbox.height * scale),
  }
}

/**
 * Place a rendered node on the PSD canvas.
 *
 * Trust `src` (the node's `absoluteRenderBounds`) for POSITION.
 * Trust the decoded PNG for SIZE.
 *
 * Never derive `right` from `Math.round(src.width * scale)`: Figma rounds `x`
 * and `width` independently, so the two disagree by a pixel and you get seams.
 *
 * Negative `left`/`top`, and `right > canvasWidth`, are legal. PSD layer rects
 * are signed and layers may extend past the canvas — which happens whenever a
 * child's drop shadow escapes a `clipsContent` frame. Do not clamp.
 */
export function toPsdRect(
  src: Rect,
  frameBbox: Rect,
  scale: number,
  pixelW: number,
  pixelH: number,
  nodeLabel: string
): ReconcileResult {
  const left = Math.round((src.x - frameBbox.x) * scale)
  const top = Math.round((src.y - frameBbox.y) * scale)
  const rect: PsdRect = { left, top, right: left + pixelW, bottom: top + pixelH }

  const expectedW = Math.round(src.width * scale)
  const expectedH = Math.round(src.height * scale)
  const dw = Math.abs(pixelW - expectedW)
  const dh = Math.abs(pixelH - expectedH)

  if (dw <= DRIFT_SILENT_PX && dh <= DRIFT_SILENT_PX) return { rect }

  if (dw <= DRIFT_WARN_PX && dh <= DRIFT_WARN_PX) {
    return { rect, drift: { expectedW, expectedH, actualW: pixelW, actualH: pixelH } }
  }

  // Do NOT try to recover by inferring an "effective scale". If Figma clamped an
  // oversized render, every layer got a different treatment and the whole PSD is
  // unrecoverable. Fail loudly.
  throw new PsdExportError(
    `${nodeLabel} rendered ${pixelW}x${pixelH}, expected ~${expectedW}x${expectedH} ` +
      `(scale ${scale}). Likely an absoluteRenderBounds/absoluteBoundingBox mixup, ` +
      `or Figma clamped an oversized render. Try a lower --scale.`
  )
}

/** True when the two rects share no area. */
export function isDisjoint(a: Rect, b: Rect): boolean {
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  )
}

/** Δ ≤ this (Figma absolute px) still counts as "inner ⊆ outer": stroke/rounding slop. */
const CONTAIN_EPS_PX = 2
/** Max relative disagreement between the x- and y-scale of a render before we call it non-uniform (rotation/skew). */
const ISOTROPY_TOL = 0.02

function isContained(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - CONTAIN_EPS_PX &&
    inner.y >= outer.y - CONTAIN_EPS_PX &&
    inner.x + inner.width <= outer.x + outer.width + CONTAIN_EPS_PX &&
    inner.y + inner.height <= outer.y + outer.height + CONTAIN_EPS_PX
  )
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

/** Pixel rect (in a source PNG) to extract before decoding. */
export interface CropRect {
  left: number
  top: number
  width: number
  height: number
}

export interface LayerPlacement {
  rect: PsdRect
  /** Extract this sub-rect of the rendered PNG before decoding. */
  crop?: CropRect
  /** Resize the (cropped) pixels to this size — Figma clamped an oversized render. */
  resize?: { width: number; height: number }
  /** Set on Case-A drift within DRIFT_WARN_PX. */
  drift?: ReconcileResult['drift']
}

/**
 * Decide how a rendered node lands on the PSD canvas.
 *
 * Two regimes:
 *
 *   Case A — the PNG matches the node's render bounds (`rb`). This is every node
 *   that fits inside the frame, drop shadows included: Figma rendered exactly
 *   what `rb` describes. Place it there. (Delegates to `toPsdRect`.)
 *
 *   Case B — the node is CLIPPED by an ancestor (or otherwise larger than its
 *   visible region). `/v1/images` renders a node in isolation as its own root,
 *   so it ignores the parent frame's clip and returns the WHOLE bounding box
 *   (`bb`) — often downscaled to Figma's max render size. The visible region is
 *   `rb`, a sub-rect of `bb`. We crop the render to `rb` (in render pixels) and,
 *   if Figma clamped so the render scale `k` ≠ the requested `scale`, resize the
 *   crop up to the target size. That resize is a real quality loss and is the
 *   only unavoidable one — it bites exactly the oversized, heavily-zoomed image
 *   fills that Figma refuses to rasterise at full size.
 */
export function planLayerPlacement(
  bb: Rect | null,
  rb: Rect | null,
  frameBbox: Rect,
  scale: number,
  pixelW: number,
  pixelH: number,
  nodeLabel: string
): LayerPlacement {
  const src = rb ?? bb
  if (!src) {
    throw new PsdExportError(`${nodeLabel} has neither render nor bounding box; cannot place it`)
  }

  // Case A: render == render bounds (within rounding). Covers fitting nodes and
  // shadow/stroke bleed, which Figma already folded into `rb`.
  const expectedW = Math.round(src.width * scale)
  const expectedH = Math.round(src.height * scale)
  if (
    Math.abs(pixelW - expectedW) <= DRIFT_WARN_PX &&
    Math.abs(pixelH - expectedH) <= DRIFT_WARN_PX
  ) {
    return toPsdRect(src, frameBbox, scale, pixelW, pixelH, nodeLabel)
  }

  // Case B: render == bounding box, clipped down to the visible `rb`.
  if (bb && rb && bb.width > 0 && bb.height > 0 && isContained(rb, bb)) {
    const kx = pixelW / bb.width
    const ky = pixelH / bb.height
    if (Math.abs(kx - ky) <= ISOTROPY_TOL * Math.max(kx, ky)) {
      const k = (kx + ky) / 2
      const left = clampInt((rb.x - bb.x) * k, 0, pixelW)
      const top = clampInt((rb.y - bb.y) * k, 0, pixelH)
      const crop: CropRect = {
        left,
        top,
        width: clampInt(rb.width * k, 1, pixelW - left),
        height: clampInt(rb.height * k, 1, pixelH - top),
      }

      const targetW = Math.round(rb.width * scale)
      const targetH = Math.round(rb.height * scale)
      const psdLeft = Math.round((rb.x - frameBbox.x) * scale)
      const psdTop = Math.round((rb.y - frameBbox.y) * scale)
      const rect: PsdRect = {
        left: psdLeft,
        top: psdTop,
        right: psdLeft + targetW,
        bottom: psdTop + targetH,
      }
      const resize =
        crop.width !== targetW || crop.height !== targetH
          ? { width: targetW, height: targetH }
          : undefined
      return { rect, crop, resize }
    }
  }

  // Neither regime fits: rotation, skew, or a render/bounds mixup. Fail loudly.
  throw new PsdExportError(
    `${nodeLabel} rendered ${pixelW}x${pixelH}, expected ~${expectedW}x${expectedH} ` +
      `(scale ${scale}). Not reconcilable as a fitting node (render bounds) nor as a ` +
      `clipped node (bounding box); likely a rotated/skewed layer or a bounds mixup.`
  )
}
