/**
 * V6: the whole pipeline, offline. Zero network, zero Figma token.
 *
 * This is the payoff of the LayerSource seam. If the seam doesn't buy us this,
 * it isn't earning its keep.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { readPsd } from 'ag-psd'
import { exportFrameToPsd } from './exportFramesToPsd.js'
import { fakeLayerSource, initReadOnlyCanvasShim, node, rect } from './testSupport.js'

beforeAll(initReadOnlyCanvasShim)

const tree = node({
  id: '1:1',
  type: 'FRAME',
  name: 'Amazon Hero A+',
  absoluteBoundingBox: rect(0, 0, 200, 100),
  children: [
    node({ id: '1:2', type: 'RECTANGLE', name: 'Background', absoluteBoundingBox: rect(0, 0, 200, 100) }),
    node({
      id: '1:3',
      type: 'GROUP',
      name: 'Copy block',
      opacity: 0.8,
      absoluteBoundingBox: rect(10, 10, 100, 50),
      children: [
        node({ id: '1:4', type: 'TEXT', name: 'Headline', characters: 'Hear it all', absoluteBoundingBox: rect(10, 10, 100, 20) }),
        node({ id: '1:5', type: 'TEXT', name: 'Sub', characters: 'Feel it less', absoluteBoundingBox: rect(10, 35, 80, 15) }),
      ],
    }),
    node({ id: '1:6', type: 'RECTANGLE', name: 'Old CTA', visible: false, absoluteBoundingBox: rect(150, 70, 40, 20) }),
  ],
})

describe('exportFrameToPsd (offline)', () => {
  it('produces a readable PSD with the expected structure', async () => {
    const result = await exportFrameToPsd(fakeLayerSource(tree), '1:1', { scale: 1 })

    expect(result.frameName).toBe('Amazon Hero A+')
    expect(result.width).toBe(200)
    expect(result.height).toBe(100)
    expect(result.psd.subarray(0, 4).toString('ascii')).toBe('8BPS')

    const back = readPsd(result.psd, { useImageData: true, skipThumbnail: true })
    expect(back.width).toBe(200)
    expect(back.children?.map((c) => c.name)).toEqual(['Background', 'Copy block', 'Old CTA ⟨hidden⟩'])

    const group = back.children![1]!
    expect(group.opacity).toBeCloseTo(0.8, 2)
    expect(group.children?.map((c) => c.name)).toEqual(['Headline', 'Sub'])

    // Composite present -> non-Photoshop viewers see the artwork, not black.
    expect([...back.imageData!.data.slice(0, 3)]).toEqual([10, 20, 30])
  })

  it('emits a text sidecar with copy and PSD-space bounds', async () => {
    const result = await exportFrameToPsd(fakeLayerSource(tree), '1:1', { scale: 1 })
    expect(result.textSidecar.nodes).toEqual([
      expect.objectContaining({ id: '1:4', name: 'Headline', characters: 'Hear it all', rect: { left: 10, top: 10, right: 110, bottom: 30 } }),
      expect.objectContaining({ id: '1:5', name: 'Sub', characters: 'Feel it less', rect: { left: 10, top: 35, right: 90, bottom: 50 } }),
    ])
  })

  it('warns about the hidden layer rather than dropping it', async () => {
    const result = await exportFrameToPsd(fakeLayerSource(tree), '1:1', { scale: 1 })
    expect(result.warnings.map((w) => w.code)).toContain('hidden')
    expect(result.warnings.find((w) => w.code === 'hidden')?.nodeName).toBe('Old CTA')
  })

  it('downgrades an unrenderable node to a hidden placeholder + render-failed warning', async () => {
    const source = fakeLayerSource(tree, { unrenderable: new Set(['1:2']) })
    const result = await exportFrameToPsd(source, '1:1', { scale: 1 })

    expect(result.warnings.map((w) => w.code)).toContain('render-failed')
    const back = readPsd(result.psd, { useImageData: true, skipThumbnail: true })
    expect(back.children![0]!.name).toBe('Background ⟨render-failed⟩')
    expect(back.children![0]!.hidden).toBe(true)
  })

  it('scales the whole document', async () => {
    const result = await exportFrameToPsd(fakeLayerSource(tree), '1:1', { scale: 2 })
    expect([result.width, result.height]).toEqual([400, 200])
    const back = readPsd(result.psd, { useImageData: true, skipThumbnail: true })
    const bg = back.children![0]!
    expect({ r: bg.right, b: bg.bottom }).toEqual({ r: 400, b: 200 })
  })

  it('counts layers, groups included as containers of their children', async () => {
    const result = await exportFrameToPsd(fakeLayerSource(tree), '1:1', { scale: 1 })
    // Background + (Headline + Sub) + hidden placeholder
    expect(result.layerCount).toBe(4)
  })
})
