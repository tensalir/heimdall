/**
 * Phase 0 feasibility probe for the Figma -> PSD exporter. READ-ONLY.
 *
 * Answers one question: can the REST API alone produce a faithful layered PSD
 * for THESE files, or do we need the plugin?
 *
 * The REST image endpoint renders a node in isolation. Three things break that:
 *   - visible:false / opacity:0  -> Figma returns null, the layer cannot render
 *   - BACKGROUND_BLUR            -> nothing behind the node to blur; clear pane
 *   - maskType: LUMINANCE        -> needs the masked content present
 * The first is survivable (hidden placeholder layers). The last two are hard
 * tripwires: they force the whole subtree to be flattened, and if they sit near
 * the frame root you get a one-layer PSD, i.e. a PNG with extra steps.
 *
 * Usage:
 *   npm run psd:probe -- --file <fileKey>                 # list pages + frames
 *   npm run psd:probe -- --file <fileKey> --node 1-23,1-99
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getFile, getFileNodes, normalizeNodeId } from '../../src/integrations/figma/restClient.ts'
import { normalizeFigmaNode, walk } from '../../src/psd/figmaNode.ts'
import { ATOMIC_TYPES, CONTAINER_TYPES } from '../../src/psd/flatten.ts'
import type { FigmaNodeLite } from '../../src/psd/types.ts'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

interface Metrics {
  total: number
  renderableLeaves: number
  hidden: number
  zeroOpacity: number
  backgroundBlur: string[]
  luminanceMask: string[]
  masks: number
  containerEffects: number
  textNodes: number
  instances: number
  maxDepth: number
  maxInstanceDepth: number
  byType: Map<string, number>
}

function measure(root: FigmaNodeLite): Metrics {
  const m: Metrics = {
    total: 0,
    renderableLeaves: 0,
    hidden: 0,
    zeroOpacity: 0,
    backgroundBlur: [],
    luminanceMask: [],
    masks: 0,
    containerEffects: 0,
    textNodes: 0,
    instances: 0,
    maxDepth: 0,
    maxInstanceDepth: 0,
    byType: new Map(),
  }

  const instanceDepthOf = (n: FigmaNodeLite, d = 0): number => {
    const here = n.type === 'INSTANCE' ? d + 1 : d
    return n.children.reduce((max, c) => Math.max(max, instanceDepthOf(c, here)), here)
  }
  m.maxInstanceDepth = instanceDepthOf(root)

  walk(root, (n, depth) => {
    m.total++
    m.maxDepth = Math.max(m.maxDepth, depth)
    m.byType.set(n.type, (m.byType.get(n.type) ?? 0) + 1)

    if (!n.visible) { m.hidden++; return }        // don't count hidden subtrees twice
    if (n.opacity === 0) { m.zeroOpacity++; return }

    if (n.effectTypes.includes('BACKGROUND_BLUR')) m.backgroundBlur.push(`${n.name} (${n.id})`)
    if (n.maskType === 'LUMINANCE') m.luminanceMask.push(`${n.name} (${n.id})`)
    if (n.isMask) m.masks++
    if (n.type === 'TEXT') m.textNodes++
    if (n.type === 'INSTANCE') m.instances++
    if (CONTAINER_TYPES.has(n.type) && n.effectTypes.length > 0) m.containerEffects++

    const isLeaf = ATOMIC_TYPES.has(n.type) || n.children.length === 0
    if (isLeaf) m.renderableLeaves++
  })

  return m
}

function verdict(m: Metrics): string[] {
  const out: string[] = []
  if (m.backgroundBlur.length) {
    out.push(`TRIPWIRE  ${m.backgroundBlur.length} BACKGROUND_BLUR node(s) — REST renders these as a clear pane.`)
    for (const n of m.backgroundBlur.slice(0, 5)) out.push(`            ${n}`)
  }
  if (m.luminanceMask.length) {
    out.push(`TRIPWIRE  ${m.luminanceMask.length} LUMINANCE mask(s) — cannot survive isolated rendering.`)
    for (const n of m.luminanceMask.slice(0, 5)) out.push(`            ${n}`)
  }
  if (m.renderableLeaves > 400) {
    out.push(`TRIPWIRE  ${m.renderableLeaves} renderable leaves (> 400). Neither path handles this well.`)
  }
  const hiddenPct = m.renderableLeaves > 0 ? (m.hidden / m.renderableLeaves) * 100 : 0
  if (hiddenPct > 15) {
    out.push(`QUESTION  ${m.hidden} hidden node(s) = ${hiddenPct.toFixed(0)}% of leaves. Does the team need them?`)
  } else if (m.hidden > 0) {
    out.push(`OK        ${m.hidden} hidden node(s) — will become named placeholder layers.`)
  }
  if (m.masks) out.push(`NOTE      ${m.masks} mask node(s) — v1 flattens each masked group.`)
  if (m.containerEffects) out.push(`NOTE      ${m.containerEffects} container(s) with effects — flattened atomically.`)
  if (out.length === 0 || out.every((l) => l.startsWith('OK') || l.startsWith('NOTE'))) {
    out.unshift('GO        No hard tripwires. The REST path should work.')
  }
  return out
}

async function listFrames(fileKey: string): Promise<void> {
  const file = await getFile(fileKey, { depth: 2 })
  if (!file) {
    console.error(
      `\nCannot read file ${fileKey}.\n` +
        `  - Is FIGMA_ACCESS_TOKEN set and unexpired? (GET /v1/me should return your user)\n` +
        `  - Does the token have file_content:read scope and access to this file?\n`
    )
    process.exit(1)
  }
  console.log(`\nFile: ${file.name}\n`)
  for (const page of (file.document?.children ?? []) as Array<Record<string, unknown>>) {
    console.log(`  PAGE  ${page.name}  (${page.id})`)
    const kids = (page.children ?? []) as Array<Record<string, unknown>>
    const frames = kids.filter((k) => k.type === 'FRAME' || k.type === 'COMPONENT' || k.type === 'SECTION')
    if (!frames.length) console.log('        (no top-level frames)')
    for (const f of frames) console.log(`        ${String(f.type).padEnd(10)} ${f.name}  --node ${f.id}`)
  }
  console.log(`\nRe-run with --node <id[,id...]> to probe specific frames.\n`)
}

async function main(): Promise<void> {
  const fileKey = arg('file')
  if (!fileKey) {
    console.error('usage: npm run psd:probe -- --file <fileKey> [--node 1-23,1-99]')
    process.exit(1)
  }

  const nodeArg = arg('node')
  if (!nodeArg) return listFrames(fileKey)

  const nodeIds = nodeArg.split(',').map((s) => normalizeNodeId(s.trim())).filter(Boolean)
  const res = await getFileNodes(fileKey, nodeIds)
  if (!res) {
    console.error(`\nCannot read nodes from ${fileKey} — token expired, or no access.\n`)
    process.exit(1)
  }
  if (res.err) {
    console.error(`\nFigma error: ${res.err}\n`)
    process.exit(1)
  }

  for (const nodeId of nodeIds) {
    const entry = res.nodes[nodeId]
    if (!entry?.document) {
      console.log(`\n=== ${nodeId} — NOT FOUND ===`)
      continue
    }
    const root = normalizeFigmaNode(entry.document)

    // A CANVAS (page) is not a visual; probe each of its frames instead.
    if (root.type === 'CANVAS') {
      console.log(`\n=== ${nodeId} is a PAGE ("${root.name}") — probing its ${root.children.length} children ===`)
      for (const child of root.children) reportFrame(child)
      continue
    }
    reportFrame(root)
  }
}

function reportFrame(root: FigmaNodeLite): void {
  const bbox = root.absoluteBoundingBox
  const m = measure(root)

  console.log(`\n=== ${root.type} "${root.name}" (${root.id}) ===`)
  console.log(`  size            ${bbox ? `${Math.round(bbox.width)}x${Math.round(bbox.height)}` : '(none)'}`)
  console.log(`  nodes total     ${m.total}`)
  console.log(`  renderable leaf ${m.renderableLeaves}`)
  console.log(`  hidden          ${m.hidden}`)
  console.log(`  zero-opacity    ${m.zeroOpacity}`)
  console.log(`  background blur ${m.backgroundBlur.length}`)
  console.log(`  luminance mask  ${m.luminanceMask.length}`)
  console.log(`  masks           ${m.masks}`)
  console.log(`  text nodes      ${m.textNodes}`)
  console.log(`  instances       ${m.instances}  (max nesting ${m.maxInstanceDepth})`)
  console.log(`  max depth       ${m.maxDepth}`)
  const types = [...m.byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  console.log(`  types           ${types.map(([t, c]) => `${t}:${c}`).join('  ')}`)
  console.log('')
  for (const line of verdict(m)) console.log(`  ${line}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
