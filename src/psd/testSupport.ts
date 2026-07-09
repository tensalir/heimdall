/**
 * Test-only helpers for the PSD exporter.
 *
 * NOT imported by production code.
 */

import { initializeCanvas, type PixelData } from 'ag-psd'
import type {
  FigmaNodeLite,
  LayerSource,
  Rect,
  RenderContext,
  RenderedLayer,
} from './types.js'

/**
 * `readPsd` needs a way to construct an ImageData. ag-psd's default routes
 * through `createCanvas`, which requires node-canvas. Supplying `createImageData`
 * directly means `createCanvas` is never called.
 *
 * The WRITE path — all of production — needs none of this. Call once per test file.
 */
export function initReadOnlyCanvasShim(): void {
  initializeCanvas(
    () => {
      throw new Error('createCanvas must never be called: pass useImageData to readPsd')
    },
    (width, height) =>
      ({ data: new Uint8ClampedArray(width * height * 4), width, height }) as ImageData
  )
}

/** ag-psd stores layer opacity as one byte, so 0.5 round-trips as 128/255. */
export const OPACITY_BYTE_TOLERANCE = 1 / 255 + 1e-9

export function solidPixels(
  width: number,
  height: number,
  [r, g, b, a]: [number, number, number, number]
): PixelData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = a
  }
  return { data, width, height }
}

export function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height }
}

/** Build a FigmaNodeLite with sane defaults; override only what a test cares about. */
export function node(partial: Partial<FigmaNodeLite> & { id: string; type: string }): FigmaNodeLite {
  const bbox = partial.absoluteBoundingBox ?? rect(0, 0, 100, 100)
  return {
    name: partial.id,
    visible: true,
    opacity: 1,
    blendMode: 'NORMAL',
    isMask: false,
    clipsContent: false,
    effectTypes: [],
    absoluteBoundingBox: bbox,
    absoluteRenderBounds: partial.absoluteRenderBounds ?? bbox,
    paintsOwnBackground: false,
    children: [],
    ...partial,
  }
}

/**
 * Offline LayerSource. Renders every requested node as a solid colour sized to
 * its bounds. Exercises the whole pipeline with zero network and zero token —
 * which is the entire point of the seam.
 */
export function fakeLayerSource(
  tree: FigmaNodeLite,
  opts: { unrenderable?: Set<string>; colour?: [number, number, number, number] } = {}
): LayerSource {
  const index = new Map<string, FigmaNodeLite>()
  const walk = (n: FigmaNodeLite) => {
    index.set(n.id, n)
    n.children.forEach(walk)
  }
  walk(tree)

  const colour = opts.colour ?? [255, 0, 0, 255]
  const unrenderable = opts.unrenderable ?? new Set<string>()

  return {
    kind: 'rest',
    async getFrameTree() {
      return tree
    },
    async *render(ids: string[], ctx: RenderContext) {
      for (const id of ids) {
        const n = index.get(id)
        const src = n?.absoluteRenderBounds ?? n?.absoluteBoundingBox
        if (!n || !src || unrenderable.has(id)) {
          yield [id, null] as const
          continue
        }
        const w = Math.round(src.width * ctx.scale)
        const h = Math.round(src.height * ctx.scale)
        const left = Math.round((src.x - ctx.frameBbox.x) * ctx.scale)
        const top = Math.round((src.y - ctx.frameBbox.y) * ctx.scale)
        const layer: RenderedLayer = {
          pixels: solidPixels(w, h, colour),
          rect: { left, top, right: left + w, bottom: top + h },
        }
        yield [id, layer] as const
      }
    },
    async renderComposite(_frameId: string, ctx: RenderContext) {
      return solidPixels(
        Math.round(ctx.frameBbox.width * ctx.scale),
        Math.round(ctx.frameBbox.height * ctx.scale),
        [10, 20, 30, 255]
      )
    },
  }
}
