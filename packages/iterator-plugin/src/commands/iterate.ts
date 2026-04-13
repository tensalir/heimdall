/**
 * Iterate on Selection — the primary v1 command.
 *
 * Inspects the selected frame, extracts its layer structure,
 * sends it to the Iterator backend for full variant generation,
 * then clones the frame and applies new images + copy.
 */

import { getApiBase, getPluginToken } from '../constants'

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
    figma.closePlugin('Select an ad frame (or any element inside one) to iterate on.')
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

        // Apply images
        const images = (msg.images || []) as Array<{ nodeId: string; bytes: number[]; name: string }>
        let imagesPlaced = 0

        for (const img of images) {
          if (!img.bytes || img.bytes.length === 0) continue

          const bytes = new Uint8Array(img.bytes)
          try {
            const image = figma.createImage(bytes)

            const originalNode = await figma.getNodeByIdAsync(img.nodeId)
            if (!originalNode) continue

            let rectName = originalNode.name
            if (originalNode.type === 'FRAME' && 'children' in originalNode) {
              const origRect = (originalNode as FrameNode).children.find((c: SceneNode) => c.type === 'RECTANGLE')
              if (origRect) rectName = origRect.name
            }

            const targetRect = findImageRectInClone(variantFrame, rectName)
            if (!targetRect) continue

            targetRect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }]
            targetRect.name = `generated-${img.name || 'image-' + imagesPlaced}`
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

        figma.ui.postMessage({
          type: 'status',
          text: 'Variant created! ' + imagesPlaced + ' images replaced, ' + copyApplied + ' copy changes applied.',
        })
      } catch (err) {
        figma.ui.postMessage({
          type: 'status',
          text: `Error: ${(err as Error).message}`,
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
    .layers { max-height: 200px; overflow-y: auto; margin: 8px 0; }
    .layer { padding: 4px 8px; background: #2a2a2a; border-radius: 4px; margin: 2px 0; font-size: 11px; display: flex; justify-content: space-between; }
    .layer-type { color: #888; }
    .progress { margin-top: 8px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <h2>Iterator — Create Variant</h2>
  <div class="meta">Frame: ${frameName}</div>
  <div id="layers" class="layers">Loading layers...</div>
  <div style="margin-top: 12px;">
    <button id="btn-variant" disabled>Create Variant</button>
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
    });

    async function startGeneration() {
      try {
        setProgress('Step 2/5: Sending to Iterator backend...');

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
        setProgress('Step 3/5: Downloading generated images...');

        // Fetch each generated image as bytes
        var imagePayloads = [];
        for (var j = 0; j < result.imageResults.length; j++) {
          var imgResult = result.imageResults[j];
          if (imgResult.url) {
            try {
              setProgress('Step 3/5: Downloading image ' + (j + 1) + '/' + result.imageResults.length + '...');
              var imgResp = await fetch(imgResult.url);
              if (imgResp.ok) {
                var buf = await imgResp.arrayBuffer();
                imagePayloads.push({
                  nodeId: imgResult.nodeId,
                  bytes: Array.from(new Uint8Array(buf)),
                  name: 'variant-image-' + j
                });
              }
            } catch (imgErr) {
              // Image download failed, skip
            }
          }
        }

        setProgress('Step 4/5: Preparing copy changes...');

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

        setProgress('Step 5/5: Applying images and copy to variant...');

        // Send to main thread for application on the existing clone
        parent.postMessage({ pluginMessage: {
          type: 'apply-variant',
          cloneId: pendingCloneId,
          images: imagePayloads,
          copyChanges: copyChanges
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
      setProgress('Step 1/5: Creating placeholder frame...');

      // Ask main thread to clone and create grey placeholders
      parent.postMessage({ pluginMessage: { type: 'create-placeholder' } }, '*');
      // startGeneration() will be called when 'placeholder-ready' arrives
    });

    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
  </script>
</body>
</html>
  `.trim()
}
