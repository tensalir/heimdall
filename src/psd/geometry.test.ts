import { describe, expect, it } from 'vitest'
import { isDisjoint, planLayerPlacement, psdCanvasSize, toPsdRect } from './geometry.js'
import { rect } from './testSupport.js'
import { PsdExportError } from './types.js'

const frameBbox = rect(100, 200, 400, 300)

describe('toPsdRect', () => {
  it('offsets by the frame origin and trusts the PNG for size', () => {
    const { rect: r } = toPsdRect(rect(150, 250, 50, 40), frameBbox, 1, 50, 40, 'n')
    expect(r).toEqual({ left: 50, top: 50, right: 100, bottom: 90 })
  })

  it('scales position and takes size from the pixels, not from width*scale', () => {
    // Figma rounds x and width independently; deriving `right` from width*scale
    // would produce a 1px seam. 101 is what the renderer actually returned.
    const { rect: r } = toPsdRect(rect(150, 250, 50.4, 40), frameBbox, 2, 101, 80, 'n')
    expect(r).toEqual({ left: 100, top: 100, right: 201, bottom: 180 })
  })

  it('allows negative left/top — a shadow escaping a clipping frame is legal', () => {
    const { rect: r } = toPsdRect(rect(80, 180, 60, 60), frameBbox, 1, 60, 60, 'n')
    expect(r).toEqual({ left: -20, top: -20, right: 40, bottom: 40 })
  })

  it('accepts 1px drift silently', () => {
    const { drift } = toPsdRect(rect(150, 250, 50, 40), frameBbox, 1, 51, 40, 'n')
    expect(drift).toBeUndefined()
  })

  it('reports 2-3px drift but still places the layer', () => {
    const { rect: r, drift } = toPsdRect(rect(150, 250, 50, 40), frameBbox, 1, 53, 40, 'n')
    expect(drift).toEqual({ expectedW: 50, expectedH: 40, actualW: 53, actualH: 40 })
    expect(r.right).toBe(103)
  })

  it('throws rather than guessing an effective scale when drift is large', () => {
    expect(() => toPsdRect(rect(150, 250, 50, 40), frameBbox, 1, 25, 20, 'Headline (1:2)')).toThrow(PsdExportError)
    expect(() => toPsdRect(rect(150, 250, 50, 40), frameBbox, 1, 25, 20, 'Headline (1:2)')).toThrow(/lower --scale/)
  })
})

describe('planLayerPlacement', () => {
  it('Case A: a fitting node places at its render bounds, no crop', () => {
    const p = planLayerPlacement(rect(150, 250, 50, 40), rect(150, 250, 50, 40), frameBbox, 1, 50, 40, 'n')
    expect(p.crop).toBeUndefined()
    expect(p.resize).toBeUndefined()
    expect(p.rect).toEqual({ left: 50, top: 50, right: 100, bottom: 90 })
  })

  it('Case A: shadow bleed (render bounds larger than bbox) is placed as-is', () => {
    // rb extends up/left of bb by the drop shadow; the PNG matches rb.
    const p = planLayerPlacement(rect(150, 250, 50, 40), rect(145, 245, 60, 50), frameBbox, 1, 60, 50, 'n')
    expect(p.crop).toBeUndefined()
    expect(p.rect).toEqual({ left: 45, top: 45, right: 105, bottom: 95 })
  })

  it('Case B: a node clipped by its frame is cropped to the visible region', () => {
    // bb is the full node (100x80); only its top-left 50x40 shows through the frame.
    // Figma renders the whole bb at scale, so pixels are 100x80, not 50x40.
    const p = planLayerPlacement(rect(150, 250, 100, 80), rect(150, 250, 50, 40), frameBbox, 1, 100, 80, 'n')
    expect(p.crop).toEqual({ left: 0, top: 0, width: 50, height: 40 })
    expect(p.resize).toBeUndefined()
    expect(p.rect).toEqual({ left: 50, top: 50, right: 100, bottom: 90 })
  })

  it('Case B: a clamped oversized render is cropped then resized up to target', () => {
    // Figma clamped the render to half size (k=0.5). Visible region rb=40x30 at
    // an offset inside bb; the crop is at k, the layer rect is at full scale.
    const p = planLayerPlacement(rect(150, 250, 100, 80), rect(200, 270, 40, 30), frameBbox, 1, 50, 40, 'n')
    expect(p.crop).toEqual({ left: 25, top: 10, width: 20, height: 15 })
    expect(p.resize).toEqual({ width: 40, height: 30 })
    expect(p.rect).toEqual({ left: 100, top: 70, right: 140, bottom: 100 })
  })

  it('throws when the render is neither a fitting nor a clipped node (rotation/skew)', () => {
    // rb == bb but the PNG scales anisotropically: 80/50 ≠ 50/40.
    expect(() =>
      planLayerPlacement(rect(150, 250, 50, 40), rect(150, 250, 50, 40), frameBbox, 1, 80, 50, 'Logo (9:9)')
    ).toThrow(PsdExportError)
  })
})

describe('psdCanvasSize', () => {
  it('rounds', () => {
    expect(psdCanvasSize(rect(0, 0, 100.4, 100.6), 1)).toEqual({ width: 100, height: 101 })
    expect(psdCanvasSize(rect(0, 0, 100, 100), 2)).toEqual({ width: 200, height: 200 })
  })
})

describe('isDisjoint', () => {
  it('detects separation and overlap', () => {
    expect(isDisjoint(rect(0, 0, 10, 10), rect(20, 0, 10, 10))).toBe(true)
    expect(isDisjoint(rect(0, 0, 10, 10), rect(9, 9, 10, 10))).toBe(false)
    // Edge-touching counts as disjoint: zero shared area.
    expect(isDisjoint(rect(0, 0, 10, 10), rect(10, 0, 10, 10))).toBe(true)
  })
})
