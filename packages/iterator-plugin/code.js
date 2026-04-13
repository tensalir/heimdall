"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/constants.ts
  var DEFAULT_ITERATOR_API = "https://bifrost-rose.vercel.app";
  function getApiBase() {
    return DEFAULT_ITERATOR_API;
  }
  function getPluginToken() {
    return true ? "58a1bfb45c0020137ee780cafd52f27dc6d9dcada2b69fe44eae5452c9360f37" : "";
  }

  // src/commands/iterate.ts
  function buildImageTransform(rectW, rectH, imgW, imgH, params) {
    const rectAR = rectW / rectH;
    const imgAR = imgW / imgH;
    let baseScaleX;
    let baseScaleY;
    if (imgAR > rectAR) {
      baseScaleY = 1;
      baseScaleX = rectAR / imgAR;
    } else {
      baseScaleX = 1;
      baseScaleY = imgAR / rectAR;
    }
    const zoom = Math.max(0.3, Math.min(1, params.zoom));
    const t = 1 - zoom;
    const sx = baseScaleX + (1 - baseScaleX) * t;
    const sy = baseScaleY + (1 - baseScaleY) * t;
    const tx = (1 - sx) * 0.5 + params.panX * sx;
    const ty = (1 - sy) * 0.5 + params.panY * sy;
    const clampedTx = Math.max(0, Math.min(1 - sx, tx));
    const clampedTy = Math.max(0, Math.min(1 - sy, ty));
    return [[sx, 0, clampedTx], [0, sy, clampedTy]];
  }
  function applyCropToRect(rect, imageHash, rectW, rectH, imgW, imgH, params) {
    const transform = buildImageTransform(rectW, rectH, imgW, imgH, params);
    rect.fills = [{
      type: "IMAGE",
      imageHash,
      scaleMode: "CROP",
      imageTransform: transform
    }];
  }
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
      figma.closePlugin("Select an ad frame (or any element inside one) to create an iteration from.");
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
          const placedRects = [];
          for (const img of images) {
            if (!img.bytes || img.bytes.length === 0) continue;
            const bytes = new Uint8Array(img.bytes);
            try {
              const image = figma.createImage(bytes);
              const imageSize = await image.getSizeAsync();
              const originalNode = await figma.getNodeByIdAsync(img.nodeId);
              if (!originalNode) continue;
              let rectName = originalNode.name;
              if (originalNode.type === "FRAME" && "children" in originalNode) {
                const origRect = originalNode.children.find((c) => c.type === "RECTANGLE");
                if (origRect) rectName = origRect.name;
              }
              const targetRect = findImageRectInClone(variantFrame, rectName);
              if (!targetRect) continue;
              const rw = Math.round(targetRect.width);
              const rh = Math.round(targetRect.height);
              const iw = imageSize.width;
              const ih = imageSize.height;
              const framing = img.framing;
              if (framing && framing.action === "adjust") {
                const zoom = 1 + framing.zoomDelta;
                applyCropToRect(targetRect, image.hash, rw, rh, iw, ih, { zoom, panX: framing.panX, panY: framing.panY });
              } else {
                applyCropToRect(targetRect, image.hash, rw, rh, iw, ih, { zoom: 0.85, panX: 0, panY: 0 });
              }
              const generatedName = `generated-${img.name || "image-" + imagesPlaced}`;
              targetRect.name = generatedName;
              placedRects.push({
                rectId: targetRect.id,
                imageHash: image.hash,
                rectWidth: rw,
                rectHeight: rh,
                imageWidth: iw,
                imageHeight: ih,
                name: generatedName
              });
              imagesPlaced++;
            } catch (e) {
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
          if (placedRects.length > 0) {
            const previews = [];
            for (const pr of placedRects) {
              try {
                const rectNode = await figma.getNodeByIdAsync(pr.rectId);
                if (!rectNode) continue;
                const pngBytes = await rectNode.exportAsync({
                  format: "PNG",
                  constraint: { type: "SCALE", value: 0.5 }
                });
                previews.push(__spreadProps(__spreadValues({}, pr), {
                  previewBytes: Array.from(pngBytes),
                  mimeType: "image/png"
                }));
              } catch (e) {
              }
            }
            const failureSummary = msg.failureSummary || "";
            const totalExpected = msg.totalExpected || images.length;
            figma.ui.postMessage({
              type: "variant-placed",
              cloneId,
              imagesPlaced,
              copyApplied,
              previews,
              failureSummary,
              totalExpected
            });
          } else {
            figma.ui.postMessage({
              type: "status",
              text: "Variant created! " + imagesPlaced + " images replaced, " + copyApplied + " copy changes applied."
            });
          }
        } catch (err) {
          figma.ui.postMessage({
            type: "status",
            text: `Error: ${err.message}`
          });
        }
      }
      if (msg.type === "smart-reframe") {
        try {
          let findAllImageRects3 = function(node) {
            const rects = [];
            if (node.type === "RECTANGLE") {
              const fills = node.fills || [];
              if (fills.length > 0 && fills[0].type === "IMAGE") {
                rects.push(node);
              }
            }
            if ("children" in node) {
              for (const c of node.children) rects.push(...findAllImageRects3(c));
            }
            return rects;
          };
          var findAllImageRects2 = findAllImageRects3;
          const sel = figma.currentPage.selection;
          let variantFrame = null;
          for (const node of sel) {
            if (node.type === "FRAME" && node.name.endsWith("-variant")) {
              variantFrame = node;
              break;
            }
            let parent = node.parent;
            while (parent) {
              if (parent.type === "FRAME" && parent.name.endsWith("-variant")) {
                variantFrame = parent;
                break;
              }
              parent = parent.parent;
            }
            if (variantFrame) break;
          }
          if (!variantFrame) {
            figma.ui.postMessage({ type: "reframe-result", text: "Select a variant frame (or any element inside one) to reframe." });
            return;
          }
          const imageRects = findAllImageRects3(variantFrame);
          if (imageRects.length === 0) {
            figma.ui.postMessage({ type: "reframe-result", text: "No image tiles found in the variant frame." });
            return;
          }
          const previews = [];
          for (const rect of imageRects) {
            try {
              const fills = rect.fills;
              const imageFill = fills.find((f) => f.type === "IMAGE");
              if (!(imageFill == null ? void 0 : imageFill.imageHash)) continue;
              const img = figma.getImageByHash(imageFill.imageHash);
              if (!img) continue;
              const imgSize = await img.getSizeAsync();
              const pngBytes = await rect.exportAsync({
                format: "PNG",
                constraint: { type: "SCALE", value: 0.5 }
              });
              const sourceImageBytes = await img.getBytesAsync();
              previews.push({
                rectId: rect.id,
                imageHash: imageFill.imageHash,
                rectWidth: Math.round(rect.width),
                rectHeight: Math.round(rect.height),
                imageWidth: imgSize.width,
                imageHeight: imgSize.height,
                previewBytes: Array.from(pngBytes),
                sourceBytes: Array.from(sourceImageBytes),
                mimeType: "image/png"
              });
            } catch (e) {
            }
          }
          figma.ui.postMessage({ type: "reframe-previews", previews });
        } catch (err) {
          figma.ui.postMessage({ type: "reframe-result", text: "Error discovering tiles: " + err.message });
        }
      }
      if (msg.type === "apply-smart-reframe") {
        try {
          const adjustments = msg.adjustments || [];
          const doConfirm = msg.confirmPass === true;
          let adjusted = 0;
          for (const adj of adjustments) {
            const node = await figma.getNodeByIdAsync(adj.rectId);
            if (!node || node.type !== "RECTANGLE") continue;
            const zoom = 1 + adj.zoomDelta;
            applyCropToRect(
              node,
              adj.imageHash,
              adj.rectWidth,
              adj.rectHeight,
              adj.imageWidth,
              adj.imageHeight,
              { zoom, panX: adj.panX, panY: adj.panY }
            );
            adjusted++;
          }
          if (adjusted > 0 && doConfirm) {
            const confirmPreviews = [];
            for (const adj of adjustments) {
              try {
                const node = await figma.getNodeByIdAsync(adj.rectId);
                if (!node || node.type !== "RECTANGLE") continue;
                const pngBytes = await node.exportAsync({
                  format: "PNG",
                  constraint: { type: "SCALE", value: 0.5 }
                });
                confirmPreviews.push({
                  rectId: adj.rectId,
                  imageHash: adj.imageHash,
                  rectWidth: adj.rectWidth,
                  rectHeight: adj.rectHeight,
                  imageWidth: adj.imageWidth,
                  imageHeight: adj.imageHeight,
                  previewBytes: Array.from(pngBytes),
                  mimeType: "image/png"
                });
              } catch (e) {
              }
            }
            if (confirmPreviews.length > 0) {
              figma.ui.postMessage({
                type: "reframe-confirm",
                adjusted,
                previews: confirmPreviews
              });
              return;
            }
          }
          figma.ui.postMessage({
            type: "reframe-result",
            text: adjusted > 0 ? "Reframed " + adjusted + " image(s) for better face visibility." : "No adjustments applied."
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "reframe-result",
            text: "Error applying reframe: " + err.message
          });
        }
      }
      if (msg.type === "apply-crop-adjustments") {
        try {
          const adjustments = msg.adjustments || [];
          let adjusted = 0;
          for (const adj of adjustments) {
            const node = await figma.getNodeByIdAsync(adj.rectId);
            if (!node || node.type !== "RECTANGLE") continue;
            const zoom = 1 + adj.zoomDelta;
            applyCropToRect(
              node,
              adj.imageHash,
              adj.rectWidth,
              adj.rectHeight,
              adj.imageWidth,
              adj.imageHeight,
              { zoom, panX: adj.panX, panY: adj.panY }
            );
            adjusted++;
          }
          figma.ui.postMessage({
            type: "status",
            text: adjusted > 0 ? `Variant created! Auto-adjusted framing on ${adjusted} image(s).` : "Variant created! Images placed without crop adjustment."
          });
        } catch (err) {
          figma.ui.postMessage({
            type: "status",
            text: `Error applying crop adjustments: ${err.message}`
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
      if (node.type === "FRAME" && node.name === targetName) {
        for (const child of node.children) {
          if (child.type === "RECTANGLE") {
            found = child;
            return;
          }
        }
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
    .btn-secondary { background: #2a2a2a; border: 1px solid #4f46e5; margin-top: 8px; }
    .btn-secondary:hover { background: #333; }
    .layers { max-height: 200px; overflow-y: auto; margin: 8px 0; }
    .layer { padding: 4px 8px; background: #2a2a2a; border-radius: 4px; margin: 2px 0; font-size: 11px; display: flex; justify-content: space-between; }
    .layer-type { color: #888; }
    .progress { margin-top: 8px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <h2>Iterator \u2014 Create Iteration</h2>
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
          el.textContent = 'No adjustments needed \u2014 framing looks good.';
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
  var CANONICAL_SIZES = {
    "9x16": { w: 1440, h: 2560 },
    "4x5": { w: 1440, h: 1800 },
    "1x1": { w: 1440, h: 1440 }
  };
  var PLACEMENT_GAP = 80;
  function detectRatio(w, h) {
    for (const [key, dim] of Object.entries(CANONICAL_SIZES)) {
      if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key;
    }
    return null;
  }
  function runDeriveVariants() {
    const selection = figma.currentPage.selection;
    if (selection.length === 0) {
      figma.closePlugin("Select a master frame to resize into other formats.");
      return;
    }
    const frame = selection[0];
    if (frame.type !== "FRAME") {
      figma.closePlugin("Please select a frame.");
      return;
    }
    const sourceFrame = frame;
    if (hasNestedDerivedFrames(sourceFrame)) {
      figma.closePlugin(
        "This frame already contains derived format frames inside it. Select the original master frame instead."
      );
      return;
    }
    const sourceRatio = detectRatio(frame.width, frame.height);
    const fileKey = figma.fileKey || "";
    const html = buildUI2(frame, sourceRatio);
    figma.showUI(html, { width: 440, height: 520 });
    figma.ui.onmessage = async (msg) => {
      if (msg.type === "ready") {
        const layerSummary = extractLayerSummary2(sourceFrame);
        figma.ui.postMessage({ type: "frame-data", data: layerSummary });
      }
      if (msg.type === "start-derive") {
        const targetRatios = msg.targetRatios;
        await handleDerive(sourceFrame, targetRatios, fileKey);
      }
      if (msg.type === "apply-crop-adjustments") {
        const adjustments = msg.adjustments || [];
        let adjusted = 0;
        for (const adj of adjustments) {
          const node = await figma.getNodeByIdAsync(adj.rectId);
          if (!node || node.type !== "RECTANGLE") continue;
          applyCropToRect2(
            node,
            adj.imageHash,
            adj.rectWidth,
            adj.rectHeight,
            adj.imageWidth,
            adj.imageHeight,
            { zoom: 1 + adj.zoomDelta, panX: adj.panX, panY: adj.panY }
          );
          adjusted++;
        }
        figma.ui.postMessage({
          type: "status",
          text: adjusted > 0 ? `Adjusted framing on ${adjusted} image(s).` : "No framing adjustments needed."
        });
      }
    };
  }
  async function handleDerive(sourceFrame, targetRatios, fileKey) {
    const apiBase = getApiBase();
    const token = getPluginToken();
    const sourceLayerData = extractLayerSummary2(sourceFrame);
    const srcW = Math.round(sourceFrame.width);
    const srcH = Math.round(sourceFrame.height);
    const sourceRatio = detectRatio(srcW, srcH);
    let placementCursorX = sourceFrame.x + sourceFrame.width + PLACEMENT_GAP;
    for (let i = 0; i < targetRatios.length; i++) {
      const ratio = targetRatios[i];
      const target = CANONICAL_SIZES[ratio];
      if (!target) continue;
      figma.ui.postMessage({ type: "progress", text: `Resizing to ${ratio} (${i + 1}/${targetRatios.length})...`, step: "cloning" });
      const clone = sourceFrame.clone();
      clone.name = sourceFrame.name.replace(/\d+x\d+/, ratio) + (sourceFrame.name.includes(ratio) ? "" : `-${ratio}`);
      clone.resize(target.w, target.h);
      forceBackgroundCoverage(clone, target.w, target.h);
      applyContentBaseline(clone, srcW, srcH, target.w, target.h);
      await reflowAllText(clone, srcW, srcH, target.w, target.h);
      removeNestedDerivedFrames(clone);
      figma.ui.postMessage({ type: "progress", text: `Planning layout for ${ratio}...`, step: "planning" });
      let editPlan = null;
      try {
        const resp = await fetch(`${apiBase}/api/plugin/iterator/derive`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Heimdall-Plugin-Token": token },
          body: JSON.stringify({
            sourceFileKey: fileKey,
            sourceFrameId: sourceFrame.id,
            targetRatios: [ratio],
            sourceLayerData,
            sourceWidth: srcW,
            sourceHeight: srcH,
            sourceRatio: sourceRatio || void 0
          })
        });
        if (resp.ok) {
          const result = await resp.json();
          editPlan = result.editPlan || null;
        }
      } catch (e) {
      }
      if (editPlan && editPlan.steps && editPlan.steps.length > 0) {
        figma.ui.postMessage({ type: "progress", text: `Applying layout for ${ratio}...`, step: "applying" });
        await applyEditPlan(clone, editPlan.steps, target.w, target.h);
      }
      figma.ui.postMessage({ type: "progress", text: `Running QA on ${ratio}...`, step: "qa" });
      let qaResult = runFullSubtreeQA(clone, target.w, target.h);
      if (qaResult.issues.length > 0) {
        applyQAFixes(clone, qaResult, target.w, target.h);
      }
      const imageRects = findAllImageRects(clone);
      if (imageRects.length > 0) {
        figma.ui.postMessage({ type: "progress", text: `Reviewing ${imageRects.length} image(s) in ${ratio}...`, step: "image-review" });
        await reviewAndFixImageFraming(imageRects, apiBase, token);
      }
      qaResult = runFullSubtreeQA(clone, target.w, target.h);
      if (qaResult.issues.length > 0) {
        applyQAFixes(clone, qaResult, target.w, target.h);
      }
      placementCursorX = placeCloneWithoutOverlap(clone, sourceFrame, placementCursorX);
      figma.currentPage.selection = [clone];
      figma.viewport.scrollAndZoomIntoView([clone]);
      figma.ui.postMessage({
        type: "ratio-complete",
        ratio,
        qaResult: {
          total: qaResult.issues.length,
          clippedTexts: qaResult.issues.filter((i2) => i2.type === "text-clip").length,
          overlaps: qaResult.issues.filter((i2) => i2.type === "overlap").length,
          edgeViolations: qaResult.issues.filter((i2) => i2.type === "edge").length,
          storyOcclusionWarnings: qaResult.issues.filter((i2) => i2.type === "occlusion").length
        }
      });
    }
    figma.ui.postMessage({ type: "derive-complete", count: targetRatios.length });
  }
  function placeCloneWithoutOverlap(clone, source, cursorX) {
    const page = figma.currentPage;
    const cloneW = Math.round(clone.width);
    const cloneH = Math.round(clone.height);
    const sourceY = source.y;
    const obstacles = [];
    for (const child of page.children) {
      if (child.id === clone.id) continue;
      if (child.type !== "FRAME" && child.type !== "COMPONENT" && child.type !== "SECTION") continue;
      obstacles.push({ x: child.x, y: child.y, w: Math.round(child.width), h: Math.round(child.height) });
    }
    let candidateX = cursorX;
    const candidateY = sourceY;
    let attempts = 0;
    const maxAttempts = 50;
    while (attempts < maxAttempts) {
      const candidate = { x: candidateX, y: candidateY, w: cloneW, h: cloneH };
      const hit = obstacles.find((o) => rectsIntersect(candidate, o));
      if (!hit) break;
      candidateX = hit.x + hit.w + PLACEMENT_GAP;
      attempts++;
    }
    clone.x = candidateX;
    clone.y = candidateY;
    return candidateX + cloneW + PLACEMENT_GAP;
  }
  function rectsIntersect(a, b) {
    return !(a.x >= b.x + b.w || b.x >= a.x + a.w || a.y >= b.y + b.h || b.y >= a.y + a.h);
  }
  function forceBackgroundCoverage(frame, frameW, frameH) {
    for (const child of frame.children) {
      const isBgCandidate = (child.type === "RECTANGLE" || child.type === "FRAME") && child.width >= frameW * 0.5 && child.height >= frameH * 0.3;
      if (!isBgCandidate) continue;
      child.x = 0;
      child.y = 0;
      if ("resize" in child) {
        child.resize(frameW, frameH);
      }
      if (child.type === "RECTANGLE") {
        const fills = child.fills || [];
        const imgFill = fills.find((f) => f.type === "IMAGE");
        if (imgFill == null ? void 0 : imgFill.imageHash) {
          child.fills = [{
            type: "IMAGE",
            imageHash: imgFill.imageHash,
            scaleMode: "FILL"
          }];
        }
      }
      break;
    }
  }
  function applyContentBaseline(frame, srcW, srcH, tgtW, tgtH) {
    const scaleX = tgtW / srcW;
    const scaleY = tgtH / srcH;
    for (const child of frame.children) {
      if (isBackgroundLayer(child, tgtW, tgtH)) continue;
      scaleContentNode(child, scaleX, scaleY, tgtW, tgtH);
    }
  }
  function isBackgroundLayer(node, frameW, frameH) {
    return (node.type === "RECTANGLE" || node.type === "FRAME") && node.width >= frameW * 0.9 && node.height >= frameH * 0.9;
  }
  function scaleContentNode(node, scaleX, scaleY, parentW, parentH) {
    node.x = Math.round(node.x * scaleX);
    node.y = Math.round(node.y * scaleY);
    if (node.type === "TEXT") return;
    if ("resize" in node) {
      const newW = Math.max(1, Math.round(node.width * scaleX));
      const newH = Math.max(1, Math.round(node.height * scaleY));
      node.resize(newW, newH);
    }
    if (node.x + node.width > parentW) {
      node.x = Math.max(0, parentW - node.width);
    }
    if (node.y + node.height > parentH) {
      node.y = Math.max(0, parentH - node.height);
    }
    if ("children" in node && node.type !== "INSTANCE") {
      const childFrame = node;
      const innerScaleX = childFrame.width > 0 ? childFrame.width / (childFrame.width / scaleX) : 1;
      const innerScaleY = childFrame.height > 0 ? childFrame.height / (childFrame.height / scaleY) : 1;
      for (const child of childFrame.children) {
        scaleContentNode(child, innerScaleX, innerScaleY, childFrame.width, childFrame.height);
      }
    }
  }
  async function reflowAllText(frame, srcW, srcH, tgtW, tgtH) {
    const fontScale = Math.min(tgtW / srcW, tgtH / srcH);
    const allText = findAllTextNodes(frame);
    for (const textNode of allText) {
      try {
        const fontName = textNode.fontName;
        if (fontName !== figma.mixed) {
          await figma.loadFontAsync(fontName);
        }
        if (fontScale < 0.85 && textNode.fontSize !== figma.mixed) {
          const currentSize = textNode.fontSize;
          const newSize = Math.max(12, Math.round(currentSize * fontScale));
          if (newSize < currentSize) {
            textNode.fontSize = newSize;
          }
        }
        textNode.textAutoResize = "HEIGHT";
        const maxWidth = tgtW * 0.88;
        if (textNode.width > maxWidth) {
          textNode.resize(Math.round(maxWidth), textNode.height);
        }
      } catch (e) {
      }
    }
  }
  function findAllTextNodes(node) {
    const result = [];
    if (node.type === "TEXT") result.push(node);
    if ("children" in node) {
      for (const child of node.children) {
        result.push(...findAllTextNodes(child));
      }
    }
    return result;
  }
  var SAFE_ZONES = {
    "9x16": { top: 240, bottom: 492, side: 80 },
    "4x5": { top: 180, bottom: 180, side: 80 },
    "1x1": { top: 144, bottom: 144, side: 80 }
  };
  function runFullSubtreeQA(frame, frameW, frameH) {
    const issues = [];
    const ratio = detectRatio(frameW, frameH);
    const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 };
    const allText = findAllTextNodes(frame);
    for (const t of allText) {
      const absY = getAbsoluteY(t, frame);
      const absX = getAbsoluteX(t, frame);
      if (absY + t.height > frameH + 2) {
        issues.push({ type: "text-clip", id: t.id, name: t.name, detail: `vertical overflow by ${Math.round(absY + t.height - frameH)}px` });
      }
      if (absX + t.width > frameW + 2) {
        issues.push({ type: "text-hclip", id: t.id, name: t.name, detail: `horizontal overflow by ${Math.round(absX + t.width - frameW)}px` });
      }
    }
    const contentChildren = [];
    for (const child of frame.children) {
      if (!isBackgroundLayer(child, frameW, frameH)) {
        contentChildren.push(child);
      }
    }
    for (let i = 0; i < contentChildren.length; i++) {
      for (let j = i + 1; j < contentChildren.length; j++) {
        const a = contentChildren[i], b = contentChildren[j];
        if (!(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y)) {
          issues.push({ type: "overlap", id: a.id, name: `${a.name} x ${b.name}`, detail: "content overlap" });
        }
      }
    }
    for (const child of contentChildren) {
      if (child.x < safeZone.side) issues.push({ type: "edge", id: child.id, name: child.name, detail: "left" });
      if (child.y < safeZone.top) issues.push({ type: "edge", id: child.id, name: child.name, detail: "top" });
      if (child.x + child.width > frameW - safeZone.side) issues.push({ type: "edge", id: child.id, name: child.name, detail: "right" });
      if (child.y + child.height > frameH - safeZone.bottom) issues.push({ type: "edge", id: child.id, name: child.name, detail: "bottom" });
    }
    let hasBg = false;
    for (const child of frame.children) {
      if (isBackgroundLayer(child, frameW, frameH)) {
        hasBg = true;
        break;
      }
    }
    if (!hasBg) {
      issues.push({ type: "bg-gap", id: frame.id, name: frame.name, detail: "no full-bleed background detected" });
    }
    for (const child of contentChildren) {
      if (child.type === "FRAME") {
        const coverageRatio = child.width * child.height / (frameW * frameH);
        if (coverageRatio > 0.15 && child.y / frameH < 0.4) {
          issues.push({ type: "occlusion", id: child.id, name: child.name, detail: `${Math.round(coverageRatio * 100)}% coverage in upper zone` });
        }
      }
    }
    return { issues };
  }
  function getAbsoluteY(node, ancestor) {
    let y = node.y;
    let current = node.parent;
    while (current && current.id !== ancestor.id) {
      if ("y" in current) y += current.y;
      current = current.parent;
    }
    return y;
  }
  function getAbsoluteX(node, ancestor) {
    let x = node.x;
    let current = node.parent;
    while (current && current.id !== ancestor.id) {
      if ("x" in current) x += current.x;
      current = current.parent;
    }
    return x;
  }
  function applyQAFixes(frame, qa, frameW, frameH) {
    const ratio = detectRatio(frameW, frameH);
    const safeZone = ratio ? SAFE_ZONES[ratio] : { top: frameH * 0.1, bottom: frameH * 0.1, side: frameW * 0.04 };
    for (const issue of qa.issues) {
      if (issue.type === "text-clip" || issue.type === "text-hclip") {
        const node = frame.findOne((n) => n.id === issue.id);
        if (node && node.type === "TEXT") {
          node.textAutoResize = "HEIGHT";
          if (node.width > frameW * 0.9) {
            node.resize(Math.round(frameW * 0.85), node.height);
          }
          const absY = getAbsoluteY(node, frame);
          if (absY + node.height > frameH - safeZone.bottom) {
            node.y = Math.max(0, node.y - (absY + node.height - (frameH - safeZone.bottom)));
          }
        }
      }
      if (issue.type === "edge") {
        const node = frame.findOne((n) => n.id === issue.id);
        if (!node) continue;
        if (issue.detail === "left" && node.x < safeZone.side) node.x = safeZone.side;
        if (issue.detail === "right" && node.x + node.width > frameW - safeZone.side) {
          node.x = Math.max(safeZone.side, frameW - safeZone.side - node.width);
        }
        if (issue.detail === "top" && node.y < safeZone.top) node.y = safeZone.top;
        if (issue.detail === "bottom" && node.y + node.height > frameH - safeZone.bottom) {
          node.y = Math.max(safeZone.top, frameH - safeZone.bottom - node.height);
        }
      }
    }
  }
  function hasNestedDerivedFrames(frame) {
    const parentRatio = detectRatio(frame.width, frame.height);
    for (const child of frame.children) {
      if (child.type === "FRAME") {
        const childRatio = detectRatio(child.width, child.height);
        if (childRatio && childRatio !== parentRatio) return true;
      }
    }
    return false;
  }
  function removeNestedDerivedFrames(frame) {
    const parentRatio = detectRatio(frame.width, frame.height);
    const toRemove = [];
    for (const child of frame.children) {
      if (child.type === "FRAME") {
        const childRatio = detectRatio(child.width, child.height);
        if (childRatio && childRatio !== parentRatio) toRemove.push(child);
      }
    }
    for (const node of toRemove) node.remove();
  }
  async function applyEditPlan(frame, steps, tgtW, tgtH) {
    for (const step of steps) {
      let node = null;
      if (step.targetNodeId) {
        const byId = await figma.getNodeByIdAsync(step.targetNodeId);
        if (byId && isDescendantOf(byId, frame)) node = byId;
      }
      if (!node && step.targetNodeName) node = findNodeByName(frame, step.targetNodeName);
      if (!node) continue;
      switch (step.action) {
        case "move": {
          const dx = Number(step.params.dx || 0), dy = Number(step.params.dy || 0);
          const x = step.params.x, y = step.params.y;
          if (x !== void 0) node.x = x;
          else node.x = node.x + dx;
          if (y !== void 0) node.y = y;
          else node.y = node.y + dy;
          break;
        }
        case "scale": {
          const factor = Number(step.params.factor || 1);
          const fx = Number(step.params.factorX || factor), fy = Number(step.params.factorY || factor);
          if ("resize" in node) node.resize(Math.round(node.width * fx), Math.round(node.height * fy));
          break;
        }
        case "reflow": {
          if (node.type === "TEXT") {
            try {
              await figma.loadFontAsync(node.fontName);
              node.textAutoResize = "HEIGHT";
              const maxWidth = Number(step.params.maxWidth || tgtW * 0.85);
              if (node.width > maxWidth) node.resize(maxWidth, node.height);
              const fontSize = step.params.fontSize;
              if (fontSize) node.fontSize = fontSize;
            } catch (e) {
            }
          }
          break;
        }
        case "crop-shift": {
          if (node.type === "RECTANGLE") {
            const fills = node.fills || [];
            const imgFill = fills.find((f) => f.type === "IMAGE");
            if (imgFill == null ? void 0 : imgFill.imageHash) {
              const img = figma.getImageByHash(imgFill.imageHash);
              if (img) {
                const imgSize = await img.getSizeAsync();
                applyCropToRect2(
                  node,
                  imgFill.imageHash,
                  Math.round(node.width),
                  Math.round(node.height),
                  imgSize.width,
                  imgSize.height,
                  { zoom: Number(step.params.zoom || 0.85), panX: Number(step.params.panX || 0), panY: Number(step.params.panY || 0) }
                );
              }
            }
          }
          break;
        }
        default:
          break;
      }
    }
  }
  function isDescendantOf(node, ancestor) {
    let current = node;
    while (current) {
      if (current.id === ancestor.id) return true;
      current = current.parent;
    }
    return false;
  }
  function findAllImageRects(node) {
    const rects = [];
    if (node.type === "RECTANGLE") {
      const fills = node.fills || [];
      if (fills.length > 0 && fills[0].type === "IMAGE") rects.push(node);
    }
    if ("children" in node) {
      for (const c of node.children) rects.push(...findAllImageRects(c));
    }
    return rects;
  }
  async function reviewAndFixImageFraming(imageRects, apiBase, token) {
    for (const rect of imageRects) {
      try {
        const fills = rect.fills;
        const imageFill = fills.find((f) => f.type === "IMAGE");
        if (!(imageFill == null ? void 0 : imageFill.imageHash)) continue;
        const img = figma.getImageByHash(imageFill.imageHash);
        if (!img) continue;
        const imgSize = await img.getSizeAsync();
        const pngBytes = await rect.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 0.5 } });
        const base64 = bytesToBase64(Array.from(pngBytes));
        const resp = await fetch(`${apiBase}/api/plugin/iterator/review-placement`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Heimdall-Plugin-Token": token },
          body: JSON.stringify({
            previewImageBase64: base64,
            mimeType: "image/png",
            rectWidth: Math.round(rect.width),
            rectHeight: Math.round(rect.height),
            imageWidth: imgSize.width,
            imageHeight: imgSize.height,
            context: "This image was resized as part of a format derivation. Check if the crop still shows the subject well."
          })
        });
        if (resp.ok) {
          const result = await resp.json();
          if (result.action === "adjust" && (result.confidence === "high" || result.confidence === "medium")) {
            applyCropToRect2(
              rect,
              imageFill.imageHash,
              Math.round(rect.width),
              Math.round(rect.height),
              imgSize.width,
              imgSize.height,
              { zoom: 1 + result.zoomDelta, panX: result.panX, panY: result.panY }
            );
          }
        }
      } catch (e) {
      }
    }
  }
  function buildImageTransform2(rectW, rectH, imgW, imgH, params) {
    const rectAR = rectW / rectH, imgAR = imgW / imgH;
    let bsx, bsy;
    if (imgAR > rectAR) {
      bsy = 1;
      bsx = rectAR / imgAR;
    } else {
      bsx = 1;
      bsy = imgAR / rectAR;
    }
    const zoom = Math.max(0.3, Math.min(1, params.zoom));
    const t = 1 - zoom;
    const sx = bsx + (1 - bsx) * t, sy = bsy + (1 - bsy) * t;
    const tx = Math.max(0, Math.min(1 - sx, (1 - sx) * 0.5 + params.panX * sx));
    const ty = Math.max(0, Math.min(1 - sy, (1 - sy) * 0.5 + params.panY * sy));
    return [[sx, 0, tx], [0, sy, ty]];
  }
  function applyCropToRect2(rect, imageHash, rectW, rectH, imgW, imgH, params) {
    rect.fills = [{ type: "IMAGE", imageHash, scaleMode: "CROP", imageTransform: buildImageTransform2(rectW, rectH, imgW, imgH, params) }];
  }
  function findNodeByName(root, name) {
    let found = null;
    function walk(node) {
      if (found) return;
      if (node.name === name) {
        found = node;
        return;
      }
      if ("children" in node) {
        for (const child of node.children) walk(child);
      }
    }
    walk(root);
    return found;
  }
  function extractLayerSummary2(frame) {
    function mapNode(c) {
      const n = {
        id: c.id,
        name: c.name,
        type: c.type,
        x: Math.round(c.x),
        y: Math.round(c.y),
        width: Math.round(c.width),
        height: Math.round(c.height),
        visible: c.visible !== false
      };
      if (c.type === "TEXT") {
        n.characters = c.characters;
        n.fontSize = c.fontSize;
      }
      if ("children" in c && c.children.length > 0) n.children = c.children.map(mapNode);
      if (c.type === "RECTANGLE") {
        const fills = c.fills || [];
        if (fills.length > 0 && fills[0].type === "IMAGE") n.hasImage = true;
      }
      return n;
    }
    return { id: frame.id, name: frame.name, width: Math.round(frame.width), height: Math.round(frame.height), childCount: frame.children.length, children: frame.children.map(mapNode) };
  }
  function bytesToBase64(byteArray) {
    let raw = "";
    for (let ci = 0; ci < byteArray.length; ci += 8192) {
      raw += String.fromCharCode.apply(null, byteArray.slice(ci, ci + 8192));
    }
    return btoa(raw);
  }
  function buildUI2(frame, sourceRatio) {
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
  <h2>Iterator \u2014 Resize / Derive Formats</h2>
  <div class="meta">Master: ${frame.name} (${Math.round(frame.width)}\xD7${Math.round(frame.height)}, detected ${sourceRatio || "unknown"})</div>
  <div class="targets">
    <label ${sourceRatio === "9x16" ? 'class="disabled"' : ""}><input type="checkbox" value="9x16" ${sourceRatio === "9x16" ? "disabled" : "checked"}> 9:16 (1440\xD72560)${sourceRatio === "9x16" ? " \u2014 source" : ""}</label>
    <label ${sourceRatio === "4x5" ? 'class="disabled"' : ""}><input type="checkbox" value="4x5" ${sourceRatio === "4x5" ? "disabled" : "checked"}> 4:5 (1440\xD71800)${sourceRatio === "4x5" ? " \u2014 source" : ""}</label>
    <label ${sourceRatio === "1x1" ? 'class="disabled"' : ""}><input type="checkbox" value="1x1" ${sourceRatio === "1x1" ? "disabled" : "checked"}> 1:1 (1440\xD71440)${sourceRatio === "1x1" ? " \u2014 source" : ""}</label>
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
        var lines = ['\u2014 ' + msg.ratio + ': ' + qa.total + ' issue(s)'];
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
  <\/script>
</body>
</html>
  `.trim();
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
