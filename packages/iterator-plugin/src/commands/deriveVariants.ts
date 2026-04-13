/**
 * Resize / Derive Formats — adapts a master frame to different aspect ratios.
 *
 * Takes the selected frame as the master and creates art-directed
 * resized variants at the user's chosen target ratios (9:16, 4:5, 1:1).
 *
 * Flow:
 *  1. Plugin detects source ratio, shows checkbox UI for target formats
 *  2. User picks targets, clicks "Resize"
 *  3. Plugin captures the source layer snapshot BEFORE any mutation
 *  4. Clones the frame per target, applies recursive proportional baseline
 *  5. Sends source snapshot + target ratio to backend for art-directed plan
 *  6. Plugin applies plan steps, then runs image-framing review on photos
 *  7. Runs composition QA and reports results
 */

import { getApiBase, getPluginToken } from '../constants'

// ---------------------------------------------------------------------------
// Canonical sizes — single source of truth for the plugin
// ---------------------------------------------------------------------------

const CANONICAL_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5': { w: 1440, h: 1800 },
  '1x1': { w: 1440, h: 1440 },
}

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

  // Guard: reject frames that already contain derived EXP- children
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

  const html = buildUI(frame, sourceRatio, fileKey)
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
          node as RectangleNode,
          adj.imageHash,
          adj.rectWidth,
          adj.rectHeight,
          adj.imageWidth,
          adj.imageHeight,
          { zoom: 1 + adj.zoomDelta, panX: adj.panX, panY: adj.panY },
        )
        adjusted++
      }
      figma.ui.postMessage({
        type: 'status',
        text: adjusted > 0
          ? `Adjusted framing on ${adjusted} image(s).`
          : 'No framing adjustments needed.',
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

  // Capture true source geometry BEFORE any mutation
  const sourceLayerData = extractLayerSummary(sourceFrame)
  const srcW = Math.round(sourceFrame.width)
  const srcH = Math.round(sourceFrame.height)
  const sourceRatio = detectRatio(srcW, srcH)

  for (let i = 0; i < targetRatios.length; i++) {
    const ratio = targetRatios[i]
    const target = CANONICAL_SIZES[ratio]
    if (!target) continue

    figma.ui.postMessage({
      type: 'progress',
      text: `Resizing to ${ratio} (${i + 1}/${targetRatios.length})...`,
      step: 'cloning',
    })

    // 1. Clone the frame (as a page-level sibling, not nested)
    const clone = sourceFrame.clone()
    clone.name = sourceFrame.name.replace(/\d+x\d+/, ratio) + (sourceFrame.name.includes(ratio) ? '' : `-${ratio}`)
    clone.x = sourceFrame.x + (sourceFrame.width + 80) * (i + 1)

    // 2. Resize the root frame to target dimensions
    clone.resize(target.w, target.h)

    // 3. Apply recursive proportional baseline to ALL descendants
    applyRecursiveProportionalBaseline(clone, srcW, srcH, target.w, target.h)

    figma.ui.postMessage({
      type: 'progress',
      text: `Planning layout for ${ratio}...`,
      step: 'planning',
    })

    // 4. Ask backend for an art-directed edit plan
    //    Send the TRUE source snapshot (pre-resize) so the planner can reason
    //    about the real master→target conversion.
    let editPlan: EditPlan | null = null
    try {
      const resp = await fetch(`${apiBase}/api/plugin/iterator/derive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heimdall-Plugin-Token': token,
        },
        body: JSON.stringify({
          sourceFileKey: fileKey,
          sourceFrameId: sourceFrame.id,
          targetRatios: [ratio],
          sourceLayerData,
          sourceWidth: srcW,
          sourceHeight: srcH,
          sourceRatio: sourceRatio || undefined,
        }),
      })

      if (resp.ok) {
        const result = await resp.json()
        editPlan = result.editPlan || null
      }
    } catch {
      // Backend unreachable — proportional baseline already applied
    }

    figma.ui.postMessage({
      type: 'progress',
      text: `Applying layout for ${ratio}...`,
      step: 'applying',
    })

    // 5. Apply any art-directed plan steps ON TOP of the proportional baseline
    if (editPlan && editPlan.steps && editPlan.steps.length > 0) {
      await applyEditPlan(clone, editPlan.steps, srcW, srcH, target.w, target.h)
    }

    // 6. Run composition QA checks
    figma.ui.postMessage({
      type: 'progress',
      text: `Running QA on ${ratio}...`,
      step: 'qa',
    })

    const qaResult = runCompositionQA(clone, target.w, target.h)

    // 7. Auto-fix simple QA failures
    if (qaResult.clippedTexts.length > 0 || qaResult.edgeViolations.length > 0) {
      applyQAFixes(clone, qaResult, target.w, target.h)
    }

    // 8. Guard: verify no nested derived frames leaked into the output
    removeNestedDerivedFrames(clone)

    // 9. Review image framing
    const imageRects = findAllImageRects(clone)
    if (imageRects.length > 0) {
      figma.ui.postMessage({
        type: 'progress',
        text: `Reviewing ${imageRects.length} image(s) in ${ratio}...`,
        step: 'image-review',
      })

      await reviewAndFixImageFraming(clone, imageRects, apiBase, token)
    }

    figma.currentPage.selection = [clone]
    figma.viewport.scrollAndZoomIntoView([clone])

    figma.ui.postMessage({
      type: 'ratio-complete',
      ratio,
      qaResult: {
        clippedTexts: qaResult.clippedTexts.length,
        overlaps: qaResult.overlaps.length,
        edgeViolations: qaResult.edgeViolations.length,
        storyOcclusionWarnings: qaResult.storyOcclusionWarnings.length,
      },
    })
  }

  figma.ui.postMessage({
    type: 'derive-complete',
    count: targetRatios.length,
  })
}

// ---------------------------------------------------------------------------
// Contamination guards
// ---------------------------------------------------------------------------

function hasNestedDerivedFrames(frame: FrameNode): boolean {
  for (const child of frame.children) {
    if (child.type === 'FRAME' && detectRatio(child.width, child.height) !== null) {
      const childRatio = detectRatio(child.width, child.height)
      const parentRatio = detectRatio(frame.width, frame.height)
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
      if (childRatio && childRatio !== parentRatio) {
        toRemove.push(child)
      }
    }
  }
  for (const node of toRemove) {
    node.remove()
  }
}

// ---------------------------------------------------------------------------
// Recursive proportional baseline
// ---------------------------------------------------------------------------

function applyRecursiveProportionalBaseline(
  frame: FrameNode,
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
): void {
  const scaleX = tgtW / srcW
  const scaleY = tgtH / srcH

  for (const child of frame.children) {
    scaleNodeRecursive(child, scaleX, scaleY, tgtW, tgtH)
  }
}

function scaleNodeRecursive(
  node: SceneNode,
  scaleX: number,
  scaleY: number,
  frameW: number,
  frameH: number,
): void {
  // Scale position
  node.x = Math.round(node.x * scaleX)
  node.y = Math.round(node.y * scaleY)

  const isFullBleed = node.width >= frameW / scaleX * 0.9

  if (isFullBleed && 'resize' in node) {
    // Full-bleed elements stretch to frame width, scale height proportionally
    (node as FrameNode).resize(frameW, Math.round(node.height * scaleY))
  } else if ('resize' in node && node.type !== 'TEXT') {
    // Scale non-text elements proportionally (use uniform scale from scaleX
    // to keep product/component instances undistorted; only scale vertically
    // when there's a very large vertical change)
    const uniformScale = Math.min(scaleX, scaleY)
    const newW = Math.round(node.width * uniformScale)
    const newH = Math.round(node.height * uniformScale)
    if (newW > 0 && newH > 0) {
      (node as FrameNode).resize(newW, newH)
    }
  }

  if (node.type === 'TEXT') {
    const textNode = node as TextNode
    textNode.textAutoResize = 'HEIGHT'
    if (textNode.width > frameW * 0.9) {
      textNode.resize(Math.round(frameW * 0.85), textNode.height)
    }
  }

  // Recurse into children
  if ('children' in node && node.type !== 'INSTANCE') {
    const childFrame = node as FrameNode
    for (const child of childFrame.children) {
      // Children inside a container use the parent's internal scale,
      // not the root frame's scale (their coords are relative to parent)
      const parentScaleX = isFullBleed ? 1 : (scaleX === scaleY ? 1 : scaleX)
      const parentScaleY = isFullBleed ? scaleY : (scaleX === scaleY ? 1 : scaleY)
      scaleNodeRecursive(child, parentScaleX, parentScaleY, childFrame.width, childFrame.height)
    }
  }
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

interface EditPlan {
  steps: EditStep[]
  [k: string]: unknown
}

async function applyEditPlan(
  frame: FrameNode,
  steps: EditStep[],
  srcW: number,
  srcH: number,
  tgtW: number,
  tgtH: number,
): Promise<void> {
  for (const step of steps) {
    // Resolve node: try ID first, then name
    let node: SceneNode | null = null
    if (step.targetNodeId) {
      const byId = await figma.getNodeByIdAsync(step.targetNodeId)
      if (byId && isDescendantOf(byId, frame)) {
        node = byId as SceneNode
      }
    }
    if (!node && step.targetNodeName) {
      node = findNodeByName(frame, step.targetNodeName)
    }

    if (!node) continue

    switch (step.action) {
      case 'move': {
        const dx = Number(step.params.dx || 0)
        const dy = Number(step.params.dy || 0)
        const x = step.params.x as number | undefined
        const y = step.params.y as number | undefined
        if (x !== undefined) node.x = x
        else node.x = node.x + dx
        if (y !== undefined) node.y = y
        else node.y = node.y + dy
        break
      }
      case 'scale': {
        const factor = Number(step.params.factor || 1)
        const factorX = Number(step.params.factorX || factor)
        const factorY = Number(step.params.factorY || factor)
        if ('resize' in node) {
          (node as FrameNode).resize(
            Math.round(node.width * factorX),
            Math.round(node.height * factorY),
          )
        }
        break
      }
      case 'reflow': {
        if (node.type === 'TEXT') {
          const textNode = node as TextNode
          try {
            await figma.loadFontAsync(textNode.fontName as FontName)
            textNode.textAutoResize = 'HEIGHT'
            const maxWidth = Number(step.params.maxWidth || tgtW * 0.85)
            if (textNode.width > maxWidth) {
              textNode.resize(maxWidth, textNode.height)
            }
            const newFontSize = step.params.fontSize as number | undefined
            if (newFontSize) {
              textNode.fontSize = newFontSize
            }
          } catch {
            // Font not loadable, skip
          }
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
              const zoom = Number(step.params.zoom || 0.85)
              const panX = Number(step.params.panX || 0)
              const panY = Number(step.params.panY || 0)
              applyCropToRect(
                node as RectangleNode,
                imgFill.imageHash,
                Math.round(node.width),
                Math.round(node.height),
                imgSize.width,
                imgSize.height,
                { zoom, panX, panY },
              )
            }
          }
        }
        break
      }
      default:
        break
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
// Composition QA
// ---------------------------------------------------------------------------

interface QAResult {
  clippedTexts: Array<{ id: string; name: string; overflow: number }>
  overlaps: Array<{ a: string; b: string }>
  edgeViolations: Array<{ id: string; edge: string; distance: number }>
  storyOcclusionWarnings: Array<{ id: string; name: string; coverageRatio: number }>
}

const SAFE_ZONES: Record<string, { top: number; bottom: number; side: number }> = {
  '9x16': { top: 240, bottom: 492, side: 80 },
  '4x5': { top: 180, bottom: 180, side: 80 },
  '1x1': { top: 144, bottom: 144, side: 80 },
}

function runCompositionQA(frame: FrameNode, frameW: number, frameH: number): QAResult {
  const result: QAResult = {
    clippedTexts: [],
    overlaps: [],
    edgeViolations: [],
    storyOcclusionWarnings: [],
  }

  const ratio = detectRatio(frameW, frameH)
  const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 }

  const contentChildren: SceneNode[] = []

  for (const child of frame.children) {
    if (child.type === 'TEXT') {
      if (child.y + child.height > frameH + 2) {
        result.clippedTexts.push({
          id: child.id,
          name: child.name,
          overflow: child.y + child.height - frameH,
        })
      }
    }

    const isBackground = child.width >= frameW * 0.9 && child.height >= frameH * 0.9
    if (!isBackground) {
      contentChildren.push(child)
    }

    if (!isBackground && child.type === 'FRAME') {
      const overlayArea = child.width * child.height
      const frameArea = frameW * frameH
      const coverageRatio = overlayArea / frameArea
      if (coverageRatio > 0.15 && child.y / frameH < 0.4) {
        result.storyOcclusionWarnings.push({
          id: child.id,
          name: child.name,
          coverageRatio,
        })
      }
    }
  }

  for (let i = 0; i < contentChildren.length; i++) {
    for (let j = i + 1; j < contentChildren.length; j++) {
      const a = contentChildren[i]
      const b = contentChildren[j]
      if (rectsOverlap(a, b)) {
        result.overlaps.push({ a: a.name, b: b.name })
      }
    }
  }

  const margin = safeZone.side
  for (const child of contentChildren) {
    if (child.x < margin) {
      result.edgeViolations.push({ id: child.id, edge: 'left', distance: child.x })
    }
    if (child.y < safeZone.top) {
      result.edgeViolations.push({ id: child.id, edge: 'top', distance: child.y })
    }
    if (child.x + child.width > frameW - margin) {
      result.edgeViolations.push({ id: child.id, edge: 'right', distance: frameW - (child.x + child.width) })
    }
    if (child.y + child.height > frameH - safeZone.bottom) {
      result.edgeViolations.push({ id: child.id, edge: 'bottom', distance: frameH - safeZone.bottom - (child.y + child.height) })
    }
  }

  return result
}

function rectsOverlap(a: SceneNode, b: SceneNode): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

// ---------------------------------------------------------------------------
// QA auto-fixes
// ---------------------------------------------------------------------------

function applyQAFixes(frame: FrameNode, qa: QAResult, frameW: number, frameH: number): void {
  const ratio = detectRatio(frameW, frameH)
  const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 }

  for (const clip of qa.clippedTexts) {
    const node = frame.findOne((n) => n.id === clip.id)
    if (node && node.type === 'TEXT') {
      node.textAutoResize = 'HEIGHT'
      if (node.y + node.height > frameH - safeZone.bottom) {
        node.y = Math.max(safeZone.top, frameH - safeZone.bottom - node.height)
      }
    }
  }

  for (const violation of qa.edgeViolations) {
    const node = frame.findOne((n) => n.id === violation.id)
    if (!node) continue

    if (violation.edge === 'left' && node.x < safeZone.side) {
      node.x = safeZone.side
    }
    if (violation.edge === 'right' && node.x + node.width > frameW - safeZone.side) {
      node.x = Math.max(safeZone.side, frameW - safeZone.side - node.width)
    }
    if (violation.edge === 'top' && node.y < safeZone.top) {
      node.y = safeZone.top
    }
    if (violation.edge === 'bottom' && node.y + node.height > frameH - safeZone.bottom) {
      node.y = Math.max(safeZone.top, frameH - safeZone.bottom - node.height)
    }
  }
}

// ---------------------------------------------------------------------------
// Image framing review (reuses the same backend reviewer as iterate.ts)
// ---------------------------------------------------------------------------

function findAllImageRects(node: SceneNode): RectangleNode[] {
  const rects: RectangleNode[] = []
  if (node.type === 'RECTANGLE') {
    const fills = (node.fills as readonly Paint[]) || []
    if (fills.length > 0 && fills[0].type === 'IMAGE') {
      rects.push(node as RectangleNode)
    }
  }
  if ('children' in node) {
    for (const c of (node as FrameNode).children) rects.push(...findAllImageRects(c))
  }
  return rects
}

async function reviewAndFixImageFraming(
  _frame: FrameNode,
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

      const pngBytes = await rect.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 0.5 },
      })

      const base64 = bytesToBase64(Array.from(pngBytes))

      const resp = await fetch(`${apiBase}/api/plugin/iterator/review-placement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Heimdall-Plugin-Token': token,
        },
        body: JSON.stringify({
          previewImageBase64: base64,
          mimeType: 'image/png',
          rectWidth: Math.round(rect.width),
          rectHeight: Math.round(rect.height),
          imageWidth: imgSize.width,
          imageHeight: imgSize.height,
          context: 'This image was resized as part of a format derivation. Check if the crop still shows the subject well.',
        }),
      })

      if (resp.ok) {
        const result = await resp.json()
        if (result.action === 'adjust' && (result.confidence === 'high' || result.confidence === 'medium')) {
          applyCropToRect(
            rect,
            imageFill.imageHash,
            Math.round(rect.width),
            Math.round(rect.height),
            imgSize.width,
            imgSize.height,
            { zoom: 1 + result.zoomDelta, panX: result.panX, panY: result.panY },
          )
        }
      }
    } catch {
      // Review failed for this image, keep current framing
    }
  }
}

