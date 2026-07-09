/**
 * V1 (round-trip) and V2 (z-order pin) from the export plan.
 *
 * V2 is the important one: ag-psd's `children` order vs Figma's bottom-first
 * `children` is the single most likely SILENT inversion in this feature. If it
 * ever flips, this test fails and Z_ORDER_REVERSED must be revisited.
 */

import { describe, expect, it, beforeAll } from 'vitest'
import { readPsd, writePsdBuffer, type Psd } from 'ag-psd'
import { buildPsd, Z_ORDER_REVERSED } from './buildPsd.js'
import { flattenFrame } from './flatten.js'
import {
  initReadOnlyCanvasShim,
  node,
  OPACITY_BYTE_TOLERANCE,
  rect,
  solidPixels,
} from './testSupport.js'
import type { PsdPlan, RenderedLayer } from './types.js'

beforeAll(initReadOnlyCanvasShim)

const readBack = (buf: Buffer | Uint8Array) =>
  readPsd(buf instanceof Buffer ? buf : Buffer.from(buf), {
    useImageData: true,
    skipThumbnail: true,
  })

describe('V2: z-order convention', () => {
  it('children[0] is the BOTTOM layer on disk (PSD stores records bottom-to-top)', () => {
    const psd: Psd = {
      width: 100,
      height: 100,
      children: [
        { name: 'BOTTOM', left: 0, top: 0, right: 60, bottom: 60, imageData: solidPixels(60, 60, [255, 0, 0, 255]) },
        { name: 'TOP', left: 40, top: 40, right: 100, bottom: 100, imageData: solidPixels(60, 60, [0, 0, 255, 255]) },
      ],
    }
    const buf = writePsdBuffer(psd)

    // The first layer record in the file is the bottommost layer.
    const bottomAt = buf.indexOf(Buffer.from('BOTTOM', 'ascii'))
    const topAt = buf.indexOf(Buffer.from('TOP', 'ascii'))
    expect(bottomAt).toBeGreaterThan(-1)
    expect(topAt).toBeGreaterThan(-1)
    expect(bottomAt).toBeLessThan(topAt)
  })

  it('Figma children[] and ag-psd children[] agree, so no reversal is applied', () => {
    // Figma's children array is also bottom-first. Both bottom-first => no flip.
    expect(Z_ORDER_REVERSED).toBe(false)
  })

  it('buildPsd preserves plan order into psd.children', () => {
    const frame = node({
      id: 'frame',
      type: 'FRAME',
      name: 'Frame',
      absoluteBoundingBox: rect(0, 0, 100, 100),
      children: [
        node({ id: 'a', type: 'RECTANGLE', name: 'first', absoluteBoundingBox: rect(0, 0, 50, 50) }),
        node({ id: 'b', type: 'RECTANGLE', name: 'second', absoluteBoundingBox: rect(50, 50, 50, 50) }),
      ],
    })
    const plan = flattenFrame(frame, { scale: 1 })
    const rendered = new Map<string, RenderedLayer | null>([
      ['a', { pixels: solidPixels(50, 50, [255, 0, 0, 255]), rect: { left: 0, top: 0, right: 50, bottom: 50 } }],
      ['b', { pixels: solidPixels(50, 50, [0, 0, 255, 255]), rect: { left: 50, top: 50, right: 100, bottom: 100 } }],
    ])
    const { psd } = buildPsd(plan, rendered, solidPixels(100, 100, [0, 0, 0, 255]))
    expect(psd.children?.map((c) => c.name)).toEqual(['first', 'second'])
  })
})

