/**
 * Resize / Derive Formats — adapts a master frame to different aspect ratios.
 *
 * Pipeline:
 *  1. Capture source snapshot BEFORE any mutation
 *  2. Clone per target ratio
 *  3. Resize root frame to target canonical size
 *  4. Explicit background pass — force full-bleed coverage
 *  5. Coherent proportional baseline on all content layers
 *  6. Text reflow pass — scale fonts, enforce width, set auto-resize
 *  7. Backend planner for art-directed refinements (optional)
 *  8. Composition QA on full subtree (both axes)
 *  9. Auto-fix QA failures
 * 10. Image framing review
 * 11. Re-run QA after image review
 * 12. Sibling-aware placement (collision-free)
 */

import { getApiBase, getPluginToken } from '../constants'

// ---------------------------------------------------------------------------
// Canonical sizes
// ---------------------------------------------------------------------------

const CANONICAL_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5': { w: 1440, h: 1800 },
  '1x1': { w: 1440, h: 1440 },
}

const PLACEMENT_GAP = 80

function detectRatio(w: number, h: number): string | null {
  for (const [key, dim] of Object.entries(CANONICAL_SIZES)) {
    if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runDeriveVariants(): void {
  const selection = figma.currentPage.selection
  if (selection.length === 0) {
    figma.closePlugin('Select a master frame to resize into other formats.')
    return
  }

  const frame = selection[0]
  if (frame.type !== 'FRAME') {
    figma.closePlugin('Please select a frame.')
    return
  }

  const sourceFrame = frame as FrameNode
  if (hasNestedDerivedFrames(sourceFrame)) {
    figma.closePlugin(
      'This frame already contains derived format frames inside it. '
      + 'Select the original master frame instead.',
    )
    return
  }

  const sourceRatio = detectRatio(frame.width, frame.height)
  const fileKey = (figma as unknown as { fileKey?: string }).fileKey || ''

  const html = buildUI(frame, sourceRatio)
  figma.showUI(html, { width: 440, height: 520 })

  figma.ui.onmessage = async (msg: { type: string; [k: string]: unknown }) => {
    if (msg.type === 'ready') {
      const layerSummary = extractLayerSummary(sourceFrame)
      figma.ui.postMessage({ type: 'frame-data', data: layerSummary })
    }

    if (msg.type === 'start-derive') {
      const targetRatios = msg.targetRatios as string[]
      await handleDerive(sourceFrame, targetRatios, fileKey)
    }

    if (msg.type === 'apply-crop-adjustments') {
      const adjustments = (msg.adjustments || []) as CropAdjustmentMsg[]
      let adjusted = 0
      for (const adj of adjustments) {
        const node = await figma.getNodeByIdAsync(adj.rectId)
        if (!node || node.type !== 'RECTANGLE') continue
        applyCropToRect(
          node as RectangleNode, adj.imageHash,
          adj.rectWidth, adj.rectHeight, adj.imageWidth, adj.imageHeight,
          { zoom: 1 + adj.zoomDelta, panX: adj.panX, panY: adj.panY },
        )
        adjusted++
      }
      figma.ui.postMessage({
        type: 'status',
        text: adjusted > 0 ? `Adjusted framing on ${adjusted} image(s).` : 'No framing adjustments needed.',
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Core derive handler
// ---------------------------------------------------------------------------

async function handleDerive(
  sourceFrame: FrameNode,
  targetRatios: string[],
  fileKey: string,
): Promise<void> {
  const apiBase = getApiBase()
  const token = getPluginToken()

  const sourceLayerData = extractLayerSummary(sourceFrame)
  const srcW = Math.round(sourceFrame.width)
  const srcH = Math.round(sourceFrame.height)
  const sourceRatio = detectRatio(srcW, srcH)

  // Track placed clones so placement cursor advances correctly
  let placementCursorX = sourceFrame.x + sourceFrame.width + PLACEMENT_GAP

  for (let i = 0; i < targetRatios.length; i++) {
    const ratio = targetRatios[i]
    const target = CANONICAL_SIZES[ratio]
    if (!target) continue

    figma.ui.postMessage({ type: 'progress', text: `Resizing to ${ratio} (${i + 1}/${targetRatios.length})...`, step: 'cloning' })

    // --- 1. Clone ---
    const clone = sourceFrame.clone()
    clone.name = sourceFrame.name.replace(/\d+x\d+/, ratio) + (sourceFrame.name.includes(ratio) ? '' : `-${ratio}`)

    // --- 2. Resize root frame ---
    clone.resize(target.w, target.h)

    // --- 3. Background pass — force full coverage ---
    forceBackgroundCoverage(clone, target.w, target.h)

    // --- 4. Proportional baseline for content layers ---
    applyContentBaseline(clone, srcW, srcH, target.w, target.h)

    // --- 5. Text reflow pass ---
    await reflowAllText(clone, srcW, srcH, target.w, target.h)

    // --- 6. Remove contamination ---
    removeNestedDerivedFrames(clone)

    figma.ui.postMessage({ type: 'progress', text: `Planning layout for ${ratio}...`, step: 'planning' })

    // --- 7. Backend planner (optional art-direction) ---
    let editPlan: EditPlan | null = null
    try {
      const resp = await fetch(`${apiBase}/api/plugin/iterator/derive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Heimdall-Plugin-Token': token },
        body: JSON.stringify({
          sourceFileKey: fileKey, sourceFrameId: sourceFrame.id, targetRatios: [ratio],
          sourceLayerData, sourceWidth: srcW, sourceHeight: srcH, sourceRatio: sourceRatio || undefined,
        }),
      })
      if (resp.ok) {
        const result = await resp.json()
        editPlan = result.editPlan || null
      }
    } catch { /* fallback to baseline only */ }

    if (editPlan && editPlan.steps && editPlan.steps.length > 0) {
      figma.ui.postMessage({ type: 'progress', text: `Applying layout for ${ratio}...`, step: 'applying' })
      await applyEditPlan(clone, editPlan.steps, target.w, target.h)
    }

    // --- 8. First QA pass ---
    figma.ui.postMessage({ type: 'progress', text: `Running QA on ${ratio}...`, step: 'qa' })
    let qaResult = runFullSubtreeQA(clone, target.w, target.h)
    if (qaResult.issues.length > 0) {
      applyQAFixes(clone, qaResult, target.w, target.h)
    }

    // --- 9. Image framing review ---
    const imageRects = findAllImageRects(clone)
    if (imageRects.length > 0) {
      figma.ui.postMessage({ type: 'progress', text: `Reviewing ${imageRects.length} image(s) in ${ratio}...`, step: 'image-review' })
      await reviewAndFixImageFraming(imageRects, apiBase, token)
    }

    // --- 10. Re-run QA after image review ---
    qaResult = runFullSubtreeQA(clone, target.w, target.h)
    if (qaResult.issues.length > 0) {
      applyQAFixes(clone, qaResult, target.w, target.h)
    }

    // --- 11. Collision-free placement ---
    placementCursorX = placeCloneWithoutOverlap(clone, sourceFrame, placementCursorX)

    figma.currentPage.selection = [clone]
    figma.viewport.scrollAndZoomIntoView([clone])

    figma.ui.postMessage({
      type: 'ratio-complete', ratio,
      qaResult: {
        total: qaResult.issues.length,
        clippedTexts: qaResult.issues.filter((i) => i.type === 'text-clip').length,
        overlaps: qaResult.issues.filter((i) => i.type === 'overlap').length,
        edgeViolations: qaResult.issues.filter((i) => i.type === 'edge').length,
        storyOcclusionWarnings: qaResult.issues.filter((i) => i.type === 'occlusion').length,
      },
    })
  }

  figma.ui.postMessage({ type: 'derive-complete', count: targetRatios.length })
}

// ---------------------------------------------------------------------------
// Sibling-aware placement
// ---------------------------------------------------------------------------

interface Rect { x: number; y: number; w: number; h: number }

function placeCloneWithoutOverlap(
  clone: FrameNode,
  source: FrameNode,
  cursorX: number,
): number {
  const page = figma.currentPage
  const cloneW = Math.round(clone.width)
  const cloneH = Math.round(clone.height)
  const sourceY = source.y

  // Gather occupied rects from all page siblings (excluding the clone itself)
  const obstacles: Rect[] = []
  for (const child of page.children) {
    if (child.id === clone.id) continue
    if (child.type !== 'FRAME' && child.type !== 'COMPONENT' && child.type !== 'SECTION') continue
    obstacles.push({ x: child.x, y: child.y, w: Math.round(child.width), h: Math.round(child.height) })
  }

  // Try placing at cursorX, same Y as source. Sweep right on collision.
  let candidateX = cursorX
  const candidateY = sourceY
  let attempts = 0
  const maxAttempts = 50

  while (attempts < maxAttempts) {
    const candidate: Rect = { x: candidateX, y: candidateY, w: cloneW, h: cloneH }
    const hit = obstacles.find((o) => rectsIntersect(candidate, o))
    if (!hit) break
    candidateX = hit.x + hit.w + PLACEMENT_GAP
    attempts++
  }

  clone.x = candidateX
  clone.y = candidateY

  return candidateX + cloneW + PLACEMENT_GAP
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h)
}

// ---------------------------------------------------------------------------
// Background coverage pass
// ---------------------------------------------------------------------------

function forceBackgroundCoverage(frame: FrameNode, frameW: number, frameH: number): void {
  // Find the background layer: the bottom-most child that is a RECTANGLE or
  // FRAME covering most of the original frame
  for (const child of frame.children) {
    const isBgCandidate = (
      (child.type === 'RECTANGLE' || child.type === 'FRAME') &&
      child.width >= frameW * 0.5 && child.height >= frameH * 0.3
    )
    if (!isBgCandidate) continue

    // Force it to cover the full target frame
    child.x = 0
    child.y = 0
    if ('resize' in child) {
      (child as FrameNode).resize(frameW, frameH)
    }

    // If it has an image fill, reset the crop to "cover" (identity transform)
    if (child.type === 'RECTANGLE') {
      const fills = (child.fills as readonly Paint[]) || []
      const imgFill = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined
      if (imgFill?.imageHash) {
        (child as RectangleNode).fills = [{
          type: 'IMAGE',
          imageHash: imgFill.imageHash,
          scaleMode: 'FILL',
        }]
      }
    }

    break // only process the first (bottom-most) background candidate
  }
}

// ---------------------------------------------------------------------------
// Content baseline — coherent proportional scaling
// ---------------------------------------------------------------------------

function applyContentBaseline(
  frame: FrameNode,
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
): void {
  const scaleX = tgtW / srcW
  const scaleY = tgtH / srcH

  for (const child of frame.children) {
    // Skip the background layer (already handled)
    if (isBackgroundLayer(child, tgtW, tgtH)) continue
    scaleContentNode(child, scaleX, scaleY, tgtW, tgtH)
  }
}

function isBackgroundLayer(node: SceneNode, frameW: number, frameH: number): boolean {
  return (
    (node.type === 'RECTANGLE' || node.type === 'FRAME') &&
    node.width >= frameW * 0.9 && node.height >= frameH * 0.9
  )
}

function scaleContentNode(
  node: SceneNode,
  scaleX: number,
  scaleY: number,
  parentW: number,
  parentH: number,
): void {
  // Scale position using both axes to maintain relative placement
  node.x = Math.round(node.x * scaleX)
  node.y = Math.round(node.y * scaleY)

  // Skip text nodes (handled in reflow pass)
  if (node.type === 'TEXT') return

  // For resizable non-text elements, scale with both axes to match position scaling
  if ('resize' in node) {
    const newW = Math.max(1, Math.round(node.width * scaleX))
    const newH = Math.max(1, Math.round(node.height * scaleY))
    ;(node as FrameNode).resize(newW, newH)
  }

  // Clamp to parent bounds
  if (node.x + node.width > parentW) {
    node.x = Math.max(0, parentW - node.width)
  }
  if (node.y + node.height > parentH) {
    node.y = Math.max(0, parentH - node.height)
  }

  // Recurse into non-instance children
  if ('children' in node && node.type !== 'INSTANCE') {
    const childFrame = node as FrameNode
    const innerScaleX = childFrame.width > 0 ? (childFrame.width / (childFrame.width / scaleX)) : 1
    const innerScaleY = childFrame.height > 0 ? (childFrame.height / (childFrame.height / scaleY)) : 1
    for (const child of childFrame.children) {
      scaleContentNode(child, innerScaleX, innerScaleY, childFrame.width, childFrame.height)
    }
  }
}

// ---------------------------------------------------------------------------
// Text reflow pass
// ---------------------------------------------------------------------------

async function reflowAllText(
  frame: FrameNode,
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
): Promise<void> {
  const fontScale = Math.min(tgtW / srcW, tgtH / srcH)
  const allText = findAllTextNodes(frame)

  for (const textNode of allText) {
    try {
      const fontName = textNode.fontName
      if (fontName !== figma.mixed) {
        await figma.loadFontAsync(fontName as FontName)
      }

      // Scale font size for severe compressions
      if (fontScale < 0.85 && textNode.fontSize !== figma.mixed) {
        const currentSize = textNode.fontSize as number
        const newSize = Math.max(12, Math.round(currentSize * fontScale))
        if (newSize < currentSize) {
          textNode.fontSize = newSize
        }
      }

      // Set auto-resize so text reflows within its container
      textNode.textAutoResize = 'HEIGHT'

      // Clamp width to frame with margin
      const maxWidth = tgtW * 0.88
      if (textNode.width > maxWidth) {
        textNode.resize(Math.round(maxWidth), textNode.height)
      }
    } catch {
      // Font not loadable, skip
    }
  }
}

function findAllTextNodes(node: SceneNode): TextNode[] {
  const result: TextNode[] = []
  if (node.type === 'TEXT') result.push(node as TextNode)
  if ('children' in node) {
    for (const child of (node as FrameNode).children) {
      result.push(...findAllTextNodes(child))
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Full-subtree composition QA
// ---------------------------------------------------------------------------

interface QAIssue {
  type: 'text-clip' | 'text-hclip' | 'overlap' | 'edge' | 'occlusion' | 'bg-gap'
  id: string
  name: string
  detail: string
}

interface QAResult { issues: QAIssue[] }

const SAFE_ZONES: Record<string, { top: number; bottom: number; side: number }> = {
  '9x16': { top: 240, bottom: 492, side: 80 },
  '4x5': { top: 180, bottom: 180, side: 80 },
  '1x1': { top: 144, bottom: 144, side: 80 },
}

function runFullSubtreeQA(frame: FrameNode, frameW: number, frameH: number): QAResult {
  const issues: QAIssue[] = []
  const ratio = detectRatio(frameW, frameH)
  const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 }

  // Walk all descendants for text clipping (both vertical and horizontal)
  const allText = findAllTextNodes(frame)
  for (const t of allText) {
    // Use the node's absolute position relative to the frame
    const absY = getAbsoluteY(t, frame)
    const absX = getAbsoluteX(t, frame)
    if (absY + t.height > frameH + 2) {
      issues.push({ type: 'text-clip', id: t.id, name: t.name, detail: `vertical overflow by ${Math.round(absY + t.height - frameH)}px` })
    }
    if (absX + t.width > frameW + 2) {
      issues.push({ type: 'text-hclip', id: t.id, name: t.name, detail: `horizontal overflow by ${Math.round(absX + t.width - frameW)}px` })
    }
  }

  // Check top-level content children for overlap and edge proximity
  const contentChildren: SceneNode[] = []
  for (const child of frame.children) {
    if (!isBackgroundLayer(child, frameW, frameH)) {
      contentChildren.push(child)
    }
  }

  for (let i = 0; i < contentChildren.length; i++) {
    for (let j = i + 1; j < contentChildren.length; j++) {
      const a = contentChildren[i], b = contentChildren[j]
      if (!(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)) {
        issues.push({ type: 'overlap', id: a.id, name: `${a.name} x ${b.name}`, detail: 'content overlap' })
      }
    }
  }

  for (const child of contentChildren) {
    if (child.x < safeZone.side) issues.push({ type: 'edge', id: child.id, name: child.name, detail: 'left' })
    if (child.y < safeZone.top) issues.push({ type: 'edge', id: child.id, name: child.name, detail: 'top' })
    if (child.x + child.width > frameW - safeZone.side) issues.push({ type: 'edge', id: child.id, name: child.name, detail: 'right' })
    if (child.y + child.height > frameH - safeZone.bottom) issues.push({ type: 'edge', id: child.id, name: child.name, detail: 'bottom' })
  }

  // Background gap detection
  let hasBg = false
  for (const child of frame.children) {
    if (isBackgroundLayer(child, frameW, frameH)) { hasBg = true; break }
  }
  if (!hasBg) {
    issues.push({ type: 'bg-gap', id: frame.id, name: frame.name, detail: 'no full-bleed background detected' })
  }

  // Story occlusion
  for (const child of contentChildren) {
    if (child.type === 'FRAME') {
      const coverageRatio = (child.width * child.height) / (frameW * frameH)
      if (coverageRatio > 0.15 && child.y / frameH < 0.4) {
        issues.push({ type: 'occlusion', id: child.id, name: child.name, detail: `${Math.round(coverageRatio * 100)}% coverage in upper zone` })
      }
    }
  }

  return { issues }
}

function getAbsoluteY(node: SceneNode, ancestor: FrameNode): number {
  let y = node.y
  let current: BaseNode | null = node.parent
  while (current && current.id !== ancestor.id) {
    if ('y' in current) y += (current as SceneNode).y
    current = current.parent
  }
  return y
}

function getAbsoluteX(node: SceneNode, ancestor: FrameNode): number {
  let x = node.x
  let current: BaseNode | null = node.parent
  while (current && current.id !== ancestor.id) {
    if ('x' in current) x += (current as SceneNode).x
    current = current.parent
  }
  return x
}

// ---------------------------------------------------------------------------
// QA auto-fixes
// ---------------------------------------------------------------------------

function applyQAFixes(frame: FrameNode, qa: QAResult, frameW: number, frameH: number): void {
  const ratio = detectRatio(frameW, frameH)
  const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 }

  for (const issue of qa.issues) {
    if (issue.type === 'text-clip' || issue.type === 'text-hclip') {
      const node = frame.findOne((n) => n.id === issue.id)
      if (node && node.type === 'TEXT') {
        node.textAutoResize = 'HEIGHT'
        if (node.width > frameW * 0.9) {
          node.resize(Math.round(frameW * 0.85), node.height)
        }
        // Nudge up if still overflowing bottom
        const absY = getAbsoluteY(node, frame)
        if (absY + node.height > frameH - safeZone.bottom) {
          node.y = Math.max(0, node.y - (absY + node.height - (frameH - safeZone.bottom)))
        }
      }
    }

    if (issue.type === 'edge') {
      const node = frame.findOne((n) => n.id === issue.id)
      if (!node) continue
      if (issue.detail === 'left' && node.x < safeZone.side) node.x = safeZone.side
      if (issue.detail === 'right' && node.x + node.width > frameW - safeZone.side) {
        node.x = Math.max(safeZone.side, frameW - safeZone.side - node.width)
      }
      if (issue.detail === 'top' && node.y < safeZone.top) node.y = safeZone.top
      if (issue.detail === 'bottom' && node.y + node.height > frameH - safeZone.bottom) {
        node.y = Math.max(safeZone.top, frameH - safeZone.bottom - node.height)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Contamination guards
// ---------------------------------------------------------------------------

function hasNestedDerivedFrames(frame: FrameNode): boolean {
  const parentRatio = detectRatio(frame.width, frame.height)
  for (const child of frame.children) {
    if (child.type === 'FRAME') {
      const childRatio = detectRatio(child.width, child.height)
      if (childRatio && childRatio !== parentRatio) return true
    }
  }
  return false
}

function removeNestedDerivedFrames(frame: FrameNode): void {
  const parentRatio = detectRatio(frame.width, frame.height)
  const toRemove: SceneNode[] = []
  for (const child of frame.children) {
    if (child.type === 'FRAME') {
      const childRatio = detectRatio(child.width, child.height)
      if (childRatio && childRatio !== parentRatio) toRemove.push(child)
    }
  }
  for (const node of toRemove) node.remove()
}

// ---------------------------------------------------------------------------
// Edit plan application (ID-based resolution first)
// ---------------------------------------------------------------------------

interface EditStep {
  action: string
  targetNodeName?: string
  targetNodeId?: string
  params: Record<string, unknown>
  rationale: string
}

interface EditPlan { steps: EditStep[]; [k: string]: unknown }

async function applyEditPlan(
  frame: FrameNode,
  steps: EditStep[],
  tgtW: number,
  tgtH: number,
): Promise<void> {
  for (const step of steps) {
    let node: SceneNode | null = null
    if (step.targetNodeId) {
      const byId = await figma.getNodeByIdAsync(step.targetNodeId)
      if (byId && isDescendantOf(byId, frame)) node = byId as SceneNode
    }
    if (!node && step.targetNodeName) node = findNodeByName(frame, step.targetNodeName)
    if (!node) continue

    switch (step.action) {
      case 'move': {
        const dx = Number(step.params.dx || 0), dy = Number(step.params.dy || 0)
        const x = step.params.x as number | undefined, y = step.params.y as number | undefined
        if (x !== undefined) node.x = x; else node.x = node.x + dx
        if (y !== undefined) node.y = y; else node.y = node.y + dy
        break
      }
      case 'scale': {
        const factor = Number(step.params.factor || 1)
        const fx = Number(step.params.factorX || factor), fy = Number(step.params.factorY || factor)
        if ('resize' in node) (node as FrameNode).resize(Math.round(node.width * fx), Math.round(node.height * fy))
        break
      }
      case 'reflow': {
        if (node.type === 'TEXT') {
          try {
            await figma.loadFontAsync(node.fontName as FontName)
            node.textAutoResize = 'HEIGHT'
            const maxWidth = Number(step.params.maxWidth || tgtW * 0.85)
            if (node.width > maxWidth) node.resize(maxWidth, node.height)
            const fontSize = step.params.fontSize as number | undefined
            if (fontSize) node.fontSize = fontSize
          } catch { /* font not loadable */ }
        }
        break
      }
      case 'crop-shift': {
        if (node.type === 'RECTANGLE') {
          const fills = (node.fills as readonly Paint[]) || []
          const imgFill = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined
          if (imgFill?.imageHash) {
            const img = figma.getImageByHash(imgFill.imageHash)
            if (img) {
              const imgSize = await img.getSizeAsync()
              applyCropToRect(node as RectangleNode, imgFill.imageHash,
                Math.round(node.width), Math.round(node.height), imgSize.width, imgSize.height,
                { zoom: Number(step.params.zoom || 0.85), panX: Number(step.params.panX || 0), panY: Number(step.params.panY || 0) })
            }
          }
        }
        break
      }
      default: break
    }
  }
}

function isDescendantOf(node: BaseNode, ancestor: FrameNode): boolean {
  let current: BaseNode | null = node
  while (current) {
    if (current.id === ancestor.id) return true
    current = current.parent
  }
  return false
}

// ---------------------------------------------------------------------------
// Image framing review
// ---------------------------------------------------------------------------

function findAllImageRects(node: SceneNode): RectangleNode[] {
  const rects: RectangleNode[] = []
  if (node.type === 'RECTANGLE') {
    const fills = (node.fills as readonly Paint[]) || []
    if (fills.length > 0 && fills[0].type === 'IMAGE') rects.push(node as RectangleNode)
  }
  if ('children' in node) {
    for (const c of (node as FrameNode).children) rects.push(...findAllImageRects(c))
  }
  return rects
}

async function reviewAndFixImageFraming(
  imageRects: RectangleNode[],
  apiBase: string,
  token: string,
): Promise<void> {
  for (const rect of imageRects) {
    try {
      const fills = rect.fills as readonly Paint[]
      const imageFill = fills.find((f) => f.type === 'IMAGE') as ImagePaint | undefined
      if (!imageFill?.imageHash) continue
      const img = figma.getImageByHash(imageFill.imageHash)
      if (!img) continue
      const imgSize = await img.getSizeAsync()
      const pngBytes = await rect.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 0.5 } })
      const base64 = bytesToBase64(Array.from(pngBytes))

      const resp = await fetch(`${apiBase}/api/plugin/iterator/review-placement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Heimdall-Plugin-Token': token },
        body: JSON.stringify({
          previewImageBase64: base64, mimeType: 'image/png',
          rectWidth: Math.round(rect.width), rectHeight: Math.round(rect.height),
          imageWidth: imgSize.width, imageHeight: imgSize.height,
          context: 'This image was resized as part of a format derivation. Check if the crop still shows the subject well.',
        }),
      })
      if (resp.ok) {
        const result = await resp.json()
        if (result.action === 'adjust' && (result.confidence === 'high' || result.confidence === 'medium')) {
          applyCropToRect(rect, imageFill.imageHash,
            Math.round(rect.width), Math.round(rect.height), imgSize.width, imgSize.height,
            { zoom: 1 + result.zoomDelta, panX: result.panX, panY: result.panY })
        }
      }
    } catch { /* keep current framing */ }
  }
}

// ---------------------------------------------------------------------------
// Crop helpers
// ---------------------------------------------------------------------------

interface CropParams { zoom: number; panX: number; panY: number }
interface CropAdjustmentMsg { rectId: string; imageHash: string; rectWidth: number; rectHeight: number; imageWidth: number; imageHeight: number; zoomDelta: number; panX: number; panY: number }

function buildImageTransform(rectW: number, rectH: number, imgW: number, imgH: number, params: CropParams): Transform {
  const rectAR = rectW / rectH, imgAR = imgW / imgH
  let bsx: number, bsy: number
  if (imgAR > rectAR) { bsy = 1; bsx = rectAR / imgAR } else { bsx = 1; bsy = imgAR / rectAR }
  const zoom = Math.max(0.3, Math.min(1, params.zoom))
  const t = 1 - zoom
  const sx = bsx + (1 - bsx) * t, sy = bsy + (1 - bsy) * t
  const tx = Math.max(0, Math.min(1 - sx, (1 - sx) * 0.5 + params.panX * sx))
  const ty = Math.max(0, Math.min(1 - sy, (1 - sy) * 0.5 + params.panY * sy))
  return [[sx, 0, tx], [0, sy, ty]]
}

function applyCropToRect(rect: RectangleNode, imageHash: string, rectW: number, rectH: number, imgW: number, imgH: number, params: CropParams): void {
  rect.fills = [{ type: 'IMAGE', imageHash, scaleMode: 'CROP', imageTransform: buildImageTransform(rectW, rectH, imgW, imgH, params) }]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNodeByName(root: FrameNode, name: string): SceneNode | null {
  let found: SceneNode | null = null
  function walk(node: SceneNode) {
    if (found) return
    if (node.name === name) { found = node; return }
    if ('children' in node) { for (const child of (node as FrameNode).children) walk(child) }
  }
  walk(root)
  return found
}

function extractLayerSummary(frame: FrameNode) {
  function mapNode(c: SceneNode): Record<string, unknown> {
    const n: Record<string, unknown> = {
      id: c.id, name: c.name, type: c.type,
      x: Math.round(c.x), y: Math.round(c.y),
      width: Math.round(c.width), height: Math.round(c.height),
      visible: c.visible !== false,
    }
    if (c.type === 'TEXT') { n.characters = (c as TextNode).characters; n.fontSize = (c as TextNode).fontSize }
    if ('children' in c && (c as FrameNode).children.length > 0) n.children = (c as FrameNode).children.map(mapNode)
    if (c.type === 'RECTANGLE') {
      const fills = (c.fills as readonly Paint[]) || []
      if (fills.length > 0 && fills[0].type === 'IMAGE') n.hasImage = true
    }
    return n
  }
  return { id: frame.id, name: frame.name, width: Math.round(frame.width), height: Math.round(frame.height), childCount: frame.children.length, children: frame.children.map(mapNode) }
}

function bytesToBase64(byteArray: number[]): string {
  let raw = ''
  for (let ci = 0; ci < byteArray.length; ci += 8192) {
    raw += String.fromCharCode.apply(null, byteArray.slice(ci, ci + 8192))
  }
  return btoa(raw)
}

// ---------------------------------------------------------------------------
// UI builder
// ---------------------------------------------------------------------------

function buildUI(frame: FrameNode, sourceRatio: string | null): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; background: #1e1e1e; color: #e0e0e0; font-size: 13px; }
    h2 { font-size: 15px; margin: 0 0 12px; color: #fff; }
    .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
    .targets { margin: 12px 0; }
    label { display: block; padding: 6px 0; cursor: pointer; }
    label.disabled { opacity: 0.35; cursor: default; }
    input[type="checkbox"] { margin-right: 8px; }
    button { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 13px; width: 100%; }
    button:hover { background: #4338ca; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .progress { margin-top: 8px; font-size: 11px; color: #aaa; }
    .status { padding: 8px 12px; background: #2a2a2a; border-radius: 6px; margin-top: 12px; white-space: pre-wrap; font-size: 11px; line-height: 1.5; }
    .qa-line { font-size: 11px; color: #888; padding: 2px 0; }
  </style>
</head>
<body>
  <h2>Iterator — Resize / Derive Formats</h2>
  <div class="meta">Master: ${frame.name} (${Math.round(frame.width)}×${Math.round(frame.height)}, detected ${sourceRatio || 'unknown'})</div>
  <div class="targets">
    <label ${sourceRatio === '9x16' ? 'class="disabled"' : ''}><input type="checkbox" value="9x16" ${sourceRatio === '9x16' ? 'disabled' : 'checked'}> 9:16 (1440×2560)${sourceRatio === '9x16' ? ' — source' : ''}</label>
    <label ${sourceRatio === '4x5' ? 'class="disabled"' : ''}><input type="checkbox" value="4x5" ${sourceRatio === '4x5' ? 'disabled' : 'checked'}> 4:5 (1440×1800)${sourceRatio === '4x5' ? ' — source' : ''}</label>
    <label ${sourceRatio === '1x1' ? 'class="disabled"' : ''}><input type="checkbox" value="1x1" ${sourceRatio === '1x1' ? 'disabled' : 'checked'}> 1:1 (1440×1440)${sourceRatio === '1x1' ? ' — source' : ''}</label>
  </div>
  <button id="btn-derive">Resize to Selected Formats</button>
  <div id="progress" class="progress" style="display:none;"></div>
  <div id="qa-results"></div>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    window.onmessage = function(event) {
      var msg = event.data.pluginMessage;
      if (!msg) return;
      if (msg.type === 'progress') {
        var el = document.getElementById('progress');
        el.style.display = 'block';
        el.textContent = msg.text;
      }
      if (msg.type === 'ratio-complete') {
        var qaDiv = document.getElementById('qa-results');
        var qa = msg.qaResult;
        var lines = ['— ' + msg.ratio + ': ' + qa.total + ' issue(s)'];
        if (qa.clippedTexts) lines.push('  Text clip: ' + qa.clippedTexts);
        if (qa.overlaps) lines.push('  Overlap: ' + qa.overlaps);
        if (qa.edgeViolations) lines.push('  Edge: ' + qa.edgeViolations);
        if (qa.storyOcclusionWarnings) lines.push('  Occlusion: ' + qa.storyOcclusionWarnings);
        var div = document.createElement('div');
        div.className = 'qa-line';
        div.textContent = lines.join('\\n');
        div.style.whiteSpace = 'pre';
        qaDiv.appendChild(div);
      }
      if (msg.type === 'derive-complete') {
        document.getElementById('progress').style.display = 'none';
        var s = document.getElementById('status');
        s.style.display = 'block';
        s.textContent = 'Done! Created ' + msg.count + ' resized format(s).';
        document.getElementById('btn-derive').disabled = false;
        document.getElementById('btn-derive').textContent = 'Resize to Selected Formats';
      }
      if (msg.type === 'status') {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = msg.text;
      }
    };
    document.getElementById('btn-derive').addEventListener('click', function() {
      var cbs = document.querySelectorAll('.targets input[type="checkbox"]:checked:not(:disabled)');
      var selected = [];
      cbs.forEach(function(cb) { selected.push(cb.value); });
      if (selected.length === 0) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Select at least one target format.';
        return;
      }
      document.getElementById('btn-derive').disabled = true;
      document.getElementById('btn-derive').textContent = 'Resizing...';
      document.getElementById('qa-results').innerHTML = '';
      parent.postMessage({ pluginMessage: { type: 'start-derive', targetRatios: selected } }, '*');
    });
    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
  </script>
</body>
</html>
  `.trim()
}