// ---------------------------------------------------------------------------
// Crop / image-transform helpers (same as iterate.ts)
// ---------------------------------------------------------------------------

interface CropParams {
  zoom: number
  panX: number
  panY: number
}

interface CropAdjustmentMsg {
  rectId: string
  imageHash: string
  rectWidth: number
  rectHeight: number
  imageWidth: number
  imageHeight: number
  zoomDelta: number
  panX: number
  panY: number
}

function buildImageTransform(
  rectW: number,
  rectH: number,
  imgW: number,
  imgH: number,
  params: CropParams,
): Transform {
  const rectAR = rectW / rectH
  const imgAR = imgW / imgH

  let baseScaleX: number
  let baseScaleY: number
  if (imgAR > rectAR) {
    baseScaleY = 1
    baseScaleX = rectAR / imgAR
  } else {
    baseScaleX = 1
    baseScaleY = imgAR / rectAR
  }

  const zoom = Math.max(0.3, Math.min(1, params.zoom))
  const t = 1 - zoom
  const sx = baseScaleX + (1 - baseScaleX) * t
  const sy = baseScaleY + (1 - baseScaleY) * t

  const tx = (1 - sx) * 0.5 + params.panX * sx
  const ty = (1 - sy) * 0.5 + params.panY * sy

  const clampedTx = Math.max(0, Math.min(1 - sx, tx))
  const clampedTy = Math.max(0, Math.min(1 - sy, ty))

  return [[sx, 0, clampedTx], [0, sy, clampedTy]]
}

