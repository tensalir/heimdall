/**
 * LayerSource backed by the Figma REST API. NODE-ONLY (uses `sharp`).
 *
 * Rendering strategy: ask Figma to render each layer node in isolation
 * (`GET /v1/images`), download the PNGs, decode to raw RGBA. Figma's servers do
 * all the rasterising; we only place the results.
 */

import sharp from 'sharp'
import type { PixelData } from 'ag-psd'
import {
  exportNodeImagesWithRetry,
  getFileNodes,
  FigmaExportError,
} from '../integrations/figma/restClient.js'
import { mapLimit, sleep } from './concurrency.js'
import { normalizeFigmaNode } from './figmaNode.js'
import { planLayerPlacement, psdCanvasSize, type LayerPlacement } from './geometry.js'
import {
  PsdExportError,
  type FigmaNodeLite,
  type LayerSource,
  type RenderContext,
  type RenderedLayer,
  type Warning,
} from './types.js'

/**
 * Full-scale renders are far heavier than the scale-0.5 thumbnails that
 * app/api/comments/thumbnails batches at 50. Figma 500s on large batches.
 */
const IMAGES_BATCH_SIZE = 30
/** /v1/images is rate-limited by render cost. Sequential batches, with a gap. */
const BATCH_GAP_MS = 250
const DOWNLOAD_CONCURRENCY = 6
const DOWNLOAD_TIMEOUT_MS = 60_000

export interface RestLayerSourceOptions {
  fileKey: string
  /** Pin renders to one file version so a long export can't straddle an edit. */
  version?: string
  onWarning?: (w: Warning) => void
}