describe('V1: write/read round-trip', () => {
  const frame = node({
    id: 'frame',
    type: 'FRAME',
    name: 'Frame',
    absoluteBoundingBox: rect(10, 20, 200, 100),
    children: [
      node({ id: 'bg', type: 'RECTANGLE', name: 'Background', absoluteBoundingBox: rect(10, 20, 200, 100) }),
      node({
        id: 'grp',
        type: 'GROUP',
        name: 'Content',
        opacity: 0.5,
        blendMode: 'MULTIPLY',
        absoluteBoundingBox: rect(30, 40, 60, 40),
        children: [
          node({ id: 'c1', type: 'RECTANGLE', name: 'Chip', absoluteBoundingBox: rect(30, 40, 20, 20) }),
          node({ id: 'c2', type: 'TEXT', name: 'Label', characters: 'Hi', absoluteBoundingBox: rect(60, 50, 30, 30) }),
        ],
      }),
      node({ id: 'ghost', type: 'RECTANGLE', name: 'Old CTA', visible: false, absoluteBoundingBox: rect(10, 20, 40, 40) }),
    ],
  })

  const build = (scale = 1) => {
    const plan: PsdPlan = flattenFrame(frame, { scale })
    const rendered = new Map<string, RenderedLayer | null>()
    for (const id of plan.rasterIds) {
      const src = findBbox(id)
      const w = Math.round(src.width * scale)
      const h = Math.round(src.height * scale)
      const left = Math.round((src.x - plan.frameBbox.x) * scale)
      const top = Math.round((src.y - plan.frameBbox.y) * scale)
      rendered.set(id, {
        pixels: solidPixels(w, h, [1, 2, 3, 255]),
        rect: { left, top, right: left + w, bottom: top + h },
      })
    }
    const composite = solidPixels(plan.width, plan.height, [9, 9, 9, 255])
    return { plan, ...buildPsd(plan, rendered, composite) }
  }

  function findBbox(id: string) {
    let found = frame.absoluteBoundingBox!
    const walk = (n: typeof frame) => {
      if (n.id === id) found = n.absoluteBoundingBox!
      n.children.forEach(walk)
    }
    walk(frame)
    return found
  }

  it('preserves structure, names, bounds, blend mode and opacity', () => {
    const { psd } = build()
    const back = readBack(writePsdBuffer(psd, { trimImageData: true }))

    expect(back.width).toBe(200)
    expect(back.height).toBe(100)
    expect(back.children).toHaveLength(3)

    const [bg, grp, ghost] = back.children!
    expect(bg!.name).toBe('Background')
    expect({ l: bg!.left, t: bg!.top, r: bg!.right, b: bg!.bottom }).toEqual({ l: 0, t: 0, r: 200, b: 100 })

    // Group: emits no pixels, so it carries the real Figma opacity.
    expect(grp!.name).toBe('Content')
    expect(grp!.blendMode).toBe('multiply')
    expect(grp!.opacity).toBeCloseTo(0.5, 2)
    expect(grp!.children).toHaveLength(2)
    expect(grp!.children!.map((c) => c.name)).toEqual(['Chip', 'Label'])

    // Hidden node survives as a named, hidden placeholder rather than vanishing.
    expect(ghost!.name).toBe('Old CTA ⟨hidden⟩')
    expect(ghost!.hidden).toBe(true)
  })

  it('placeholder bounds survive trimImageData (a 0-alpha pixel would collapse to zero-size)', () => {
    const { psd } = build()
    const back = readBack(writePsdBuffer(psd, { trimImageData: true }))
    const ghost = back.children![2]!
    // 'Old CTA' sits at (10,20) in a frame originating at (10,20) -> (0,0).
    expect({ l: ghost.left, t: ghost.top, r: ghost.right, b: ghost.bottom }).toEqual({ l: 0, t: 0, r: 1, b: 1 })
    expect(ghost.right! - ghost.left!).toBe(1)
    expect(ghost.bottom! - ghost.top!).toBe(1)
  })

  it('raster leaves carry opacity 1 (Figma baked their opacity into alpha)', () => {
    const { psd } = build()
    const back = readBack(writePsdBuffer(psd))
    const chip = back.children![1]!.children![0]!
    expect(chip.opacity).toBeCloseTo(1, 5)
  })

  it('ag-psd stores opacity as a byte, so 0.5 round-trips as 128/255', () => {
    const psd: Psd = {
      width: 10,
      height: 10,
      children: [{ name: 'half', left: 0, top: 0, right: 10, bottom: 10, opacity: 0.5, imageData: solidPixels(10, 10, [255, 0, 0, 255]) }],
    }
    const back = readBack(writePsdBuffer(psd))
    expect(back.children![0]!.opacity).not.toBe(0.5)
    expect(Math.abs(back.children![0]!.opacity! - 0.5)).toBeLessThan(OPACITY_BYTE_TOLERANCE + 1e-6)
  })

  it('scales bounds', () => {
    const { psd } = build(2)
    expect(psd.width).toBe(400)
    expect(psd.height).toBe(200)
    const back = readBack(writePsdBuffer(psd))
    const bg = back.children![0]!
    expect({ r: bg.right, b: bg.bottom }).toEqual({ r: 400, b: 200 })
  })
})

describe('composite', () => {
  it('is written, and is what a non-Photoshop reader sees', () => {
    const psd: Psd = {
      width: 8,
      height: 8,
      children: [{ name: 'l', left: 0, top: 0, right: 8, bottom: 8, imageData: solidPixels(8, 8, [255, 0, 0, 255]) }],
      imageData: solidPixels(8, 8, [10, 20, 30, 255]),
    }
    const back = readBack(writePsdBuffer(psd))
    expect(back.imageData).toBeDefined()
    expect([...back.imageData!.data.slice(0, 3)]).toEqual([10, 20, 30])
  })

  it('omitting the composite yields opaque black — the trap buildPsd guards against', () => {
    const psd: Psd = {
      width: 8,
      height: 8,
      children: [{ name: 'l', left: 0, top: 0, right: 8, bottom: 8, imageData: solidPixels(8, 8, [255, 0, 0, 255]) }],
    }
    const back = readBack(writePsdBuffer(psd))
    expect([...back.imageData!.data.slice(0, 4)]).toEqual([0, 0, 0, 255])
  })

  it('buildPsd refuses a composite whose size does not match the canvas', () => {
    const frame = node({ id: 'f', type: 'FRAME', absoluteBoundingBox: rect(0, 0, 20, 20), children: [] })
    const plan = flattenFrame(frame, { scale: 1 })
    expect(() => buildPsd(plan, new Map(), solidPixels(19, 20, [0, 0, 0, 255]))).toThrow(/Composite is 19x20/)
  })
})