function applyCropToRect(
  rect: RectangleNode,
  imageHash: string,
  rectW: number,
  rectH: number,
  imgW: number,
  imgH: number,
  params: CropParams,
): void {
  const transform = buildImageTransform(rectW, rectH, imgW, imgH, params)
  rect.fills = [{
    type: 'IMAGE',
    imageHash,
    scaleMode: 'CROP',
    imageTransform: transform,
  }]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findNodeByName(root: FrameNode, name: string): SceneNode | null {
  let found: SceneNode | null = null
  function walk(node: SceneNode) {
    if (found) return
    if (node.name === name) { found = node; return }
    if ('children' in node) {
      for (const child of (node as FrameNode).children) walk(child)
    }
  }
  walk(root)
  return found
}

function extractLayerSummary(frame: FrameNode) {
  function mapNode(c: SceneNode): Record<string, unknown> {
    const node: Record<string, unknown> = {
      id: c.id,
      name: c.name,
      type: c.type,
      x: Math.round(c.x),
      y: Math.round(c.y),
      width: Math.round(c.width),
      height: Math.round(c.height),
      visible: c.visible !== false,
    }
    if (c.type === 'TEXT') {
      node.characters = (c as TextNode).characters
      node.fontSize = (c as TextNode).fontSize
    }
    if ('children' in c && (c as FrameNode).children.length > 0) {
      node.children = (c as FrameNode).children.map(mapNode)
    }
    if (c.type === 'RECTANGLE') {
      const fills = (c.fills as readonly Paint[]) || []
      if (fills.length > 0 && fills[0].type === 'IMAGE') {
        node.hasImage = true
      }
    }
    return node
  }

  const children = frame.children.map(mapNode)
  return {
    id: frame.id,
    name: frame.name,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    childCount: children.length,
    children,
  }
}

function bytesToBase64(byteArray: number[]): string {
  let raw = ''
  for (let ci = 0; ci < byteArray.length; ci += 8192) {
    const chunk = byteArray.slice(ci, ci + 8192)
    raw += String.fromCharCode.apply(null, chunk)
  }
  return btoa(raw)
}

// ---------------------------------------------------------------------------
// UI builder
// ---------------------------------------------------------------------------

function buildUI(frame: FrameNode, sourceRatio: string | null, _fileKey: string): string {
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
    .qa-pass { color: #4ade80; }
    .qa-warn { color: #fbbf24; }
    .qa-fail { color: #f87171; }
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
    var sourceRatio = '${sourceRatio || ''}';

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
        var lines = ['— ' + msg.ratio + ' QA:'];
        lines.push(qa.clippedTexts === 0 ? '  Text clipping: PASS' : '  Text clipping: ' + qa.clippedTexts + ' issue(s)');
        lines.push(qa.overlaps === 0 ? '  Overlap: PASS' : '  Overlap: ' + qa.overlaps + ' issue(s)');
        lines.push(qa.edgeViolations === 0 ? '  Safe zone: PASS' : '  Safe zone: ' + qa.edgeViolations + ' issue(s)');
        lines.push(qa.storyOcclusionWarnings === 0 ? '  Story occlusion: PASS' : '  Story occlusion: ' + qa.storyOcclusionWarnings + ' warning(s)');
        var div = document.createElement('div');
        div.className = 'qa-line';
        div.textContent = lines.join('\\n');
        div.style.whiteSpace = 'pre';
        qaDiv.appendChild(div);
      }
      if (msg.type === 'derive-complete') {
        document.getElementById('progress').style.display = 'none';
        var statusEl = document.getElementById('status');
        statusEl.style.display = 'block';
        statusEl.textContent = 'Done! Created ' + msg.count + ' resized format(s).';
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
      var checkboxes = document.querySelectorAll('.targets input[type="checkbox"]:checked:not(:disabled)');
      var selected = [];
      checkboxes.forEach(function(cb) { selected.push(cb.value); });
      if (selected.length === 0) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Select at least one target format.';
        return;
      }
      var btn = document.getElementById('btn-derive');
      btn.disabled = true;
      btn.textContent = 'Resizing...';
      document.getElementById('qa-results').innerHTML = '';
      parent.postMessage({ pluginMessage: { type: 'start-derive', targetRatios: selected } }, '*');
    });

    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
  </script>
</body>
</html>
  `.trim()
}