async function fetchPng(url: string, label: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`download ${label}: ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

/**
 * PNG -> straight-alpha RGBA8.
 *
 * NEVER call .resize() here. libvips premultiplies alpha internally during
 * resize and unpremultiplies after, which is lossy at low alpha and produces
 * dark halos on antialiased edges that nobody traces back to sharp. Ask Figma
 * for the scale you want via `scale=` instead.
 *
 * .toColourspace('srgb') before .ensureAlpha() matters: .ensureAlpha() on a
 * grayscale PNG yields 2 channels, not 4.
 */
async function sharpToPixelData(pipe: sharp.Sharp, label: string): Promise<PixelData> {
  const { data, info } = await pipe
    .toColourspace('srgb')
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.channels !== 4) {
    throw new PsdExportError(`${label}: expected RGBA, sharp produced ${info.channels} channels`)
  }

  // Zero-copy when the Buffer owns its whole ArrayBuffer; Node pools small
  // buffers into a shared 8KB allocation, so a slice must be copied.
  const owns = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
  const view = owns
    ? new Uint8ClampedArray(data.buffer as ArrayBuffer)
    : new Uint8ClampedArray(data)

  return { data: view, width: info.width, height: info.height }
}

export async function pngToPixelData(png: Buffer, label: string): Promise<PixelData> {
  return sharpToPixelData(sharp(png), label)
}

/**
 * Decode a rendered PNG into placed pixels, applying any crop/resize the
 * placement calls for (Case B — a clipped, oversized node; see geometry.ts).
 *
 * The `.resize()` here is deliberate and is the one place the "never resize"
 * rule in `pngToPixelData` is broken: when Figma clamped an oversized render the
 * crop comes back smaller than the layer's on-canvas size, and the only way to
 * fill the layer rect is to scale up. It fires solely on heavily-zoomed image
 * fills, whose content is opaque photography — so the antialiased-edge halos the
 * rule guards against don't arise.
 */
async function decodeLayer(png: Buffer, placement: LayerPlacement, label: string): Promise<PixelData> {
  let pipe = sharp(png)
  if (placement.crop) pipe = pipe.extract(placement.crop)
  if (placement.resize) {
    pipe = pipe.resize(placement.resize.width, placement.resize.height, {
      fit: 'fill',
      kernel: 'lanczos3',
    })
  }
  return sharpToPixelData(pipe, label)
}

export function createRestLayerSource(options: RestLayerSourceOptions): LayerSource {
  const { fileKey, version, onWarning } = options
  const warn = (w: Warning) => onWarning?.(w)

  /** Cache of the fetched tree, so render() can read bounds without refetching. */
  const nodeIndex = new Map<string, FigmaNodeLite>()

  function index(n: FigmaNodeLite): void {
    nodeIndex.set(n.id, n)
    for (const c of n.children) index(c)
  }

  async function getFrameTree(frameId: string): Promise<FigmaNodeLite> {
    const res = await getFileNodes(fileKey, [frameId], { depth: undefined })
    if (!res) {
      throw new PsdExportError(
        `Cannot read node ${frameId} from file ${fileKey}. Token expired, wrong file key, ` +
          `or missing file_content:read scope.`
      )
    }
    if (res.err) throw new PsdExportError(`Figma nodes error: ${res.err}`)
    const entry = res.nodes[frameId]
    if (!entry?.document) {
      throw new PsdExportError(`Node ${frameId} not present in file ${fileKey}`)
    }
    const tree = normalizeFigmaNode(entry.document)
    index(tree)
    return tree
  }

  /**
   * Render one batch. Figma returns a TOP-LEVEL `err` when *any* node in the
   * batch fails, so a single oversized node poisons all 30. Bisect to isolate.
   *
   * Two different nulls come out of this:
   *   - null inside a successful response  -> unrenderable (hidden / 0% opacity). Expected.
   *   - null from a bisected failure       -> render error. Warned loudly by the caller.
   */
  async function renderBatch(
    ids: string[],
    scale: number
  ): Promise<Map<string, string | null>> {
    try {
      const images = await exportNodeImagesWithRetry(fileKey, ids, {
        format: 'png',
        scale,
        version,
      })
      return new Map(ids.map((id) => [id, images[id] ?? null]))
    } catch (err) {
      if (!(err instanceof FigmaExportError)) throw err
      // 403/404 are fatal for the whole export, not a per-node problem.
      if (err.status === 403 || err.status === 404) throw err

      if (ids.length === 1) {
        const id = ids[0]!
        warn({
          code: 'render-failed',
          nodeId: id,
          nodeName: nodeIndex.get(id)?.name ?? id,
          detail: err.message,
        })
        return new Map([[id, null]])
      }

      const mid = ids.length >> 1
      const left = await renderBatch(ids.slice(0, mid), scale)
      await sleep(BATCH_GAP_MS)
      const right = await renderBatch(ids.slice(mid), scale)
      return new Map([...left, ...right])
    }
  }

  async function* render(
    ids: string[],
    ctx: RenderContext
  ): AsyncIterable<readonly [string, RenderedLayer | null]> {
    for (let i = 0; i < ids.length; i += IMAGES_BATCH_SIZE) {
      const batch = ids.slice(i, i + IMAGES_BATCH_SIZE)
      const urls = await renderBatch(batch, ctx.scale)

      const entries = [...urls.entries()]
      const decoded = await mapLimit(entries, DOWNLOAD_CONCURRENCY, async ([id, url]) => {
        if (!url) return [id, null] as const

        const node = nodeIndex.get(id)
        if (!node) return [id, null] as const
        const { absoluteBoundingBox: bb, absoluteRenderBounds: rb } = node
        if (!bb && !rb) return [id, null] as const

        const label = `${node.name} (${id})`
        let png: Buffer
        try {
          png = await fetchPng(url, label)
        } catch {
          // Presigned S3 URLs can rotate early. Re-request this one node once.
          const retry = await renderBatch([id], ctx.scale)
          const retryUrl = retry.get(id)
          if (!retryUrl) return [id, null] as const
          png = await fetchPng(retryUrl, label)
        }

        // Read the rendered size without decoding the whole PNG; the placement
        // decides whether it fits (place as-is) or was rendered unclipped and
        // must be cropped/resized to the visible region.
        const meta = await sharp(png).metadata()
        let placement: LayerPlacement
        try {
          placement = planLayerPlacement(
            bb,
            rb,
            ctx.frameBbox,
            ctx.scale,
            meta.width ?? 0,
            meta.height ?? 0,
            label
          )
        } catch (err) {
          // One layer we can't place geometrically must not sink the whole frame.
          // Yield null: buildPsd downgrades it to a named hidden placeholder and
          // the flattened composite still shows it. Loud, per-node, recoverable.
          warn({
            code: 'render-failed',
            nodeId: id,
            nodeName: node.name,
            detail: err instanceof Error ? err.message : String(err),
          })
          return [id, null] as const
        }
        if (placement.crop) {
          warn({
            code: 'bounds-drift',
            nodeId: id,
            nodeName: node.name,
            detail:
              `clipped by ancestor: rendered ${meta.width}x${meta.height}, ` +
              `cropped to ${placement.crop.width}x${placement.crop.height}` +
              (placement.resize ? ` then resized to ${placement.resize.width}x${placement.resize.height}` : ''),
          })
        } else if (placement.drift) {
          warn({
            code: 'bounds-drift',
            nodeId: id,
            nodeName: node.name,
            detail: `rendered ${placement.drift.actualW}x${placement.drift.actualH}, expected ${placement.drift.expectedW}x${placement.drift.expectedH}`,
          })
        }
        const pixels = await decodeLayer(png, placement, label)
        return [id, { pixels, rect: placement.rect }] as const
      })

      for (const entry of decoded) yield entry

      if (i + IMAGES_BATCH_SIZE < ids.length) await sleep(BATCH_GAP_MS)
    }
  }

  async function renderComposite(frameId: string, ctx: RenderContext): Promise<PixelData> {
    // use_absolute_bounds pins the render to absoluteBoundingBox rather than
    // render bounds, so it comes back exactly width x height — and it drops the
    // frame's own drop shadow, which is not part of the canvas anyway.
    const images = await exportNodeImagesWithRetry(fileKey, [frameId], {
      format: 'png',
      scale: ctx.scale,
      useAbsoluteBounds: true,
      version,
    })
    const url = images[frameId]
    if (!url) throw new PsdExportError(`Figma could not render frame ${frameId} as a composite`)

    const png = await fetchPng(url, `composite ${frameId}`)
    const { width, height } = psdCanvasSize(ctx.frameBbox, ctx.scale)

    const meta = await sharp(png).metadata()
    if (meta.width !== width || meta.height !== height) {
      // Belt and braces: ag-psd throws on a document/composite size mismatch.
      // A ±1px difference is Figma rounding, not a bug. Pad or crop, don't resize.
      const fixed = await sharp(png)
        .toColourspace('srgb')
        .ensureAlpha()
        .extend({
          right: Math.max(0, width - (meta.width ?? 0)),
          bottom: Math.max(0, height - (meta.height ?? 0)),
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .extract({ left: 0, top: 0, width, height })
        .png()
        .toBuffer()
      return pngToPixelData(fixed, `composite ${frameId}`)
    }

    return pngToPixelData(png, `composite ${frameId}`)
  }

  return { kind: 'rest', getFrameTree, render, renderComposite }
}
