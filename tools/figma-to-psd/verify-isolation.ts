/**
 * V3: settle the opacity asymmetry against the live Figma renderer.
 *
 * src/psd/buildPsd.ts assumes:
 *   raster leaf -> PSD opacity 1   (Figma already baked the node's OWN opacity
 *                                   into the alpha channel when rendering it alone)
 *   group       -> PSD opacity = Figma opacity  (a group emits no pixels, so
 *                                   nothing baked its opacity into anything)
 *
 * Both halves rest on one claim: `GET /v1/images` renders a node AS ITS OWN ROOT,
 * ignoring ancestor opacity, blend mode and masks. If that is wrong — if ancestor
 * opacity IS applied — the rule must invert (groups get opacity 1, leaves keep it
 * baked), or every grouped layer comes out double-darkened.
 *
 * This probe finds the evidence in a real file rather than assuming:
 *   A. a fully-opaque leaf inside a semi-transparent ancestor
 *        -> alpha ~255  => ancestor opacity NOT applied  => current rule correct
 *        -> alpha ~255*ancestorOpacity => ancestor opacity IS applied => INVERT
 *   B. a leaf with its own opacity < 1
 *        -> alpha ~255*ownOpacity => self-opacity IS baked => leaves must use 1
 *
 * Usage:
 *   npx tsx tools/figma-to-psd/verify-isolation.ts --file <key> --node <frameId>
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import sharp from 'sharp'
import {
  exportNodeImagesWithRetry,
  getFileNodes,
  normalizeNodeId,
} from '../../src/integrations/figma/restClient.ts'
import { normalizeFigmaNode } from '../../src/psd/figmaNode.ts'
import { ATOMIC_TYPES } from '../../src/psd/flatten.ts'
import type { FigmaNodeLite } from '../../src/psd/types.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

interface Candidate {
  node: FigmaNodeLite
  ancestorOpacity: number
  ancestorName: string
}

/**
 * Opaque, renderable leaves whose ancestor chain multiplies to < 1.
 * `acc` is the product of the opacities of all *strict* ancestors below the frame.
 */
function findAncestorOpacityCases(root: FigmaNodeLite): Candidate[] {
  const out: Candidate[] = []
  const walk = (n: FigmaNodeLite, acc: number, who: string) => {
    const isLeaf = ATOMIC_TYPES.has(n.type) || n.children.length === 0
    if (isLeaf) {
      const hasBounds = !!(n.absoluteRenderBounds ?? n.absoluteBoundingBox)
      if (n.visible && n.opacity === 1 && acc < 1 && hasBounds) {
        out.push({ node: n, ancestorOpacity: acc, ancestorName: who })
      }
      return
    }
    for (const c of n.children) {
      if (!c.visible) continue
      walk(c, acc * n.opacity, n.opacity < 1 ? n.name : who)
    }
  }
  // The frame's own opacity is not an "ancestor" for our purposes.
  for (const c of root.children) if (c.visible) walk(c, 1, root.name)
  return out
}

/** Visible leaves with their own opacity strictly between 0 and 1. */
function findSelfOpacityCases(root: FigmaNodeLite): FigmaNodeLite[] {
  const out: FigmaNodeLite[] = []
  const walk = (n: FigmaNodeLite) => {
    const isLeaf = ATOMIC_TYPES.has(n.type) || n.children.length === 0
    if (isLeaf && n.visible && n.opacity > 0 && n.opacity < 1) out.push(n)
    for (const c of n.children) if (c.visible) walk(c)
  }
  walk(root)
  return out
}

async function maxAlpha(fileKey: string, nodeId: string): Promise<{ max: number; mean: number } | null> {
  const images = await exportNodeImagesWithRetry(fileKey, [nodeId], { format: 'png', scale: 1 })
  const url = images[nodeId]
  if (!url) return null
  const png = Buffer.from(await (await fetch(url)).arrayBuffer())
  const { data, info } = await sharp(png).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  let max = 0
  let sum = 0
  let count = 0
  for (let i = 3; i < data.length; i += info.channels) {
    const a = data[i]!
    if (a > max) max = a
    if (a > 0) {
      sum += a
      count++
    }
  }
  return { max, mean: count ? sum / count : 0 }
}

