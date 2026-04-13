"use strict";
(() => {
  // src/constants.ts
  var DEFAULT_ITERATOR_API = "https://bifrost-rose.vercel.app";
  function getApiBase() {
    return DEFAULT_ITERATOR_API;
  }
  function getPluginToken() {
    return true ? "58a1bfb45c0020137ee780cafd52f27dc6d9dcada2b69fe44eae5452c9360f37" : "";
  }

  // src/commands/iterate.ts
  function resolveExperimentFrame(node) {
    let current = node;
    while (current) {
      if (current.type === "FRAME" && /^EXP-/.test(current.name)) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }
  function runIterate() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.closePlugin("Select an ad frame (or any element inside one) to iterate on.");
      return;
    }
    const selected = selection[0];
    const frame = resolveExperimentFrame(selected);
    if (!frame) {
      figma.closePlugin(
        "Could not find an experiment frame (EXP-...). Please select an ad frame like EXP-SB171...9x16, or any element inside one."
      );
      return;
    }
    const html = buildUI(frame.id, frame.name);
    figma.showUI(html, { width: 440, height: 640 });
    const sourceFrame = frame;
    figma.ui.onmessage = async (msg) => {
      var _a;
      if (msg.type === "ready") {
        const layerSummary = extractLayerSummary(sourceFrame);
        figma.ui.postMessage({ type: "frame-data", data: layerSummary });
      }
      if (msg.type === "create-placeholder") {
        try {
          let findImageRects2 = function(node) {
            const rects = [];
            if (node.type === "RECTANGLE" && node.fills && node.fills.length > 0) {
              const fills = node.fills;
              if (fills[0].type === "IMAGE") rects.push(node);
            }
            if ("children" in node) {
              for (const c of node.children) rects.push(...findImageRects2(c));
            }
            return rects;
          };
          var findImageRects = findImageRects2;
          const clone = sourceFrame.clone();
          clone.name = sourceFrame.name + "-variant";
          clone.x = sourceFrame.x + sourceFrame.width + 80;
          const imageRects = findImageRects2(clone);
          for (const rect of imageRects) {
            rect.fills = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.88 }, opacity: 1 }];
          }
          const label = figma.createText();
          await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
          label.fontName = { family: "Inter", style: "Semi Bold" };
          label.characters = "Generating variant...";
          label.fontSize = 32;
          label.fills = [{ type: "SOLID", color: { r: 0.4, g: 0.35, b: 0.9 } }];
          clone.appendChild(label);
          label.x = 80;
          label.y = clone.height - 120;
          figma.currentPage.selection = [clone];
          figma.viewport.scrollAndZoomIntoView([clone]);
          figma.ui.postMessage({
            type: "placeholder-ready",
            cloneId: clone.id,
            imageRectNames: imageRects.map((r) => r.name)
          });
        } catch (err) {
          figma.ui.postMessage({ type: "status", text: "Error creating placeholder: " + err.message });
        }
      }
      if (msg.type === "apply-variant") {
        try {
          const cloneId = msg.cloneId;
          const clone = await figma.getNodeByIdAsync(cloneId);
          if (!clone || clone.type !== "FRAME") {
            figma.ui.postMessage({ type: "status", text: "Error: variant frame not found" });
            return;
          }
          const variantFrame = clone;
          const genLabel = variantFrame.children.find((c) => c.type === "TEXT" && c.name === "Generating variant...");
          if (genLabel) genLabel.remove();
          const images = msg.images || [];
          let imagesPlaced = 0;
          const debugImgLog = [];
          for (const img of images) {
            debugImgLog.push(`img nodeId=${img.nodeId} bytesLen=${((_a = img.bytes) == null ? void 0 : _a.length) || 0}`);
            if (!img.bytes || img.bytes.length === 0) {
              debugImgLog.push("  SKIP: empty bytes");
              continue;
            }
            const bytes = new Uint8Array(img.bytes);
            try {
              const image = figma.createImage(bytes);
              debugImgLog.push(`  createImage hash=${image.hash}`);
              const originalNode = await figma.getNodeByIdAsync(img.nodeId);
              debugImgLog.push(`  originalNode=${originalNode ? originalNode.name : "NOT FOUND"}`);
              if (!originalNode) {
                debugImgLog.push("  SKIP: original not found");
                continue;
              }
              const targetRect = findImageRectInClone(variantFrame, originalNode.name);
              debugImgLog.push(`  targetRect=${targetRect ? targetRect.id + ":" + targetRect.name : "NOT FOUND"}`);
              if (!targetRect) {
                debugImgLog.push("  SKIP: rect not found in clone");
                continue;
              }
              targetRect.fills = [{ type: "IMAGE", imageHash: image.hash, scaleMode: "FILL" }];
              imagesPlaced++;
              debugImgLog.push("  PLACED OK");
            } catch (imgErr) {
              debugImgLog.push(`  ERROR: ${imgErr.message}`);
            }
          }
          const copyChanges = msg.copyChanges || [];
          let copyApplied = 0;
          for (const change of copyChanges) {
            const textNode = findTextNodeInClone(variantFrame, change.nodeName);
            if (!textNode || textNode.type !== "TEXT") continue;
            try {
              await figma.loadFontAsync(textNode.fontName);
              textNode.characters = change.text;
              textNode.textAutoResize = "HEIGHT";
              copyApplied++;
            } catch (e) {
            }
          }
          figma.currentPage.selection = [variantFrame];
          figma.viewport.scrollAndZoomIntoView([variantFrame]);
          figma.ui.postMessage({
            type: "status",
            text: "Done! " + imagesPlaced + " images replaced, " + copyApplied + " copy changes applied.\n\n[DEBUG main thread]\n" + debugImgLog.join("\n")
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "status",
            text: `Error: ${err.message}`
          });
        }
      }
    };
  }
  function findImageRectInClone(clone, targetName) {
    let found = null;
    function walk(node) {
      if (found) return;
      if (node.type === "RECTANGLE" && node.name === targetName) {
        found = node;
        return;
      }
      if ("children" in node) {
        for (const child of node.children) walk(child);
      }
    }
    walk(clone);
    return found;
  }
  function findTextNodeInClone(clone, targetName) {
    let found = null;
    function walk(node) {
      if (found) return;
      if (node.type === "TEXT" && node.name === targetName) {
        found = node;
        return;
      }
      if ("children" in node) {
        for (const child of node.children) walk(child);
      }
    }
    walk(clone);
    return found;
  }
  function extractLayerSummary(frame) {
    function mapNode(c) {
      const node = {
        id: c.id,
        name: c.name,
        type: c.type,
        x: Math.round(c.x),
        y: Math.round(c.y),
        width: Math.round(c.width),
        height: Math.round(c.height),
        visible: c.visible !== false
      };
      if ("children" in c && c.children.length > 0) {
        node.children = c.children.map(mapNode);
      }
      return node;
    }
    const children = frame.children.map(mapNode);
    return {
      id: frame.id,
      name: frame.name,
      width: Math.round(frame.width),
      height: Math.round(frame.height),
      childCount: children.length,
      children
    };
  }
  function buildUI(frameId, frameName) {
    const apiBase = getApiBase();
    const token = getPluginToken();
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
  <h2>Iterator \u2014 Create Variant</h2>
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
        // #region agent log H1
        var debugLines = ['[DEBUG] imageResults: ' + result.imageResults.length];
        for (var d = 0; d < result.imageResults.length; d++) {
          debugLines.push('  [' + d + '] nodeId=' + result.imageResults[d].nodeId + ' url=' + (result.imageResults[d].url ? result.imageResults[d].url.substring(0, 80) + '...' : 'NULL') + ' error=' + (result.imageResults[d].error || 'none'));
        }
        // #endregion
        setProgress('Step 3/5: Downloading generated images...\\n' + debugLines.join('\\n'));

        // Fetch each generated image as bytes
        var imagePayloads = [];
        for (var j = 0; j < result.imageResults.length; j++) {
          var imgResult = result.imageResults[j];
          if (imgResult.url) {
            try {
              setProgress('Step 3/5: Downloading image ' + (j + 1) + '/' + result.imageResults.length + '...');
              var imgResp = await fetch(imgResult.url);
              // #region agent log H2 H3
              debugLines.push('  fetch[' + j + '] status=' + imgResp.status + ' ok=' + imgResp.ok);
              // #endregion
              if (imgResp.ok) {
                var buf = await imgResp.arrayBuffer();
                // #region agent log H3
                debugLines.push('  bytes[' + j + '] length=' + buf.byteLength);
                // #endregion
                imagePayloads.push({
                  nodeId: imgResult.nodeId,
                  bytes: Array.from(new Uint8Array(buf)),
                  name: 'variant-image-' + j
                });
              }
            } catch (imgErr) {
              // #region agent log H2
              debugLines.push('  fetchError[' + j + ']: ' + (imgErr.message || imgErr));
              // #endregion
            }
          }
        }
        // #region agent log summary
        debugLines.push('[DEBUG] imagePayloads ready: ' + imagePayloads.length);
        // #endregion

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

        setProgress('Step 5/5: Applying images and copy to variant...\\n' + debugLines.join('\\n'));

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
  <\/script>
</body>
</html>
  `.trim();
  }

  // src/commands/generate.ts
  function runGenerate() {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; background: #1e1e1e; color: #e0e0e0; font-size: 13px; }
    h2 { font-size: 15px; margin: 0 0 12px; color: #fff; }
    textarea { width: 100%; height: 200px; background: #2a2a2a; color: #e0e0e0; border: 1px solid #444; border-radius: 6px; padding: 8px; font-size: 12px; resize: vertical; box-sizing: border-box; }
    .hint { color: #888; font-size: 11px; margin: 8px 0 16px; }
    button { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
    button:hover { background: #4338ca; }
    .status { padding: 8px 12px; background: #2a2a2a; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <h2>Iterator \u2014 Generate from Briefing</h2>
  <textarea id="briefing" placeholder="Paste your creative briefing here, or describe the ad concept..."></textarea>
  <div class="hint">Optionally select reference frames on the canvas before running this command.</div>
  <button id="btn-generate">Generate Ad Concept</button>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    document.getElementById('btn-generate').addEventListener('click', () => {
      const status = document.getElementById('status')
      status.style.display = 'block'
      status.textContent = 'Generation not yet connected. Plugin skeleton is ready.'
    })
  <\/script>
</body>
</html>
  `.trim();
    figma.showUI(html, { width: 420, height: 500 });
  }

  // src/commands/deriveVariants.ts
  function runDeriveVariants() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.closePlugin("Select a master frame to derive variants from.");
      return;
    }
    const frame = selection[0];
    if (frame.type !== "FRAME") {
      figma.closePlugin("Please select a frame.");
      return;
    }
    const ratio = detectRatio(frame.width, frame.height);
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Inter, system-ui, sans-serif; margin: 0; padding: 16px; background: #1e1e1e; color: #e0e0e0; font-size: 13px; }
    h2 { font-size: 15px; margin: 0 0 12px; color: #fff; }
    .meta { color: #888; font-size: 11px; margin-bottom: 16px; }
    .targets { margin: 12px 0; }
    label { display: block; padding: 6px 0; cursor: pointer; }
    input[type="checkbox"] { margin-right: 8px; }
    button { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; margin-top: 12px; }
    button:hover { background: #4338ca; }
    .status { padding: 8px 12px; background: #2a2a2a; border-radius: 6px; margin-top: 12px; }
  </style>
</head>
<body>
  <h2>Iterator \u2014 Derive Variants</h2>
  <div class="meta">Master: ${frame.name} (${Math.round(frame.width)}\xD7${Math.round(frame.height)}, detected ${ratio || "unknown"})</div>
  <div class="targets">
    <label><input type="checkbox" value="9x16" ${ratio !== "9x16" ? "checked" : ""}> 9:16 (1440\xD72560)</label>
    <label><input type="checkbox" value="4x5" ${ratio !== "4x5" ? "checked" : ""}> 4:5 (1440\xD71800)</label>
    <label><input type="checkbox" value="1x1" ${ratio !== "1x1" ? "checked" : ""}> 1:1 (1440\xD71440)</label>
  </div>
  <button id="btn-derive">Derive Selected Variants</button>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    document.getElementById('btn-derive').addEventListener('click', () => {
      const status = document.getElementById('status')
      status.style.display = 'block'
      status.textContent = 'Variant derivation not yet connected. Plugin skeleton is ready.'
    })
  <\/script>
</body>
</html>
  `.trim();
    figma.showUI(html, { width: 420, height: 400 });
  }
  function detectRatio(w, h) {
    const RATIOS = {
      "9x16": { w: 1440, h: 2560 },
      "4x5": { w: 1440, h: 1800 },
      "1x1": { w: 1440, h: 1440 }
    };
    for (const [key, dim] of Object.entries(RATIOS)) {
      if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key;
    }
    return null;
  }

  // code.ts
  var command = figma.command;
  if (command === "iterate") {
    runIterate();
  } else if (command === "generate") {
    runGenerate();
  } else if (command === "derive-variants") {
    runDeriveVariants();
  } else {
    runIterate();
  }
})();
