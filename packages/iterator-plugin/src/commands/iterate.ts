/**
 * Iterate on Selection — the primary v1 command.
 *
 * Inspects the selected frame, extracts its layer structure,
 * sends it to the Iterator backend for full variant generation,
 * then clones the frame, applies new images + copy, and runs
 * an automatic face-visibility review loop to adjust crop/zoom.
 */

import { getApiBase, getPluginToken } from '../constants'

// ---------------------------------------------------------------------------
// Crop / image-transform helpers
// ---------------------------------------------------------------------------

interface CropParams {
  zoom: number
  panX: number
  panY: number
}

/**
 * Build a Figma imageTransform matrix for CROP mode.
 *
 * The transform is a 2x3 affine matrix [[sx, 0, tx], [0, sy, ty]] that maps
 * normalized image coordinates (0-1) to the rectangle viewport.
 *
 * zoom=1 means the image covers the rect exactly (same as FILL).
 * zoom<1 means the image is scaled down, revealing more of it (zoom out).
 * panX/panY shift the visible window in normalized coordinates.
 */
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

/**
 * Walk up from a node to find the nearest ancestor frame whose name
 * matches the EXP- naming convention (e.g. EXP-SB171...9x16).
 * This lets users select any child element and still get the full ad context.
 */
function resolveExperimentFrame(node: SceneNode): FrameNode | null {
  let current: BaseNode | null = node
  while (current) {
    if (current.type === 'FRAME' && /^EXP-/.test(current.name)) {
      return current as FrameNode
    }
    current = current.parent
  }
  return null
}