async function main(): Promise<void> {
  const fileKey = arg('file')
  const frameId = arg('node')
  if (!fileKey || !frameId) {
    console.error('usage: npx tsx tools/figma-to-psd/verify-isolation.ts --file <key> --node <frameId>')
    process.exit(1)
  }

  const res = await getFileNodes(fileKey, [normalizeNodeId(frameId)])
  if (!res || res.err) {
    console.error(`Cannot read ${frameId} — token expired, or no access. ${res?.err ?? ''}`)
    process.exit(1)
  }
  const doc = res.nodes[normalizeNodeId(frameId)]?.document
  if (!doc) {
    console.error(`Node ${frameId} not found`)
    process.exit(1)
  }
  const root = normalizeFigmaNode(doc)

  console.log(`\nFrame "${root.name}" (${root.id})\n`)

  // ── A. ancestor opacity ────────────────────────────────────────
  const ancestorCases = findAncestorOpacityCases(root)
  console.log(`A. opaque leaves under a semi-transparent ancestor: ${ancestorCases.length}`)
  if (ancestorCases.length === 0) {
    console.log('   none found — build a scratch frame: an opaque rect inside a 50%-opacity group.\n')
  } else {
    const c = ancestorCases[0]!
    const stats = await maxAlpha(fileKey, c.node.id)
    if (!stats) {
      console.log(`   "${c.node.name}" did not render.\n`)
    } else {
      const expectedIfApplied = Math.round(255 * c.ancestorOpacity)
      console.log(`   node "${c.node.name}" (${c.node.id}), own opacity 1`)
      console.log(`   ancestor "${c.ancestorName}" cumulative opacity ${c.ancestorOpacity.toFixed(3)}`)
      console.log(`   rendered alpha: max=${stats.max}  mean(nonzero)=${stats.mean.toFixed(1)}`)
      console.log(`   if ancestor opacity were applied, max would be ~${expectedIfApplied}`)
      if (stats.max >= 250) {
        console.log(`   => VERDICT: ancestor opacity is NOT applied. buildPsd.ts's rule is CORRECT.\n`)
      } else if (Math.abs(stats.max - expectedIfApplied) <= 4) {
        console.log(`   => VERDICT: ancestor opacity IS applied. INVERT the rule in buildPsd.ts:`)
        console.log(`      groups must get opacity 1, and leaves keep their baked-in value.\n`)
      } else {
        console.log(`   => INCONCLUSIVE (antialiasing?). Try a leaf that is a solid opaque rectangle.\n`)
      }
    }
  }

  // ── B. self opacity ────────────────────────────────────────────
  const selfCases = findSelfOpacityCases(root)
  console.log(`B. leaves with their own opacity in (0,1): ${selfCases.length}`)
  if (selfCases.length === 0) {
    console.log('   none found — set a rect to 50% opacity in the scratch frame.\n')
  } else {
    const n = selfCases[0]!
    const stats = await maxAlpha(fileKey, n.id)
    if (!stats) {
      console.log(`   "${n.name}" did not render.\n`)
    } else {
      const expected = Math.round(255 * n.opacity)
      console.log(`   node "${n.name}" (${n.id}), own opacity ${n.opacity}`)
      console.log(`   rendered alpha: max=${stats.max}  (expected ~${expected} if baked in)`)
      if (Math.abs(stats.max - expected) <= 4) {
        console.log(`   => VERDICT: self opacity IS baked into alpha. Raster layers must use PSD opacity 1.\n`)
      } else if (stats.max >= 250) {
        console.log(`   => VERDICT: self opacity is NOT baked. Raster layers must carry the Figma opacity.\n`)
      } else {
        console.log(`   => INCONCLUSIVE.\n`)
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
