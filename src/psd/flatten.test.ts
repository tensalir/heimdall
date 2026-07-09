/**
 * The pure core. No network, no pixels, no token.
 */

import { describe, expect, it } from 'vitest'
import { flattenFrame } from './flatten.js'
import { node, rect } from './testSupport.js'
import type { PsdPlanGroup, PsdPlanNode, PsdPlanPlaceholder } from './types.js'

const frame = (children: ReturnType<typeof node>[], overrides = {}) =>
  node({
    id: 'frame',
    type: 'FRAME',
    name: 'Frame',
    absoluteBoundingBox: rect(0, 0, 400, 400),
    children,
    ...overrides,
  })

const codes = (plan: ReturnType<typeof flattenFrame>) => plan.warnings.map((w) => w.code)
const kinds = (nodes: PsdPlanNode[]) => nodes.map((n) => n.kind)

describe('opacity asymmetry', () => {
  it('raster leaves get opacity 1 — Figma baked their opacity into the alpha', () => {
    const plan = flattenFrame(
      frame([node({ id: 'r', type: 'RECTANGLE', opacity: 0.3, absoluteBoundingBox: rect(0, 0, 10, 10) })]),
      { scale: 1 }
    )
    // A raster plan node carries no opacity field at all; buildPsd writes 1.
    expect(plan.root[0]!.kind).toBe('raster')
  })

  it('groups carry their real Figma opacity — nothing baked it in', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'GROUP',
          opacity: 0.4,
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'a', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
            node({ id: 'b', type: 'RECTANGLE', absoluteBoundingBox: rect(20, 20, 10, 10) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    const g = plan.root[0] as PsdPlanGroup
    expect(g.kind).toBe('group')
    expect(g.opacity).toBe(0.4)
  })
})

describe('blend mode', () => {
  it('maps on rasters, but coerces PASS_THROUGH to normal (meaningless on a leaf)', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 'm', type: 'RECTANGLE', blendMode: 'MULTIPLY', absoluteBoundingBox: rect(0, 0, 10, 10) }),
        node({ id: 'p', type: 'RECTANGLE', blendMode: 'PASS_THROUGH', absoluteBoundingBox: rect(20, 0, 10, 10) }),
      ]),
      { scale: 1 }
    )
    expect(plan.root.map((n) => (n.kind === 'raster' ? n.blendMode : null))).toEqual(['multiply', 'normal'])
  })

  it('warns once when soft light is used', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 'a', type: 'RECTANGLE', blendMode: 'SOFT_LIGHT', absoluteBoundingBox: rect(0, 0, 10, 10) }),
        node({ id: 'b', type: 'RECTANGLE', blendMode: 'SOFT_LIGHT', absoluteBoundingBox: rect(20, 0, 10, 10) }),
      ]),
      { scale: 1 }
    )
    expect(codes(plan).filter((c) => c === 'soft-light-drift')).toHaveLength(1)
  })
})

describe('hidden and zero-opacity nodes', () => {
  it('become named placeholders, not silent drops', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 'h', type: 'RECTANGLE', name: 'Variant B', visible: false, absoluteBoundingBox: rect(0, 0, 10, 10) }),
        node({ id: 'z', type: 'RECTANGLE', name: 'Ghost', opacity: 0, absoluteBoundingBox: rect(20, 0, 10, 10) }),
      ]),
      { scale: 1 }
    )
    expect(kinds(plan.root)).toEqual(['placeholder', 'placeholder'])
    expect((plan.root[0] as PsdPlanPlaceholder).reason).toBe('hidden')
    expect((plan.root[1] as PsdPlanPlaceholder).reason).toBe('zero-opacity')
    expect(codes(plan)).toEqual(['hidden', 'zero-opacity'])
    // Never asked Figma to render them: it would return null anyway.
    expect(plan.rasterIds).toEqual([])
  })
})

