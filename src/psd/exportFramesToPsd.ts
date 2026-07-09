/**
 * Orchestrator: frame ids -> .psd buffers (+ text sidecars). NODE-ONLY.
 */

import { initializeCanvas, writePsdBuffer } from 'ag-psd'
import { buildPsd } from './buildPsd.js'
import { flattenFrame, type FlattenOptions } from './flatten.js'
import type { LayerSource, PsdPlan, RenderedLayer, Warning } from './types.js'

// `writePsdBuffer(..., { trimImageData: true })` crops each layer's transparent
// margins via ag-psd's `cropImageData`, which allocates a fresh buffer through
// `createImageData` — canvas-backed (node-canvas) by default. That silently
// breaks the "no native dependencies" promise: a pure `imageData` pipeline never
// needs a canvas otherwise. Inject a plain-object `ImageData` so trimming stays
// pure JS. `createCanvas` is left as a loud throw: nothing on the REST write
// path should reach it (no thumbnails, no masks, composite supplied as pixels).
initializeCanvas(
  () => {
    throw new Error('ag-psd createCanvas is not available in the REST PSD writer path')
  },
  (width, height) =>
    ({ width, height, data: new Uint8ClampedArray(width * height * 4) }) as unknown as ImageData
)

/** At scale 2 a full-bleed 1440x2560 layer is ~59 MB of RGBA. Ten is 590 MB. */
const MAX_TOTAL_PIXELS = 200_000_000

export interface TextSidecarNode {
  id: string
  name: string
  characters: string
  rect: { left: number; top: number; right: number; bottom: number } | null
  style: Record<string, unknown> | null
}

export interface FrameExport {
  frameId: string
  frameName: string
  width: number
  height: number
  psd: Buffer
  textSidecar: { frameId: string; frameName: string; nodes: TextSidecarNode[] }
  warnings: Warning[]
  layerCount: number
}

export interface ExportOptions extends Omit<FlattenOptions, 'scale'> {
  scale?: number
  onProgress?: (message: string) => void
}

function countLayers(plan: PsdPlan): number {
  const walk = (nodes: PsdPlan['root']): number =>
    nodes.reduce((n, node) => n + (node.kind === 'group' ? walk(node.children) : 1), 0)
  return walk(plan.root)
}

function buildTextSidecar(
  plan: PsdPlan,
  rendered: Map<string, RenderedLayer | null>
): FrameExport['textSidecar'] {
  return {
    frameId: plan.frameId,
    frameName: plan.frameName,
    nodes: plan.textNodes.map((n) => ({
      id: n.id,
      name: n.name,
      characters: n.characters ?? '',
      rect: rendered.get(n.id)?.rect ?? null,
      style: n.style ?? null,
    })),
  }
}

export async function exportFrameToPsd(
  source: LayerSource,
  frameId: string,
  options: ExportOptions = {}
): Promise<FrameExport> {
  const scale = options.scale ?? 1
  const progress = options.onProgress ?? (() => {})

  progress(`fetching tree for ${frameId}`)
  const tree = await source.getFrameTree(frameId)

  const plan = flattenFrame(tree, { ...options, scale })
  const ctx = { scale, frameBbox: plan.frameBbox }

  const budget = plan.width * plan.height * (plan.rasterIds.length + 1)
  if (budget > MAX_TOTAL_PIXELS) {
    plan.warnings.push({
      code: 'pixel-budget',
      nodeId: plan.frameId,
      nodeName: plan.frameName,
      detail:
        `~${(budget / 1e6).toFixed(0)}M px across ${plan.rasterIds.length} layers at ${scale}x ` +
        `exceeds the ${(MAX_TOTAL_PIXELS / 1e6).toFixed(0)}M budget; consider a lower --scale`,
    })
  }

  progress(`rendering ${plan.rasterIds.length} layers @ ${scale}x`)
  const rendered = new Map<string, RenderedLayer | null>()
  let done = 0
  for await (const [id, layer] of source.render(plan.rasterIds, ctx)) {
    rendered.set(id, layer)
    if (++done % 10 === 0) progress(`  ${done}/${plan.rasterIds.length}`)
  }

  progress('rendering composite')
  const composite = await source.renderComposite(frameId, ctx)

  progress('writing psd')
  const { psd, warnings } = buildPsd(plan, rendered, composite)
  const buffer = writePsdBuffer(psd, { trimImageData: true })

  return {
    frameId: plan.frameId,
    frameName: plan.frameName,
    width: plan.width,
    height: plan.height,
    psd: buffer,
    textSidecar: buildTextSidecar(plan, rendered),
    warnings,
    layerCount: countLayers(plan),
  }
}

/** One .psd per frame. Frames are exported sequentially: /v1/images is cost-limited. */
export async function exportFramesToPsd(
  source: LayerSource,
  frameIds: string[],
  options: ExportOptions = {}
): Promise<FrameExport[]> {
  const out: FrameExport[] = []
  for (const frameId of frameIds) {
    out.push(await exportFrameToPsd(source, frameId, options))
  }
  return out
}