export function runIterate(): void {
  const selection = figma.currentPage.selection
  if (selection.length === 0) {
    figma.closePlugin('Select an ad frame (or any element inside one) to create an iteration from.')
    return
  }

  const selected = selection[0]
  const frame = resolveExperimentFrame(selected)

  if (!frame) {
    figma.closePlugin(
      'Could not find an experiment frame (EXP-...). '
      + 'Please select an ad frame like EXP-SB171...9x16, or any element inside one.'
    )
    return
  }

  const html = buildUI(frame.id, frame.name)
  figma.showUI(html, { width: 440, height: 640 })

  const sourceFrame = frame

  figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'ready') {
      const layerSummary = extractLayerSummary(sourceFrame)
      figma.ui.postMessage({ type: 'frame-data', data: layerSummary })
    }

    if (msg.type === 'create-placeholder') {
      try {
        const clone = sourceFrame.clone()
        clone.name = sourceFrame.name + '-variant'
        clone.x = sourceFrame.x + sourceFrame.width + 80

        // Grey out all image rectangles as placeholders
        function findImageRects(node: SceneNode): RectangleNode[] {
          const rects: RectangleNode[] = []
          if (node.type === 'RECTANGLE' && node.fills && (node.fills as readonly Paint[]).length > 0) {
            const fills = node.fills as readonly Paint[]
            if (fills[0].type === 'IMAGE') rects.push(node as RectangleNode)
          }
          if ('children' in node) {
            for (const c of (node as FrameNode).children) rects.push(...findImageRects(c))
          }
          return rects
        }

        const imageRects = findImageRects(clone)
        for (const rect of imageRects) {
          rect.fills = [{ type: 'SOLID', color: { r: 0.85, g: 0.85, b: 0.88 }, opacity: 1 }]
        }

        // Add a "Generating..." label on the clone
        const label = figma.createText()
        await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' })
        label.fontName = { family: 'Inter', style: 'Semi Bold' }
        label.characters = 'Generating variant...'
        label.fontSize = 32
        label.fills = [{ type: 'SOLID', color: { r: 0.4, g: 0.35, b: 0.9 } }]
        clone.appendChild(label)
        label.x = 80
        label.y = clone.height - 120

        figma.currentPage.selection = [clone]
        figma.viewport.scrollAndZoomIntoView([clone])

        figma.ui.postMessage({
          type: 'placeholder-ready',
          cloneId: clone.id,
          imageRectNames: imageRects.map((r) => r.name),
        })
      } catch (err) {
        figma.ui.postMessage({ type: 'status', text: 'Error creating placeholder: ' + (err as Error).message })
      }
    }

    if (msg.type === 'apply-variant') {
      try {
        const cloneId = msg.cloneId as string
        const clone = await figma.getNodeByIdAsync(cloneId)
        if (!clone || clone.type !== 'FRAME') {
          figma.ui.postMessage({ type: 'status', text: 'Error: variant frame not found' })
          return
        }

        const variantFrame = clone as FrameNode

        // Remove the "Generating..." label
        const genLabel = variantFrame.children.find((c) => c.type === 'TEXT' && c.name === 'Generating variant...')
        if (genLabel) genLabel.remove()

        // Apply images and collect placement metadata for review
        const images = (msg.images || []) as Array<{ nodeId: string; bytes: number[]; name: string; framing?: { action: string; zoomDelta: number; panX: number; panY: number; confidence: string; reason: string } | null }>
        let imagesPlaced = 0
        const placedRects: Array<{
          rectId: string
          imageHash: string
          rectWidth: number
          rectHeight: number
          imageWidth: number
          imageHeight: number
          name: string
        }> = []

        for (const img of images) {
          if (!img.bytes || img.bytes.length === 0) continue

          const bytes = new Uint8Array(img.bytes)
          try {
            const image = figma.createImage(bytes)
            const imageSize = await image.getSizeAsync()

            const originalNode = await figma.getNodeByIdAsync(img.nodeId)
            if (!originalNode) continue

            let rectName = originalNode.name
            if (originalNode.type === 'FRAME' && 'children' in originalNode) {
              const origRect = (originalNode as FrameNode).children.find((c: SceneNode) => c.type === 'RECTANGLE')
              if (origRect) rectName = origRect.name
            }

            const targetRect = findImageRectInClone(variantFrame, rectName)
            if (!targetRect) continue

            const rw = Math.round(targetRect.width)
            const rh = Math.round(targetRect.height)
            const iw = imageSize.width
            const ih = imageSize.height

            // Use backend preflight framing if available, otherwise apply baseline zoom-out
            const framing = img.framing
            if (framing && framing.action === 'adjust') {
              const zoom = 1 + framing.zoomDelta
              applyCropToRect(targetRect, image.hash, rw, rh, iw, ih, { zoom, panX: framing.panX, panY: framing.panY })
            } else {
              applyCropToRect(targetRect, image.hash, rw, rh, iw, ih, { zoom: 0.85, panX: 0, panY: 0 })
            }

            const generatedName = `generated-${img.name || 'image-' + imagesPlaced}`
            targetRect.name = generatedName

            placedRects.push({
              rectId: targetRect.id,
              imageHash: image.hash,
              rectWidth: rw,
              rectHeight: rh,
              imageWidth: iw,
              imageHeight: ih,
              name: generatedName,
            })
            imagesPlaced++
          } catch {
            // Image creation failed, skip
          }
        }

        // Apply copy changes
        const copyChanges = (msg.copyChanges || []) as Array<{ nodeName: string; text: string }>
        let copyApplied = 0

        for (const change of copyChanges) {
          const textNode = findTextNodeInClone(variantFrame, change.nodeName)
          if (!textNode || textNode.type !== 'TEXT') continue

          try {
            await figma.loadFontAsync(textNode.fontName as FontName)
            textNode.characters = change.text
            textNode.textAutoResize = 'HEIGHT'
            copyApplied++
          } catch {
            // Font load failed, skip
          }
        }

        figma.currentPage.selection = [variantFrame]
        figma.viewport.scrollAndZoomIntoView([variantFrame])

        if (placedRects.length > 0) {
          // Export previews for the placed image rects so the UI can request a review
          const previews: Array<{
            rectId: string
            imageHash: string
            rectWidth: number
            rectHeight: number
            imageWidth: number
            imageHeight: number
            name: string
            previewBytes: number[]
            mimeType: string
          }> = []

          for (const pr of placedRects) {
            try {
              const rectNode = await figma.getNodeByIdAsync(pr.rectId)
              if (!rectNode) continue
              const pngBytes = await (rectNode as RectangleNode).exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 0.5 },
              })
              previews.push({
                ...pr,
                previewBytes: Array.from(pngBytes),
                mimeType: 'image/png',
              })
            } catch {
              // Export failed for this rect, skip review for it
            }
          }

          const failureSummary = (msg.failureSummary || '') as string
          const totalExpected = (msg.totalExpected || images.length) as number
          figma.ui.postMessage({
            type: 'variant-placed',
            cloneId,
            imagesPlaced,
            copyApplied,
            previews,
            failureSummary,
            totalExpected,
          })
        } else {
          figma.ui.postMessage({
            type: 'status',
            text: 'Variant created! ' + imagesPlaced + ' images replaced, ' + copyApplied + ' copy changes applied.',
          })
        }
      } catch (err) {
        figma.ui.postMessage({
          type: 'status',
          text: `Error: ${(err as Error).message}`,
        })
      }
    }

    if (msg.type === 'smart-reframe') {
      try {
        const sel = figma.currentPage.selection
        let variantFrame: FrameNode | null = null

        for (const node of sel) {
          if (node.type === 'FRAME' && node.name.endsWith('-variant')) {
            variantFrame = node as FrameNode
            break
          }
          let parent: BaseNode | null = node.parent
          while (parent) {
            if (parent.type === 'FRAME' && (parent as FrameNode).name.endsWith('-variant')) {
              variantFrame = parent as FrameNode
              break
            }
            parent = parent.parent
          }
          if (variantFrame) break
        }

        if (!variantFrame) {
          figma.ui.postMessage({ type: 'reframe-result', text: 'Select a variant frame (or any element inside one) to reframe.' })
          return
        }

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

        const imageRects = findAllImageRects(variantFrame)
        if (imageRects.length === 0) {
          figma.ui.postMessage({ type: 'reframe-result', text: 'No image tiles found in the variant frame.' })
          return
        }

        const previews: Array<{
          rectId: string
          imageHash: string
          rectWidth: number
          rectHeight: number
          imageWidth: number
          imageHeight: number
          previewBytes: number[]
          sourceBytes: number[]
          mimeType: string
        }> = []

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

            const sourceImageBytes = await img.getBytesAsync()

            previews.push({
              rectId: rect.id,
              imageHash: imageFill.imageHash,
              rectWidth: Math.round(rect.width),
              rectHeight: Math.round(rect.height),
              imageWidth: imgSize.width,
              imageHeight: imgSize.height,
              previewBytes: Array.from(pngBytes),
              sourceBytes: Array.from(sourceImageBytes),
              mimeType: 'image/png',
            })
          } catch {
            // Skip rects that fail to export
          }
        }

        figma.ui.postMessage({ type: 'reframe-previews', previews })
      } catch (err) {
        figma.ui.postMessage({ type: 'reframe-result', text: 'Error discovering tiles: ' + (err as Error).message })
      }
    }

    if (msg.type === 'apply-smart-reframe') {
      try {
        const adjustments = (msg.adjustments || []) as Array<{
          rectId: string
          imageHash: string
          rectWidth: number
          rectHeight: number
          imageWidth: number
          imageHeight: number
          zoomDelta: number
          panX: number
          panY: number
        }>
        const doConfirm = msg.confirmPass === true
        let adjusted = 0

        for (const adj of adjustments) {
          const node = await figma.getNodeByIdAsync(adj.rectId)
          if (!node || node.type !== 'RECTANGLE') continue

          const zoom = 1 + adj.zoomDelta
          applyCropToRect(
            node as RectangleNode,
            adj.imageHash,
            adj.rectWidth,
            adj.rectHeight,
            adj.imageWidth,
            adj.imageHeight,
            { zoom, panX: adj.panX, panY: adj.panY },
          )
          adjusted++
        }

        if (adjusted > 0 && doConfirm) {
          const confirmPreviews: Array<{
            rectId: string
            imageHash: string
            rectWidth: number
            rectHeight: number
            imageWidth: number
            imageHeight: number
            previewBytes: number[]
            mimeType: string
          }> = []

          for (const adj of adjustments) {
            try {
              const node = await figma.getNodeByIdAsync(adj.rectId)
              if (!node || node.type !== 'RECTANGLE') continue
              const pngBytes = await (node as RectangleNode).exportAsync({
                format: 'PNG',
                constraint: { type: 'SCALE', value: 0.5 },
              })
              confirmPreviews.push({
                rectId: adj.rectId,
                imageHash: adj.imageHash,
                rectWidth: adj.rectWidth,
                rectHeight: adj.rectHeight,
                imageWidth: adj.imageWidth,
                imageHeight: adj.imageHeight,
                previewBytes: Array.from(pngBytes),
                mimeType: 'image/png',
              })
            } catch {
              // Skip failed exports
            }
          }

          if (confirmPreviews.length > 0) {
            figma.ui.postMessage({
              type: 'reframe-confirm',
              adjusted,
              previews: confirmPreviews,
            })
            return
          }
        }

        figma.ui.postMessage({
          type: 'reframe-result',
          text: adjusted > 0
            ? 'Reframed ' + adjusted + ' image(s) for better face visibility.'
            : 'No adjustments applied.',
        })
      } catch (err) {
        figma.ui.postMessage({
          type: 'reframe-result',
          text: 'Error applying reframe: ' + (err as Error).message,
        })
      }
    }

    if (msg.type === 'apply-crop-adjustments') {
      try {
        const adjustments = (msg.adjustments || []) as Array<{
          rectId: string
          imageHash: string
          rectWidth: number
          rectHeight: number
          imageWidth: number
          imageHeight: number
          zoomDelta: number
          panX: number
          panY: number
        }>
        let adjusted = 0

        for (const adj of adjustments) {
          const node = await figma.getNodeByIdAsync(adj.rectId)
          if (!node || node.type !== 'RECTANGLE') continue

          const zoom = 1 + adj.zoomDelta
          applyCropToRect(
            node as RectangleNode,
            adj.imageHash,
            adj.rectWidth,
            adj.rectHeight,
            adj.imageWidth,
            adj.imageHeight,
            { zoom, panX: adj.panX, panY: adj.panY },
          )
          adjusted++
        }

        figma.ui.postMessage({
          type: 'status',
          text: adjusted > 0
            ? `Variant created! Auto-adjusted framing on ${adjusted} image(s).`
            : 'Variant created! Images placed without crop adjustment.',
        })
      } catch (err) {
        figma.ui.postMessage({
          type: 'status',
          text: `Error applying crop adjustments: ${(err as Error).message}`,
        })
      }
    }
  }
}