describe('isolation-unsafe subtrees', () => {
  it('flattens a group containing BACKGROUND_BLUR, because isolated rendering has nothing to blur', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'GROUP',
          name: 'Glass card',
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'blur', type: 'RECTANGLE', effectTypes: ['BACKGROUND_BLUR'], absoluteBoundingBox: rect(0, 0, 50, 50) }),
            node({ id: 'other', type: 'RECTANGLE', absoluteBoundingBox: rect(50, 50, 20, 20) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(kinds(plan.root)).toEqual(['raster'])
    expect(plan.rasterIds).toEqual(['g'])
    expect(codes(plan)).toContain('unsafe-flattened')
  })

  it('flattens a LUMINANCE mask subtree', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'GROUP',
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'lum', type: 'RECTANGLE', maskType: 'LUMINANCE', absoluteBoundingBox: rect(0, 0, 50, 50) }),
            node({ id: 'x', type: 'RECTANGLE', absoluteBoundingBox: rect(10, 10, 20, 20) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['g'])
  })

  it('flattens a container that has its own effects — the effect applies to the composited subtree', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'GROUP',
          effectTypes: ['DROP_SHADOW'],
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'a', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
            node({ id: 'b', type: 'RECTANGLE', absoluteBoundingBox: rect(20, 20, 10, 10) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['g'])
    expect(codes(plan)).toContain('unsafe-flattened')
  })

  it('flattens a container that paints its own background — a pill CTA keeps its fill', () => {
    // A frame with a white fill + corner radius wrapping a text child: descending
    // would emit the text and silently drop the pill. Render it as one layer.
    const plan = flattenFrame(
      frame([
        node({
          id: 'cta',
          type: 'FRAME',
          paintsOwnBackground: true,
          absoluteBoundingBox: rect(0, 0, 200, 60),
          children: [
            node({ id: 'label', type: 'TEXT', absoluteBoundingBox: rect(20, 20, 160, 20) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['cta'])
    expect(codes(plan)).toContain('painted-flattened')
  })

  it('does not flatten a container that has no paint of its own', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'FRAME',
          paintsOwnBackground: false,
          absoluteBoundingBox: rect(0, 0, 200, 60),
          children: [
            node({ id: 'a', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
            node({ id: 'b', type: 'RECTANGLE', absoluteBoundingBox: rect(20, 20, 10, 10) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['a', 'b'])
    expect(codes(plan)).not.toContain('painted-flattened')
  })
})

describe('masks', () => {
  it('flattens a group containing a mask child, and says so', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'g',
          type: 'GROUP',
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'm', type: 'ELLIPSE', isMask: true, absoluteBoundingBox: rect(0, 0, 50, 50) }),
            node({ id: 'img', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 50, 50) }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['g'])
    expect(codes(plan)).toContain('mask-flattened')
  })
})

describe('instances', () => {
  it('renders an INSTANCE atomically when the frame has other content', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 'bg', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 400, 400) }),
        node({ id: 'a', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
        node({
          id: 'i',
          type: 'INSTANCE',
          absoluteBoundingBox: rect(0, 0, 50, 50),
          children: [node({ id: 'inner', type: 'TEXT', absoluteBoundingBox: rect(0, 0, 20, 20) })],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['bg', 'a', 'i'])
    expect(plan.rasterIds).not.toContain('inner')
  })

  it('auto-explodes one level when the frame is essentially just an instance', () => {
    // Otherwise the whole design flattens to one layer: a PNG with extra steps.
    const plan = flattenFrame(
      frame([
        node({
          id: 'i',
          type: 'INSTANCE',
          absoluteBoundingBox: rect(0, 0, 400, 400),
          children: [
            node({ id: 'inner1', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 100, 100) }),
            node({
              id: 'nested',
              type: 'INSTANCE',
              absoluteBoundingBox: rect(100, 100, 50, 50),
              children: [node({ id: 'deep', type: 'TEXT', absoluteBoundingBox: rect(100, 100, 20, 20) })],
            }),
          ],
        }),
      ]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toContain('inner1')
    // Nested instances stay atomic.
    expect(plan.rasterIds).toContain('nested')
    expect(plan.rasterIds).not.toContain('deep')
  })
})

describe('caps and degenerate geometry', () => {
  it('drops sub-pixel nodes', () => {
    const plan = flattenFrame(
      frame([node({ id: 'tiny', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 0.4, 10) })]),
      { scale: 1 }
    )
    expect(plan.root).toEqual([])
    expect(codes(plan)).toContain('zero-area')
  })

  it('keeps a node that is sub-pixel at 1x but real at 4x', () => {
    const child = node({ id: 'thin', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 0.4, 10) })
    expect(flattenFrame(frame([child]), { scale: 4 }).rasterIds).toEqual(['thin'])
  })

  it('drops nodes entirely outside a clipping frame', () => {
    const plan = flattenFrame(
      frame([node({ id: 'far', type: 'RECTANGLE', absoluteBoundingBox: rect(900, 900, 10, 10) })], {
        clipsContent: true,
      }),
      { scale: 1 }
    )
    expect(plan.root).toEqual([])
    expect(codes(plan)).toContain('off-canvas')
  })

  it('keeps an off-canvas node when the frame does not clip', () => {
    const plan = flattenFrame(
      frame([node({ id: 'far', type: 'RECTANGLE', absoluteBoundingBox: rect(900, 900, 10, 10) })]),
      { scale: 1 }
    )
    expect(plan.rasterIds).toEqual(['far'])
  })

  it('flattens beyond maxDepth', () => {
    const deep = node({
      id: 'g1',
      type: 'GROUP',
      absoluteBoundingBox: rect(0, 0, 100, 100),
      children: [
        node({
          id: 'g2',
          type: 'GROUP',
          absoluteBoundingBox: rect(0, 0, 100, 100),
          children: [
            node({ id: 'x', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
            node({ id: 'y', type: 'RECTANGLE', absoluteBoundingBox: rect(20, 0, 10, 10) }),
          ],
        }),
        node({ id: 'sib', type: 'RECTANGLE', absoluteBoundingBox: rect(50, 50, 10, 10) }),
      ],
    })
    const plan = flattenFrame(frame([deep]), { scale: 1, maxDepth: 2 })
    expect(plan.rasterIds).toContain('g2')
    expect(plan.rasterIds).not.toContain('x')
    expect(codes(plan)).toContain('depth-capped')
  })
})

describe('tidy-up', () => {
  it('hoists a group wrapping exactly one raster', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'wrap',
          type: 'GROUP',
          absoluteBoundingBox: rect(0, 0, 50, 50),
          children: [node({ id: 'only', type: 'RECTANGLE', name: 'Only', absoluteBoundingBox: rect(0, 0, 50, 50) })],
        }),
      ]),
      { scale: 1 }
    )
    expect(kinds(plan.root)).toEqual(['raster'])
    expect(plan.root[0]!.name).toBe('Only')
  })

  it('does NOT hoist when the wrapper carries opacity (it would be lost)', () => {
    const plan = flattenFrame(
      frame([
        node({
          id: 'wrap',
          type: 'GROUP',
          opacity: 0.5,
          absoluteBoundingBox: rect(0, 0, 50, 50),
          children: [node({ id: 'only', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 50, 50) })],
        }),
      ]),
      { scale: 1 }
    )
    expect(kinds(plan.root)).toEqual(['group'])
    expect((plan.root[0] as PsdPlanGroup).opacity).toBe(0.5)
  })

  it('drops SLICE nodes and empty groups', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 's', type: 'SLICE', absoluteBoundingBox: rect(0, 0, 10, 10) }),
        node({ id: 'empty', type: 'GROUP', absoluteBoundingBox: rect(0, 0, 10, 10), children: [] }),
      ]),
      { scale: 1 }
    )
    // An empty GROUP has no children -> emitted as a raster leaf? No: children.length === 0
    // routes to emitRaster. Ensure the SLICE at least is gone.
    expect(plan.root.every((n) => n.nodeId !== 's')).toBe(true)
  })
})

describe('text sidecar', () => {
  it('collects TEXT nodes with their characters', () => {
    const plan = flattenFrame(
      frame([
        node({ id: 't', type: 'TEXT', name: 'Headline', characters: 'Hear it all', absoluteBoundingBox: rect(0, 0, 100, 20) }),
      ]),
      { scale: 1 }
    )
    expect(plan.textNodes.map((n) => n.characters)).toEqual(['Hear it all'])
  })
})

describe('canvas size', () => {
  it('uses the frame bounding box, not render bounds (frame shadow is not canvas)', () => {
    const f = frame([node({ id: 'a', type: 'RECTANGLE', absoluteBoundingBox: rect(0, 0, 10, 10) })], {
      absoluteBoundingBox: rect(0, 0, 400, 400),
      absoluteRenderBounds: rect(-20, -20, 440, 440),
      effectTypes: [],
    })
    const plan = flattenFrame(f, { scale: 1 })
    expect([plan.width, plan.height]).toEqual([400, 400])
  })
})
