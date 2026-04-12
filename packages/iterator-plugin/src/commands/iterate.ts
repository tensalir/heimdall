/**
 * Iterate on Selection — the primary v1 command.
 *
 * Inspects the selected frame, extracts its layer structure,
 * sends it to the Iterator backend for full variant generation,
 * then clones the frame and applies new images + copy.
 */

import { getApiBase, getPluginToken } from '../constants'

export function runIterate(): void {
  const selection = figma.currentPage.selection
  if (selection.length === 0) {
    figma.closePlugin('Select a frame to iterate on.')
    return
  }

  const frame = selection[0]
  if (frame.type !== 'FRAME') {
    figma.closePlugin('Please select a frame (not a group or other node type).')
    return
  }

  const html = buildUI(frame.id, frame.name)
  figma.showUI(html, { width: 440, height: 640 })

  const sourceFrame = frame as FrameNode

  figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'ready') {
      const layerSummary = extractLayerSummary(sourceFrame)
      figma.ui.postMessage({ type: 'frame-data', data: layerSummary })
    }

    if (msg.type === 'apply-variant') {
      try {
        figma.ui.postMessage({ type: 'status', text: 'Cloning frame...' })

        const clone = sourceFrame.clone()
        clone.name = sourceFrame.name + '-variant'
        clone.x = sourceFrame.x + sourceFrame.width + 80

        // Apply images
        const images = (msg.images || []) as Array<{ nodeId: string; bytes: number[]; name: string }>
        let imagesPlaced = 0

        for (const img of images) {
          if (!img.bytes || img.bytes.length === 0) continue

          const bytes = new Uint8Array(img.bytes)
          const image = figma.createImage(bytes)

          // Find the matching rect inside the CLONE (not the original)
          // The clone preserves structure but gets new IDs
          const originalNode = await figma.getNodeByIdAsync(img.nodeId)
          if (!originalNode) continue

          // Find equivalent node in clone by name path
          const targetRect = findImageRectInClone(clone, originalNode.name)
          if (!targetRect) continue

          const fills = JSON.parse(JSON.stringify(targetRect.fills))
          if (fills.length > 0 && fills[0].type === 'IMAGE') {
            fills[0].imageHash = image.hash
          } else {
            fills.unshift({ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' })
          }
          targetRect.fills = fills
          imagesPlaced++
        }

        // Apply copy changes
        const copyChanges = (msg.copyChanges || []) as Array<{ nodeName: string; text: string }>
        let copyApplied = 0

        for (const change of copyChanges) {
          const textNode = findTextNodeInClone(clone, change.nodeName)
          if (!textNode || textNode.type !== 'TEXT') continue

          try {
            await figma.loadFontAsync(textNode.fontName as FontName)
            textNode.characters = change.text
            textNode.textAutoResize = 'HEIGHT'
            copyApplied++
          } catch {
            // Font load failed, skip this text change
          }
        }

        // Position and select
        figma.currentPage.selection = [clone]
        figma.viewport.scrollAndZoomIntoView([clone])

        figma.ui.postMessage({
          type: 'status',
          text: `Variant created! ${imagesPlaced} images replaced, ${copyApplied} copy changes applied.`,
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
    if (node.type === 'RECTANGLE' && node.name === targetName) {
      found = node as RectangleNode
      return
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
  const children = frame.children.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    x: Math.round(c.x),
    y: Math.round(c.y),
    width: Math.round(c.width),
    height: Math.round(c.height),
    visible: c.visible !== false,
  }))

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

    document.getElementById('btn-variant').addEventListener('click', async function() {
      var btn = document.getElementById('btn-variant');
      btn.disabled = true;
      btn.textContent = 'Generating variant...';

      try {
        setProgress('Step 1/4: Sending to Iterator backend...');

        // Find image node IDs (frames named {EDIT})
        var imageNodeIds = [];
        if (frameData && frameData.children) {
          for (var i = 0; i < frameData.children.length; i++) {
            var child = frameData.children[i];
            if (child.type === 'FRAME' && child.name.indexOf('{EDIT}') >= 0) {
              imageNodeIds.push(child.id);
            }
          }
        }

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
        setProgress('Step 2/4: Downloading generated images...');

        // Fetch each generated image as bytes
        var imagePayloads = [];
        for (var j = 0; j < result.imageResults.length; j++) {
          var imgResult = result.imageResults[j];
          if (imgResult.url) {
            try {
              setProgress('Step 2/4: Downloading image ' + (j + 1) + '/' + result.imageResults.length + '...');
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
              // Skip failed image downloads
            }
          }
        }

        setProgress('Step 3/4: Preparing copy changes...');

        // Extract copy changes from copyPlan
        var copyChanges = [];
        if (result.copyPlan && result.copyPlan.variants && result.copyPlan.variants.length > 0) {
          var variant = result.copyPlan.variants[0];
          // Map headline to the main text node
          if (variant.headline) {
            // Try to find the headline text node by common patterns
            for (var k = 0; k < frameData.children.length; k++) {
              var c = frameData.children[k];
              if (c.type === 'TEXT' && c.height > 100) {
                copyChanges.push({ nodeName: c.name, text: variant.headline });
                break;
              }
            }
          }
        }

        setProgress('Step 4/4: Applying variant to Figma...');

        // Send to main thread for application
        parent.postMessage({ pluginMessage: {
          type: 'apply-variant',
          images: imagePayloads,
          copyChanges: copyChanges
        }}, '*');

      } catch (err) {
        var el = document.getElementById('status');
        el.style.display = 'block';
        el.textContent = 'Error: ' + (err.message || err);
        btn.disabled = false;
        btn.textContent = 'Create Variant';
      }
    });

    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*');
  </script>
</body>
</html>
  `.trim()
}