function findImageRectInClone(clone: FrameNode, targetName: string): RectangleNode | null {
  let found: RectangleNode | null = null
  function walk(node: SceneNode) {
    if (found) return
    // Match by exact name -- could be a RECTANGLE with an image fill
    if (node.type === 'RECTANGLE' && node.name === targetName) {
      found = node as RectangleNode
      return
    }
    // Or match a FRAME by name and grab its first RECTANGLE child (the image holder)
    if (node.type === 'FRAME' && node.name === targetName) {
      for (const child of (node as FrameNode).children) {
        if (child.type === 'RECTANGLE') {
          found = child as RectangleNode
          return
        }
      }
    }
    if ('children' in node) {
      for (const child of (node as FrameNode).children) walk(child)
    }
  }
  walk(clone)
  return found
}

function findTextNodeInClone(clone: FrameNode, targetName: string): TextNode | null {
  let found: TextNode | null = null
  function walk(node: SceneNode) {
    if (found) return
    if (node.type === 'TEXT' && node.name === targetName) {
      found = node as TextNode
      return
    }
    if ('children' in node) {
      for (const child of (node as FrameNode).children) walk(child)
    }
  }
  walk(clone)
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
    if ('children' in c && (c as FrameNode).children.length > 0) {
      node.children = (c as FrameNode).children.map(mapNode)
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

function buildUI(frameId: string, frameName: string): string {
  const apiBase = getApiBase()
  const token = getPluginToken()

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; background: #1e1e1e; color: #e0e0e0; font-size: 13px; }
    h2 { font-size: 15px; margin: 0 0 12px; color: #fff; }
    .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
    .status { padding: 8px 12px; background: #2a2a2a; border-radius: 6px; margin-top: 12px; white-space: pre-wrap; font-size: 11px; line-height: 1.5; }
    button { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; cursor: pointer; font-size: 13px; width: 100%; }
    button:hover { background: #4338ca; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #2a2a2a; border: 1px solid #4f46e5; margin-top: 8px; }
    .btn-secondary:hover { background: #333; }
    .layers { max-height: 200px; overflow-y: auto; margin: 8px 0; }
    .layer { padding: 4px 8px; background: #2a2a2a; border-radius: 4px; margin: 2px 0; font-size: 11px; display: flex; justify-content: space-between; }
    .layer-type { color: #888; }
    .progress { margin-top: 8px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <h2>Iterator — Create Iteration</h2>
  <div class="meta">Frame: ${frameName}</div>
  <div id="layers" class="layers">Loading layers...</div>
  <div style="margin-top: 12px;">
    <button id="btn-variant" disabled>Create Variant</button>
    <button id="btn-reframe" class="btn-secondary" disabled>Smart Reframe All</button>
  </div>
  <div id="progress" class="progress" style="display:none;"></div>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    var API_BASE = '${apiBase}';
    var TOKEN = '${token}';
    var FRAME_ID = '${frameId}';
    var FILE_KEY = ''; // Will be set from frame name parsing or passed separately
    var frameData = null;

    window.onmessage = function(event) {
      var msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'frame-data') {
        frameData = msg.data;
        renderLayers(msg.data);
        document.getElementById('btn-variant').disabled = false;
      }
      if (msg.type === 'status') {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = msg.text;
      }
    };

    function renderLayers(data) {
      var container = document.getElementById('layers');
      container.innerHTML = data.children.map(function(c) {
        return '<div class="layer"><span>' + c.name + '</span><span class="layer-type">' + c.type + ' ' + c.width + 'x' + c.height + '</span></div>';
      }).join('');
    }

    function setProgress(text) {
      var el = document.getElementById('progress');
      el.style.display = 'block';
      el.textContent = text;
    }

    var pendingCloneId = null;

    window.addEventListener('message', function(event) {
      var msg = event.data.pluginMessage;
      if (!msg) return;
      if (msg.type === 'placeholder-ready') {
        pendingCloneId = msg.cloneId;
        startGeneration();
      }
      if (msg.type === 'variant-placed') {
        pendingCloneId = msg.cloneId;
        document.getElementById('btn-reframe').disabled = false;
        runPlacementReview(msg);
      }
      if (msg.type === 'reframe-previews') {
        runSmartReframe(msg);
      }
      if (msg.type === 'reframe-result') {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = msg.text;
        document.getElementById('btn-reframe').disabled = false;
        document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
      }
      if (msg.type === 'reframe-confirm') {
        runConfirmPass(msg);
      }
    });

    async function runPlacementReview(msg) {
      try {
        var failNote = msg.failureSummary ? '\\n' + msg.failureSummary : '';
        var previews = msg.previews || [];
        if (previews.length === 0) {
          var el = document.getElementById('status');
          el.style.display = 'block';
          el.textContent = msg.imagesPlaced + ' of ' + (msg.totalExpected || '?') + ' images placed, ' + msg.copyApplied + ' copy changes.' + (failNote ? '\\n' + msg.failureSummary : '');
          return;
        }

        setProgress('Reviewing image framing (' + previews.length + ' images)...');

        var adjustments = [];
        for (var i = 0; i < previews.length; i++) {
          var preview = previews[i];
          try {
            var base64 = '';
            var bytes = preview.previewBytes;
            for (var ci = 0; ci < bytes.length; ci += 8192) {
              var chunk = bytes.slice(ci, ci + 8192);
              base64 += String.fromCharCode.apply(null, chunk);
            }
            base64 = btoa(base64);

            var reviewResp = await fetch(API_BASE + '/api/plugin/iterator/review-placement', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Heimdall-Plugin-Token': TOKEN
              },
              body: JSON.stringify({
                previewImageBase64: base64,
                mimeType: preview.mimeType,
                rectWidth: preview.rectWidth,
                rectHeight: preview.rectHeight,
                imageWidth: preview.imageWidth,
                imageHeight: preview.imageHeight,
                context: 'Portrait lifestyle photo in a performance ad grid tile'
              })
            });

            if (reviewResp.ok) {
              var result = await reviewResp.json();
              if (result.action === 'adjust' && (result.confidence === 'high' || result.confidence === 'medium')) {
                adjustments.push({
                  rectId: preview.rectId,
                  imageHash: preview.imageHash,
                  rectWidth: preview.rectWidth,
                  rectHeight: preview.rectHeight,
                  imageWidth: preview.imageWidth,
                  imageHeight: preview.imageHeight,
                  zoomDelta: result.zoomDelta,
                  panX: result.panX,
                  panY: result.panY
                });
              }
            }
          } catch (reviewErr) {
            // Review failed for this image, keep initial placement
          }
        }

        if (adjustments.length > 0) {
          setProgress('Adjusting framing on ' + adjustments.length + ' image(s)...');
          parent.postMessage({ pluginMessage: {
            type: 'apply-crop-adjustments',
            adjustments: adjustments
          }}, '*');
        } else {
          var el = document.getElementById('status');
          el.style.display = 'block';
          el.textContent = 'Variant created! ' + msg.imagesPlaced + ' images replaced, ' + msg.copyApplied + ' copy changes applied.';
        }
      } catch (err) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Variant created (review skipped): ' + (err.message || err);
      }
    }

    function bytesToBase64(byteArray) {
      var raw = '';
      for (var ci = 0; ci < byteArray.length; ci += 8192) {
        var chunk = byteArray.slice(ci, ci + 8192);
        raw += String.fromCharCode.apply(null, chunk);
      }
      return btoa(raw);
    }

    async function runSmartReframe(msg) {
      try {
        var previews = msg.previews || [];
        if (previews.length === 0) {
          var el = document.getElementById('status');
          el.style.display = 'block';
          el.textContent = 'No image tiles found to reframe.';
          document.getElementById('btn-reframe').disabled = false;
          document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
          return;
        }

        setProgress('Reviewing framing on ' + previews.length + ' image(s)...');

        var adjustments = [];
        for (var i = 0; i < previews.length; i++) {
          var preview = previews[i];
          try {
            setProgress('Reviewing image ' + (i + 1) + ' of ' + previews.length + '...');
            var previewB64 = bytesToBase64(preview.previewBytes);
            var sourceB64 = preview.sourceBytes ? bytesToBase64(preview.sourceBytes) : undefined;

            var reviewResp = await fetch(API_BASE + '/api/plugin/iterator/review-placement', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Heimdall-Plugin-Token': TOKEN
              },
              body: JSON.stringify({
                previewImageBase64: previewB64,
                sourceImageBase64: sourceB64,
                mimeType: preview.mimeType,
                rectWidth: preview.rectWidth,
                rectHeight: preview.rectHeight,
                imageWidth: preview.imageWidth,
                imageHeight: preview.imageHeight,
                context: 'Portrait lifestyle photo in a performance ad tile. Compare the full source image against the current crop and recommend zooming out if more face/headroom is available.'
              })
            });

            if (reviewResp.ok) {
              var result = await reviewResp.json();
              if (result.action === 'adjust') {
                adjustments.push({
                  rectId: preview.rectId,
                  imageHash: preview.imageHash,
                  rectWidth: preview.rectWidth,
                  rectHeight: preview.rectHeight,
                  imageWidth: preview.imageWidth,
                  imageHeight: preview.imageHeight,
                  zoomDelta: result.zoomDelta,
                  panX: result.panX,
                  panY: result.panY
                });
              }
            }
          } catch (reviewErr) {
            // Review failed for this image, skip
          }
        }

        if (adjustments.length > 0) {
          setProgress('Applying reframing to ' + adjustments.length + ' image(s)...');
          parent.postMessage({ pluginMessage: {
            type: 'apply-smart-reframe',
            adjustments: adjustments,
            confirmPass: true
          }}, '*');
        } else {
          var el = document.getElementById('status');
          el.style.display = 'block';
          el.textContent = 'No adjustments needed — framing looks good.';
          document.getElementById('btn-reframe').disabled = false;
          document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
        }
      } catch (err) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Reframe error: ' + (err.message || err);
        document.getElementById('btn-reframe').disabled = false;
        document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
      }
    }

    async function runConfirmPass(msg) {
      try {
        setProgress('Confirm pass: verifying ' + msg.adjusted + ' adjusted image(s)...');
        var previews = msg.previews || [];
        var stillNeedsWork = [];

        for (var i = 0; i < previews.length; i++) {
          var preview = previews[i];
          try {
            var base64 = '';
            var bytes = preview.previewBytes;
            for (var ci = 0; ci < bytes.length; ci += 8192) {
              var chunk = bytes.slice(ci, ci + 8192);
              base64 += String.fromCharCode.apply(null, chunk);
            }
            base64 = btoa(base64);

            var reviewResp = await fetch(API_BASE + '/api/plugin/iterator/review-placement', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Heimdall-Plugin-Token': TOKEN
              },
              body: JSON.stringify({
                previewImageBase64: base64,
                mimeType: preview.mimeType,
                rectWidth: preview.rectWidth,
                rectHeight: preview.rectHeight,
                imageWidth: preview.imageWidth,
                imageHeight: preview.imageHeight,
                context: 'This image was already adjusted once. Only recommend further adjustment if the face is still clearly too cropped.'
              })
            });

            if (reviewResp.ok) {
              var result = await reviewResp.json();
              if (result.action === 'adjust' && result.confidence === 'high') {
                stillNeedsWork.push({
                  rectId: preview.rectId,
                  imageHash: preview.imageHash,
                  rectWidth: preview.rectWidth,
                  rectHeight: preview.rectHeight,
                  imageWidth: preview.imageWidth,
                  imageHeight: preview.imageHeight,
                  zoomDelta: result.zoomDelta,
                  panX: result.panX,
                  panY: result.panY
                });
              }
            }
          } catch (err) {
            // Confirm review failed, accept current state
          }
        }

        if (stillNeedsWork.length > 0) {
          setProgress('Applying final refinement to ' + stillNeedsWork.length + ' image(s)...');
          parent.postMessage({ pluginMessage: {
            type: 'apply-smart-reframe',
            adjustments: stillNeedsWork,
            confirmPass: false
          }}, '*');
        } else {
          var el = document.getElementById('status');
          el.style.display = 'block';
          el.textContent = 'Reframed ' + msg.adjusted + ' image(s) for better face visibility.';
          document.getElementById('btn-reframe').disabled = false;
          document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
        }
      } catch (err) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Reframed ' + msg.adjusted + ' image(s) (confirm pass skipped).';
        document.getElementById('btn-reframe').disabled = false;
        document.getElementById('btn-reframe').textContent = 'Smart Reframe All';
      }
    }

    async function startGeneration() {
      try {
        setProgress('Step 2/6: Sending to Iterator backend...');

        // Recursively find image node IDs (frames named {EDIT})
        var imageNodeIds = [];
        function findEditFrames(nodes) {
          if (!nodes) return;
          for (var i = 0; i < nodes.length; i++) {
            var child = nodes[i];
            if (child.type === 'FRAME' && child.name && child.name.indexOf('{EDIT}') >= 0) {
              imageNodeIds.push(child.id);
            }
            if (child.children) findEditFrames(child.children);
          }
        }
        if (frameData) findEditFrames(frameData.children);

        // POST to variant endpoint
        var reqBody = {
          sourceFileKey: 'lLZ2lCmGcYTNJMxLV5EitY',
          sourceFrameId: FRAME_ID,
          imageNodeIds: imageNodeIds.length > 0 ? imageNodeIds : undefined,
          briefing: 'Create a variant of this paid social ad. Different people in the lifestyle photos, different copy, same theme and layout.',
          model: 'nano-banana-2',
          resolution: '2K'
        };

        var resp = await fetch(API_BASE + '/api/plugin/iterator/variant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Heimdall-Plugin-Token': TOKEN
          },
          body: JSON.stringify(reqBody)
        });

        if (!resp.ok) {
          var errData = await resp.json().catch(function() { return { error: resp.status }; });
          throw new Error(errData.error || errData.message || 'Backend error ' + resp.status);
        }

        var result = await resp.json();
        setProgress('Step 3/6: Downloading generated images...');

        // Fetch each generated image as bytes, tracking failures and framing instructions
        var imagePayloads = [];
        var failedTiles = [];
        for (var j = 0; j < result.imageResults.length; j++) {
          var imgResult = result.imageResults[j];
          if (!imgResult.url) {
            failedTiles.push('Tile ' + (j + 1) + ': ' + (imgResult.error || 'generation failed'));
            continue;
          }
          try {
            setProgress('Step 3/6: Downloading image ' + (j + 1) + '/' + result.imageResults.length + '...');
            var imgResp = await fetch(imgResult.url);
            if (imgResp.ok) {
              var buf = await imgResp.arrayBuffer();
              imagePayloads.push({
                nodeId: imgResult.nodeId,
                bytes: Array.from(new Uint8Array(buf)),
                name: 'variant-image-' + j,
                framing: imgResult.framing || null
              });
            } else {
              failedTiles.push('Tile ' + (j + 1) + ': download failed (' + imgResp.status + ')');
            }
          } catch (imgErr) {
            failedTiles.push('Tile ' + (j + 1) + ': ' + (imgErr.message || 'download error'));
          }
        }
        if (failedTiles.length > 0) {
          setProgress('Warning: ' + failedTiles.length + ' tile(s) failed. ' + imagePayloads.length + ' loaded.');
        }

        setProgress('Step 4/6: Preparing copy changes...');

        // Extract copy changes from copyPlan
        var copyChanges = [];
        if (result.copyPlan && result.copyPlan.variants && result.copyPlan.variants.length > 0) {
          var variant = result.copyPlan.variants[0];
          // Find the headline text node (largest TEXT node in the tree)
          function findLargestText(nodes) {
            var best = null;
            if (!nodes) return best;
            for (var k = 0; k < nodes.length; k++) {
              var c = nodes[k];
              if (c.type === 'TEXT' && c.height > 100) {
                if (!best || c.height > best.height) best = c;
              }
              if (c.children) {
                var sub = findLargestText(c.children);
                if (sub && (!best || sub.height > best.height)) best = sub;
              }
            }
            return best;
          }
          if (variant.headline) {
            var headlineNode = findLargestText(frameData.children);
            if (headlineNode) {
              copyChanges.push({ nodeName: headlineNode.name, text: variant.headline });
            }
          }
        }

        var failureSummary = failedTiles.length > 0
          ? failedTiles.length + ' of ' + result.imageResults.length + ' tile(s) failed: ' + failedTiles.join('; ')
          : '';
        setProgress('Step 5/6: Applying images and copy to variant...');

        // Send to main thread for application on the existing clone
        parent.postMessage({ pluginMessage: {
          type: 'apply-variant',
          cloneId: pendingCloneId,
          images: imagePayloads,
          copyChanges: copyChanges,
          failureSummary: failureSummary,
          totalExpected: result.imageResults.length
        }}, '*');

      } catch (err) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Error: ' + (err.message || err);
        document.getElementById('btn-variant').disabled = false;
        document.getElementById('btn-variant').textContent = 'Create Variant';
      }
    }

    document.getElementById('btn-variant').addEventListener('click', function() {
      var btn = document.getElementById('btn-variant');
      btn.disabled = true;
      btn.textContent = 'Generating variant...';
      setProgress('Step 1/6: Creating placeholder frame...');

      // Ask main thread to clone and create grey placeholders
      parent.postMessage({ pluginMessage: { type: 'create-placeholder' } }, '*');
      // startGeneration() will be called when 'placeholder-ready' arrives
    });

    document.getElementById('btn-reframe').addEventListener('click', function() {
      var btn = document.getElementById('btn-reframe');
      btn.disabled = true;
      btn.textContent = 'Reframing...';
      setProgress('Discovering image tiles...');
      parent.postMessage({ pluginMessage: { type: 'smart-reframe' } }, '*');
    });

    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
  </script>
</body>
</html>
  `.trim()
}
