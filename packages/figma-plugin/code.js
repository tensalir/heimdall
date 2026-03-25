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
  var DEFAULT_HEIMDALL_API = "https://bifrost-rose.vercel.app";
  var DEFAULT_PLUGIN_TOKEN = "aefd1d4c24c0af7139ee2f2338926f9459aa40d33209fef9c8edf52d83f41575";
  var DEFAULT_VERCEL_BYPASS = "0MtafaprhUZvqLK754AGoKpaNpnIz3yK";

  // src/commands/exportComments.ts
  var commentsUiHtml = `<html><head><style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:Inter,-apple-system,system-ui,sans-serif;background:#1e1e1e;color:#e0e0e0;overflow:hidden;height:100vh;display:flex;flex-direction:column;}
.header{padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #333;flex-shrink:0;}
.header .logo{font-size:13px;font-weight:700;letter-spacing:1.5px;color:#fff;text-transform:uppercase;}
.header .logo span{opacity:0.4;font-weight:400;margin-left:4px;font-size:10px;letter-spacing:0;}
.toolbar{padding:10px 16px;display:flex;gap:8px;align-items:center;border-bottom:1px solid #2a2a2a;flex-shrink:0;}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:6px 12px;border-radius:5px;font-size:10px;font-weight:500;cursor:pointer;border:none;transition:all 0.15s;}
.btn:disabled{opacity:0.35;cursor:not-allowed;}
.btn-primary{background:#3b82f6;color:#fff;}
.btn-primary:hover:not(:disabled){background:#2563eb;}
.btn-outline{background:transparent;border:1px solid #444;color:#ccc;}
.btn-outline:hover:not(:disabled){border-color:#666;background:rgba(255,255,255,0.05);}
.btn-sm{padding:4px 8px;font-size:9px;}
.filter-row{display:flex;gap:6px;align-items:center;}
.filter-label{font-size:9px;color:#666;}
.filter-select{padding:3px 6px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:4px;color:#ddd;font-size:9px;font-family:inherit;outline:none;}
.stats{font-size:9px;color:#666;margin-left:auto;white-space:nowrap;}
.content{flex:1;overflow-y:auto;padding:0;}
.status-bar{padding:8px 16px;font-size:10px;color:#888;min-height:20px;line-height:1.4;flex-shrink:0;}
.status-bar.err{color:#f24822;}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:#666;}
.empty-icon{font-size:28px;margin-bottom:8px;opacity:0.4;}
.empty-title{font-size:12px;font-weight:600;margin-bottom:4px;color:#888;}
.empty-desc{font-size:10px;line-height:1.4;max-width:260px;}
.comment-list{padding:0;}
.comment-item{padding:10px 16px;border-bottom:1px solid #2a2a2a;transition:background 0.1s;}
.comment-item:hover{background:rgba(255,255,255,0.02);}
.comment-item.reply{padding-left:32px;border-left:2px solid #333;margin-left:16px;}
.comment-meta{display:flex;align-items:center;gap:6px;margin-bottom:4px;}
.comment-author{font-size:10px;font-weight:600;color:#ddd;}
.comment-time{font-size:9px;color:#555;}
.comment-badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:8px;font-weight:500;margin-left:4px;}
.badge-open{background:rgba(59,130,246,0.15);color:#60a5fa;}
.badge-resolved{background:rgba(34,197,94,0.12);color:#4ade80;}
.comment-order{font-size:9px;color:#555;font-weight:500;}
.comment-text{font-size:10px;line-height:1.5;color:#bbb;word-break:break-word;white-space:pre-wrap;}
.comment-node{font-size:8px;color:#555;margin-top:3px;}
.footer{flex-shrink:0;padding:8px 16px;border-top:1px solid #333;display:flex;align-items:center;gap:6px;}
.field-label{font-size:10px;color:#666;min-width:50px;flex-shrink:0;}
.field-input{flex:1;padding:6px 8px;background:#2a2a2a;border:1px solid #3a3a3a;border-radius:5px;color:#ddd;font-size:10px;font-family:inherit;outline:none;transition:border-color 0.15s;}
.field-input:focus{border-color:#555;}
</style></head><body>

<div class="header">
  <div class="logo">Heimdall <span>Comments</span></div>
</div>

<div class="toolbar">
  <button class="btn btn-primary" id="fetch-btn">Load Comments</button>
  <div class="filter-row">
    <span class="filter-label">Show:</span>
    <select class="filter-select" id="status-filter">
      <option value="all">All</option>
      <option value="open">Open</option>
      <option value="resolved">Resolved</option>
    </select>
  </div>
  <span class="stats" id="stats"></span>
  <button class="btn btn-outline btn-sm" id="copy-btn" disabled>Copy CSV</button>
  <button class="btn btn-outline btn-sm" id="download-btn" disabled>Download</button>
  <button class="btn btn-outline btn-sm" id="open-sheet-btn" disabled style="border-color:#555;color:#adf7b6;">Open Sheet</button>
</div>

<div class="content" id="content">
  <div class="empty">
    <div class="empty-icon">&#128172;</div>
    <div class="empty-title">No comments loaded</div>
    <div class="empty-desc">Click "Load Comments" to fetch all comments from this Figma file via the Heimdall backend.</div>
  </div>
</div>

<div id="status" class="status-bar">Ready.</div>

<div class="footer">
  <span class="field-label">API</span>
  <input id="api-base" class="field-input" placeholder="${DEFAULT_HEIMDALL_API}" style="font-size:9px;" />
  <button class="btn btn-outline btn-sm" id="save-api">Save</button>
</div>

<script>
parent.postMessage({ pluginMessage: { type: "get-api-base" } }, "*");
parent.postMessage({ pluginMessage: { type: "get-file-key" } }, "*");

var DEFAULT_HEIMDALL_API = ${JSON.stringify(DEFAULT_HEIMDALL_API)};
var HEIMDALL_API = DEFAULT_HEIMDALL_API;
var VERCEL_BYPASS = ${JSON.stringify(DEFAULT_VERCEL_BYPASS)};
function setVercelBypass(v) { VERCEL_BYPASS = (v || "").trim() || ${JSON.stringify(DEFAULT_VERCEL_BYPASS)}; }
function stampUrl(url) {
  if (!VERCEL_BYPASS) return url;
  var sep = url.indexOf("?") >= 0 ? "&" : "?";
  return url + sep + "x-vercel-protection-bypass=" + encodeURIComponent(VERCEL_BYPASS);
}
var fileKey = "";
var allComments = [];
var loading = false;

function setStatus(text, isErr) {
  var el = document.getElementById("status");
  el.textContent = text;
  el.className = isErr ? "status-bar err" : "status-bar";
}

function sanitizeApiBase(raw) {
  var v = (raw || "").trim();
  if (!v) return DEFAULT_HEIMDALL_API;
  return v.replace(/\\/$/, "");
}
function setApiBase(raw) {
  HEIMDALL_API = sanitizeApiBase(raw);
  var input = document.getElementById("api-base");
  if (input) input.value = HEIMDALL_API;
}

document.getElementById("save-api").onclick = function() {
  var input = document.getElementById("api-base");
  setApiBase(input ? input.value : "");
  parent.postMessage({ pluginMessage: { type: "save-api-base", apiBase: HEIMDALL_API } }, "*");
};

document.getElementById("fetch-btn").onclick = function() {
  if (loading) return;
  if (!fileKey) {
    parent.postMessage({ pluginMessage: { type: "get-file-key" } }, "*");
    setStatus("Requesting file key...", false);
    setTimeout(function() {
      if (fileKey) fetchComments();
      else setStatus("Could not get file key. Save your file first.", true);
    }, 500);
    return;
  }
  fetchComments();
};

function hintForHttpStatus(status) {
  if (status === 401) return " Often Vercel Deployment Protection or login wall (plugin cannot use browser session).";
  if (status === 403) return " Forbidden: /api/comments may require staff login; open Heimdall in a browser while signed in, or use an API path your org exposes to the plugin.";
  if (status === 503) return " Server misconfiguration.";
  return "";
}

function fetchComments() {
  if (!fileKey) { setStatus("No file key available.", true); return; }
  loading = true;
  setStatus("Fetching comments for " + fileKey + "...", false);
  document.getElementById("fetch-btn").disabled = true;
  var url = stampUrl(HEIMDALL_API + "/api/comments?fileKey=" + encodeURIComponent(fileKey));
  fetch(url)
    .then(function(r) {
      var status = r.status;
      var ct = (r.headers.get("content-type") || "").toLowerCase();
      return r.text().then(function(t) {
        var raw = t || "";
        var parsed = null;
        if (raw) { try { parsed = JSON.parse(raw); } catch (_) { parsed = null; } }
        if (!r.ok) {
          var err = parsed && (parsed.error || parsed.reason) ? (parsed.error || parsed.reason) : ("HTTP " + status);
          err += hintForHttpStatus(status);
          throw new Error(err + " @ " + url);
        }
        if (parsed === null) {
          var preview = raw.slice(0, 80).replace(/\\s+/g, " ");
          var htmlHint = /<\\s*html/i.test(raw) ? " (HTML body \u2014 wrong host or auth page?)" : "";
          throw new Error("Expected JSON from comments API. Got: " + preview + htmlHint);
        }
        return parsed;
      });
    })
    .then(function(data) {
      loading = false;
      document.getElementById("fetch-btn").disabled = false;
      allComments = data.comments || [];
      setStatus("Loaded " + allComments.length + " comment(s). " +
        (data.open || 0) + " open, " + (data.resolved || 0) + " resolved.", false);
      document.getElementById("copy-btn").disabled = allComments.length === 0;
      document.getElementById("download-btn").disabled = allComments.length === 0;
      renderComments();
    })
    .catch(function(e) {
      loading = false;
      document.getElementById("fetch-btn").disabled = false;
      var msg = e && e.message ? String(e.message) : String(e);
      if (e && e.name === "TypeError" && (/Failed to fetch|NetworkError|fetch|load failed/i.test(msg))) {
        setStatus("Network error: cannot reach " + url + ". Check API base and deployment protection. (" + msg + ")", true);
        return;
      }
      setStatus("Error: " + msg, true);
    });
}

function renderComments() {
  var filter = document.getElementById("status-filter").value;
  var filtered = allComments;
  if (filter === "open") filtered = allComments.filter(function(c){ return c.status === "open"; });
  if (filter === "resolved") filtered = allComments.filter(function(c){ return c.status === "resolved"; });

  var topLevel = filtered.filter(function(c){ return c.threadDepth === 0; }).length;
  var replies = filtered.filter(function(c){ return c.threadDepth > 0; }).length;
  document.getElementById("stats").textContent = filtered.length + " shown (" + topLevel + " threads, " + replies + " replies)";

  var el = document.getElementById("content");
  if (filtered.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">&#128172;</div><div class="empty-title">No comments match</div><div class="empty-desc">Try changing the filter or load comments first.</div></div>';
    return;
  }

  var html = '<div class="comment-list">';
  for (var i = 0; i < filtered.length; i++) {
    var c = filtered[i];
    var isReply = c.threadDepth > 0;
    var badge = c.status === "resolved"
      ? '<span class="comment-badge badge-resolved">Resolved</span>'
      : '<span class="comment-badge badge-open">Open</span>';
    var orderStr = c.orderNumber ? '<span class="comment-order">#' + c.orderNumber + '</span> ' : '';
    var time = c.createdAt ? new Date(c.createdAt).toLocaleString() : "";
    var resolvedTime = c.resolvedAt ? " (resolved " + new Date(c.resolvedAt).toLocaleString() + ")" : "";
    var nodeInfo = c.nodeId ? '<div class="comment-node">Node: ' + c.nodeId + '</div>' : '';
    var replyInfo = !isReply && c.replyCount > 0 ? ' &middot; ' + c.replyCount + ' repl' + (c.replyCount === 1 ? 'y' : 'ies') : '';

    html += '<div class="comment-item' + (isReply ? ' reply' : '') + '">'
      + '<div class="comment-meta">' + orderStr
      + '<span class="comment-author">' + escHtml(c.author) + '</span>'
      + '<span class="comment-time">' + time + resolvedTime + replyInfo + '</span>'
      + (isReply ? '' : badge)
      + '</div>'
      + '<div class="comment-text">' + escHtml(c.message) + '</div>'
      + nodeInfo
      + '</div>';
  }
  html += '</div>';
  el.innerHTML = html;
}

function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

document.getElementById("status-filter").onchange = renderComments;

document.getElementById("copy-btn").onclick = function() {
  var csv = commentsToCsv();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(csv).then(function() {
      setStatus("Copied " + allComments.length + " comment(s) to clipboard as CSV.", false);
    });
  } else {
    var ta = document.createElement("textarea");
    ta.value = csv;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setStatus("Copied " + allComments.length + " comment(s) to clipboard as CSV.", false);
  }
};

document.getElementById("download-btn").onclick = function() {
  if (!fileKey) return;
  var url = stampUrl(HEIMDALL_API + "/api/comments?fileKey=" + encodeURIComponent(fileKey) + "&format=csv");
  window.open(url, "_blank");
  setStatus("Download started.", false);
};

document.getElementById("open-sheet-btn").onclick = function() {
  if (!fileKey) return;
  var url = HEIMDALL_API + "/comments/" + encodeURIComponent(fileKey);
  window.open(url, "_blank");
  setStatus("Opening comment sheet in browser...", false);
};

function commentsToCsv() {
  var headers = ["#","Author","Message","Created","Resolved","Status","Depth","Replies","Node ID"];
  var rows = [headers.join(",")];
  for (var i = 0; i < allComments.length; i++) {
    var c = allComments[i];
    rows.push([
      c.orderNumber || "",
      csvEsc(c.author),
      csvEsc(c.message),
      c.createdAt || "",
      c.resolvedAt || "",
      c.status,
      c.threadDepth,
      c.replyCount,
      c.nodeId || ""
    ].join(","));
  }
  return rows.join("\\n");
}

function csvEsc(val) {
  if (!val) return "";
  val = String(val);
  if (val.indexOf(",") >= 0 || val.indexOf('"') >= 0 || val.indexOf("\\n") >= 0) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

onmessage = function(e) {
  var d = typeof e.data === "object" && e.data.pluginMessage ? e.data.pluginMessage : e.data;
  if (d.type === "file-key") {
    fileKey = d.fileKey || "";
    if (fileKey) document.getElementById("open-sheet-btn").disabled = false;
  }
  if (d.type === "api-base") setApiBase(d.apiBase || DEFAULT_HEIMDALL_API);
  if (d.type === "vercel-bypass") setVercelBypass(d.secret || "");
};
parent.postMessage({ pluginMessage: { type: "get-api-base" } }, "*");
parent.postMessage({ pluginMessage: { type: "get-vercel-bypass" } }, "*");
<\/script></body></html>`;
  function runExportComments() {
    figma.showUI(commentsUiHtml, { width: 520, height: 600 });
    figma.ui.onmessage = async function(msg) {
      var _a, _b;
      if (msg.type === "get-api-base") {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        figma.ui.postMessage({ type: "api-base", apiBase });
      }
      if (msg.type === "save-api-base") {
        const raw = (_a = msg.apiBase) != null ? _a : "";
        const apiBase = raw.trim().replace(/\/$/, "") || DEFAULT_HEIMDALL_API;
        await figma.clientStorage.setAsync("heimdallApiBase", apiBase);
        figma.ui.postMessage({ type: "api-base", apiBase });
      }
      if (msg.type === "get-plugin-token") {
        const saved = await figma.clientStorage.getAsync("heimdallPluginToken");
        const token = typeof saved === "string" && saved.trim() ? saved.trim() : "";
        figma.ui.postMessage({ type: "plugin-token", token });
      }
      if (msg.type === "save-plugin-token") {
        const token = ((_b = msg.token) != null ? _b : "").trim();
        await figma.clientStorage.setAsync("heimdallPluginToken", token);
        figma.ui.postMessage({ type: "plugin-token", token });
      }
      if (msg.type === "get-vercel-bypass") {
        const saved = await figma.clientStorage.getAsync("heimdallVercelBypass");
        const secret = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_VERCEL_BYPASS;
        figma.ui.postMessage({ type: "vercel-bypass", secret });
      }
      if (msg.type === "get-file-key") {
        figma.ui.postMessage({ type: "file-key", fileKey: figma.fileKey || "" });
      }
    };
  }

  // src/commands/syncBriefings.ts
  var TEMPLATE_PAGE_NAMES = ["Briefing Template to Duplicate", "Briefing Template", "Template"];
  function getPlaceholderValue(placeholderId, briefing) {
    var v = briefing.variants || [];
    var map = {
      "heimdall:exp_name": briefing.experimentName || "",
      "heimdall:idea": briefing.idea || "",
      "heimdall:audience_region": briefing.audienceRegion || "",
      "heimdall:segment": briefing.segment || "",
      "heimdall:formats": briefing.formats || "",
      "heimdall:var_a_headline": v[0] ? v[0].headline || "" : "",
      "heimdall:var_a_subline": v[0] ? v[0].subline || "" : "",
      "heimdall:var_a_cta": v[0] ? v[0].cta || "" : "",
      "heimdall:var_b_headline": v[1] ? v[1].headline || "" : "",
      "heimdall:var_b_subline": v[1] ? v[1].subline || "" : "",
      "heimdall:var_b_cta": v[1] ? v[1].cta || "" : "",
      "heimdall:var_c_headline": v[2] ? v[2].headline || "" : "",
      "heimdall:var_c_subline": v[2] ? v[2].subline || "" : "",
      "heimdall:var_c_cta": v[2] ? v[2].cta || "" : "",
      "heimdall:var_d_headline": v[3] ? v[3].headline || "" : "",
      "heimdall:var_d_subline": v[3] ? v[3].subline || "" : "",
      "heimdall:var_d_cta": v[3] ? v[3].cta || "" : ""
    };
    return map[placeholderId] || "";
  }
  async function loadFontsForTextNode(textNode) {
    var len = textNode.characters.length;
    if (len === 0) {
      var font = textNode.fontName;
      if (font && font.family) {
        await figma.loadFontAsync(font);
      }
      return;
    }
    var loaded = /* @__PURE__ */ new Set();
    for (var c = 0; c < len; c++) {
      var f = textNode.getRangeFontName(c, c + 1);
      if (f && f.family) {
        var key = f.family + ":" + f.style;
        if (!loaded.has(key)) {
          loaded.add(key);
          await figma.loadFontAsync(f);
        }
      }
    }
  }
  function getTraversableChildren(node) {
    var _a;
    if (node.type === "INSTANCE" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      return null;
    }
    const withChildren = node;
    return (_a = withChildren.children) != null ? _a : null;
  }
  var DEBUG_ENDPOINT = "";
  var DEBUG_SESSION_ID = "ee788c";
  var debugSelectionListenerBound = false;
  var debugSelectionLogCount = 0;
  var debugFixLayoutsRunCounter = 0;
  var debugActiveFixLayoutsRunId = "";
  var debugFixLayoutsFrameReports = [];
  var debugFixLayoutsFocusPageName = "";
  function postDebugLog(location, message, data, hypothesisId, runId) {
    fetch(DEBUG_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": DEBUG_SESSION_ID }, body: JSON.stringify({ sessionId: DEBUG_SESSION_ID, location, message, data, timestamp: Date.now(), runId, hypothesisId }) }).catch(() => {
    });
  }
  function getDebugNodeLabel(node) {
    var _a;
    if (!node) return "null";
    const withName = node;
    return `${node.type}:${(_a = withName.name) != null ? _a : ""}`;
  }
  function getDebugNodePath(node) {
    var _a;
    const path = [];
    let current = node != null ? node : null;
    let depth = 0;
    while (current && depth < 12) {
      path.unshift(getDebugNodeLabel(current));
      current = (_a = current.parent) != null ? _a : null;
      depth++;
    }
    return path;
  }
  function summarizeDebugChildren(children) {
    return Array.from(children).slice(0, 8).map((child) => {
      var _a;
      return {
        type: child.type,
        name: (_a = child.name) != null ? _a : ""
      };
    });
  }
  function summarizeNodeFills(node) {
    const fills = node.fills;
    if (!fills) return null;
    if (!Array.isArray(fills)) return String(fills);
    return fills.slice(0, 4).map((fill) => {
      var _a, _b, _c, _d;
      const paint = fill;
      return {
        type: (_a = paint.type) != null ? _a : null,
        visible: (_b = paint.visible) != null ? _b : true,
        scaleMode: (_c = paint.scaleMode) != null ? _c : null,
        opacity: (_d = paint.opacity) != null ? _d : null
      };
    });
  }
  function summarizeNodeReactions(node) {
    const maybe = node;
    if (!maybe.reactions || !Array.isArray(maybe.reactions)) return 0;
    return maybe.reactions.length;
  }
  function summarizeNodeLayoutContext(node) {
    var _a;
    const parent = node.parent;
    if (!parent || parent.type !== "FRAME") return { parentType: (_a = parent == null ? void 0 : parent.type) != null ? _a : null };
    const frameParent = parent;
    return {
      parentType: "FRAME",
      parentName: frameParent.name,
      parentLayoutMode: frameParent.layoutMode,
      parentClipsContent: frameParent.clipsContent
    };
  }
  function summarizeNodeVideoFillState(node) {
    var _a;
    if (node.type !== "RECTANGLE") return { rectangle: false, hasVideoFill: false };
    const fills = getRectangleFills(node);
    return {
      rectangle: true,
      hasVideoFill: isVideoPaintFill(fills),
      fillCount: (_a = fills == null ? void 0 : fills.length) != null ? _a : 0
    };
  }
  function summarizePageFlowState(page, node) {
    const startsRaw = page.flowStartingPoints;
    const starts = Array.isArray(startsRaw) ? startsRaw : [];
    const ancestorIds = /* @__PURE__ */ new Set();
    let current = node;
    let depth = 0;
    while (current && depth < 12) {
      ancestorIds.add(current.id);
      current = current.parent;
      depth++;
    }
    const matching = starts.filter((sp) => (sp == null ? void 0 : sp.nodeId) && ancestorIds.has(sp.nodeId));
    return {
      flowStartCount: starts.length,
      selectedOrAncestorIsFlowStart: matching.length > 0,
      matchingFlowStarts: matching.slice(0, 3).map((sp) => {
        var _a, _b;
        return { nodeId: (_a = sp.nodeId) != null ? _a : null, name: (_b = sp.name) != null ? _b : null };
      })
    };
  }
  function findAssetFrameAncestor(node) {
    var _a;
    let current = node != null ? node : null;
    while (current) {
      if (current.type === "FRAME") {
        const frame = current;
        if (getAssetFrameKey(frame)) {
          return frame;
        }
      }
      current = (_a = current.parent) != null ? _a : null;
    }
    return null;
  }
  function getAssetSizeMatch(width, height) {
    for (const [key, dim] of Object.entries(ASSET_SIZES)) {
      if (Math.abs(width - dim.w) <= 2 && Math.abs(height - dim.h) <= 2) {
        return key;
      }
    }
    return null;
  }
  function getAssetFrameKey(frame) {
    var _a;
    const nameLower = frame.name.toLowerCase();
    const byName = Object.keys(ASSET_SIZES).find((key) => nameLower.endsWith(key.toLowerCase()));
    if (byName) return byName;
    const bySize = getAssetSizeMatch(frame.width, frame.height);
    if (!bySize) return null;
    if (((_a = frame.parent) == null ? void 0 : _a.type) === "FRAME" && frame.parent.name === "Assets") return bySize;
    return null;
  }
  function getAncestorFrameDebug(node) {
    var _a, _b, _c, _d;
    const frames = [];
    let current = node != null ? node : null;
    let depth = 0;
    while (current && depth < 12) {
      if (current.type === "FRAME") {
        const frame = current;
        frames.push({
          name: frame.name,
          width: Math.round(frame.width),
          height: Math.round(frame.height),
          assetSizeMatch: getAssetSizeMatch(frame.width, frame.height),
          parentName: ((_a = frame.parent) == null ? void 0 : _a.type) === "FRAME" ? frame.parent.name : (_c = (_b = frame.parent) == null ? void 0 : _b.type) != null ? _c : null,
          reactions: summarizeNodeReactions(frame)
        });
      }
      current = (_d = current.parent) != null ? _d : null;
      depth++;
    }
    return frames;
  }
  function getSelectionDebugData() {
    var _a;
    const selection = figma.currentPage.selection;
    const first = (_a = selection[0]) != null ? _a : null;
    const assetFrame = findAssetFrameAncestor(first);
    return {
      currentPage: figma.currentPage.name,
      selectionCount: selection.length,
      selected: selection.slice(0, 3).map((node) => ({
        type: node.type,
        name: node.name,
        path: getDebugNodePath(node),
        ancestorFrames: getAncestorFrameDebug(node),
        fills: summarizeNodeFills(node),
        reactions: summarizeNodeReactions(node),
        layoutContext: summarizeNodeLayoutContext(node),
        videoFillState: summarizeNodeVideoFillState(node),
        flowState: summarizePageFlowState(figma.currentPage, node)
      })),
      assetFrame: assetFrame ? {
        name: assetFrame.name,
        path: getDebugNodePath(assetFrame),
        hasMediaTarget: assetFrame.children.some((child) => child.name === "Media Target"),
        childSummary: summarizeDebugChildren(assetFrame.children),
        childFills: Array.from(assetFrame.children).slice(0, 6).map((child) => ({
          type: child.type,
          name: child.name,
          fills: summarizeNodeFills(child)
        }))
      } : null
    };
  }
  function recordFixLayoutsFrameReport(frame, hadMediaTarget, addedMediaTarget) {
    if (!debugActiveFixLayoutsRunId) return;
    const framePath = getDebugNodePath(frame);
    const belongsToFocusPage = debugFixLayoutsFocusPageName ? framePath.includes(`PAGE:${debugFixLayoutsFocusPageName}`) : false;
    if (!belongsToFocusPage && debugFixLayoutsFrameReports.length >= 20) return;
    debugFixLayoutsFrameReports.push({
      frameName: frame.name,
      framePath,
      assetFrameKey: getAssetFrameKey(frame),
      hadMediaTarget,
      addedMediaTarget,
      childSummary: summarizeDebugChildren(frame.children),
      childGeometry: Array.from(frame.children).slice(0, 6).map((child) => ({
        type: child.type,
        name: child.name,
        width: "width" in child ? Math.round(child.width) : null,
        height: "height" in child ? Math.round(child.height) : null,
        fills: summarizeNodeFills(child)
      }))
    });
  }
  function getRectangleFills(node) {
    if (node.type !== "RECTANGLE") return null;
    const fills = node.fills;
    if (!Array.isArray(fills)) return null;
    return fills;
  }
  function isVideoPaintFill(fills) {
    if (!fills || fills.length === 0) return false;
    return fills.some((paint) => paint.type === "VIDEO" && paint.visible !== false);
  }
  function isSolidOnlyFill(fills) {
    if (!fills || fills.length === 0) return false;
    return fills.every((paint) => paint.type === "SOLID");
  }
  function isFrameSizedRectangle(node, frame) {
    if (node.type !== "RECTANGLE") return false;
    return Math.abs(node.width - frame.width) <= 2 && Math.abs(node.height - frame.height) <= 2;
  }
  function findFrameVideoRect(frame) {
    for (const child of frame.children) {
      if (child.type !== "RECTANGLE") continue;
      if (!isFrameSizedRectangle(child, frame)) continue;
      const fills = getRectangleFills(child);
      if (isVideoPaintFill(fills)) return child;
    }
    return null;
  }
  async function fillTextNodes(node, briefing) {
    if (node.type === "TEXT") {
      var textNode = node;
      var heimdallId = "";
      try {
        heimdallId = textNode.getPluginData("heimdallId") || textNode.getPluginData("placeholderId");
      } catch (_) {
      }
      if (heimdallId) {
        var value = getPlaceholderValue(heimdallId, briefing);
        if (!value || !value.trim()) return;
        try {
          await loadFontsForTextNode(textNode);
          textNode.characters = value;
          if (textNode.textAutoResize === "HEIGHT" || textNode.textAutoResize === "WIDTH_AND_HEIGHT") {
            textNode.textAutoResize = "HEIGHT";
          }
          await styleFilledContent(textNode);
        } catch (_) {
        }
      }
      return;
    }
    var withChildren = node;
    if (withChildren.children && withChildren.children.length) {
      for (var i = 0; i < withChildren.children.length; i++) {
        await fillTextNodes(withChildren.children[i], briefing);
      }
    }
  }
  function normalizeTextKey(input) {
    return input.replace(/\s+/g, " ").trim().toLowerCase();
  }
  var LABEL_POINTER_KEYS = /* @__PURE__ */ new Set(["visual", "copy info:"]);
  function findSpecsPlaceholder(labelNode) {
    const parent = labelNode.parent;
    if (!parent || !("children" in parent) || !parent.children) return null;
    for (let i = 0; i < parent.children.length; i++) {
      const child = parent.children[i];
      if (child.type !== "FRAME") continue;
      if (child.name !== "Specs") continue;
      const specChildren = child.children || [];
      for (let j = 0; j < specChildren.length; j++) {
        const c = specChildren[j];
        if (c.type === "TEXT") return c;
      }
      return null;
    }
    return null;
  }
  function stripLabelPointerPrefix(value, normalizedKey) {
    if (LABEL_POINTER_KEYS.has(normalizedKey)) {
      return value.replace(/^visual\s*:\s*/i, "").replace(/^copy\s+info\s*:\s*/i, "").trim();
    }
    return value;
  }
  function cleanVariantValue(value, label) {
    const rx = new RegExp(`^\\s*${label}\\s*:\\s*`, "i");
    return value.replace(rx, "").trim();
  }
  function getAncestorPath(node) {
    const names = [];
    let current = node;
    while (current && "parent" in current) {
      const p = current.parent;
      if (!p || p.type === "DOCUMENT") break;
      if ("name" in p && typeof p.name === "string" && p.name.trim()) {
        names.push(p.name.trim());
      }
      current = p;
    }
    return names.reverse();
  }
  function buildTextCandidates(textNode) {
    const candidates = /* @__PURE__ */ new Set();
    const name = textNode.name || "";
    const chars = textNode.characters || "";
    if (name) candidates.add(name);
    if (chars) candidates.add(chars);
    if (chars && chars.includes("\n")) {
      const firstLine = chars.split("\n")[0].trim();
      if (firstLine) candidates.add(firstLine);
    }
    const path = getAncestorPath(textNode);
    if (path.length > 0) {
      const parent = path[path.length - 1];
      if (name) candidates.add(`${parent}::${name}`);
      if (chars) candidates.add(`${parent}::${chars}`);
      const full = path.join(" > ");
      if (name) candidates.add(`${full}::${name}`);
      if (chars) candidates.add(`${full}::${chars}`);
      for (let i = 0; i < path.length; i++) {
        const partial = path.slice(0, i + 1).join(" > ");
        if (name) candidates.add(`${partial}::${name}`);
        if (chars) candidates.add(`${partial}::${chars}`);
      }
    }
    return Array.from(candidates);
  }
  function detectVariationLetter(textNode) {
    const path = getAncestorPath(textNode);
    for (let i = path.length - 1; i >= 0; i--) {
      const m = /variation\s*([A-D])/i.exec(path[i]);
      if (m) return m[1].toUpperCase();
    }
    return null;
  }
  function consumeScopedMapping(mappingEntries, variation, suffix) {
    const preferredSuffixes = [
      normalizeTextKey(`copy > variation ${variation}::${suffix}`),
      normalizeTextKey(`variation ${variation}::${suffix}`)
    ];
    for (const target of preferredSuffixes) {
      for (let i = 0; i < mappingEntries.length; i++) {
        const entry = mappingEntries[i];
        if (entry.used) continue;
        if (entry.normalizedNodeName !== target) continue;
        entry.used = true;
        return entry.value;
      }
    }
    return void 0;
  }
  function patchInlineLabelValue(text, label, value) {
    if (!value) return text;
    const lines = text.split("\n");
    let changed = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (new RegExp(`^\\s*${label}\\s*:`, "i").test(line)) {
        lines[i] = `${label}: ${value}`;
        changed = true;
        break;
      }
    }
    return changed ? lines.join("\n") : text;
  }
  function tryComposeVariationInline(textNode, mappingEntries) {
    const variation = detectVariationLetter(textNode);
    if (!variation) return void 0;
    let next = textNode.characters;
    const norm = normalizeTextKey(next);
    const h = consumeScopedMapping(mappingEntries, variation, "headline:");
    const s = consumeScopedMapping(mappingEntries, variation, "subline:");
    const c = consumeScopedMapping(mappingEntries, variation, "cta:");
    const n = consumeScopedMapping(mappingEntries, variation, "note:");
    if (norm.includes("headline:") && norm.includes("subline:") && norm.includes("cta:")) {
      next = patchInlineLabelValue(next, "headline", h ? cleanVariantValue(h, "headline") : void 0);
      next = patchInlineLabelValue(next, "subline", s ? cleanVariantValue(s, "subline") : void 0);
      next = patchInlineLabelValue(next, "CTA", c ? cleanVariantValue(c, "cta") : void 0);
    }
    if (norm.includes("note:")) {
      next = patchInlineLabelValue(next, "Note", n ? cleanVariantValue(n, "note") : void 0);
    }
    return next !== textNode.characters ? next : void 0;
  }
  function pickMappedValue(textNode, mappingEntries) {
    const path = getAncestorPath(textNode);
    const candidates = buildTextCandidates(textNode).map(normalizeTextKey);
    for (const candidate of candidates) {
      for (let i = 0; i < mappingEntries.length; i++) {
        const entry = mappingEntries[i];
        if (entry.used) continue;
        if (entry.normalizedNodeName !== candidate) continue;
        entry.used = true;
        return entry.value;
      }
    }
    const inCopyOrVariation = path.some((p) => {
      const n = normalizeTextKey(p);
      return n.includes("copy") || n.includes("variation");
    });
    if (inCopyOrVariation) {
      const nameOrChars = [normalizeTextKey(textNode.name || ""), normalizeTextKey(textNode.characters || "")];
      const consumeBySuffix = (suffix) => {
        for (let i = 0; i < mappingEntries.length; i++) {
          const entry = mappingEntries[i];
          if (entry.used) continue;
          if (!entry.normalizedNodeName.endsWith(suffix)) continue;
          entry.used = true;
          return entry.value;
        }
        return void 0;
      };
      if (nameOrChars.includes("headline:")) return consumeBySuffix("::headline:");
      if (nameOrChars.includes("subline:")) return consumeBySuffix("::subline:");
      if (nameOrChars.includes("cta:")) return consumeBySuffix("::cta:");
      if (nameOrChars.includes("note:")) return consumeBySuffix("::note:");
    }
    return void 0;
  }
  async function applyNodeMapping(node, mappingEntries, frameRenames) {
    let mappedCount = 0;
    if (node.type === "TEXT") {
      var textNode = node;
      var path = getAncestorPath(textNode);
      var value = pickMappedValue(textNode, mappingEntries);
      if (value === void 0) {
        value = tryComposeVariationInline(textNode, mappingEntries);
      }
      debugLog.push({
        nodeName: textNode.name,
        chars: (textNode.characters || "").substring(0, 60),
        path,
        matched: value !== void 0,
        matchedKey: value !== void 0 ? value.substring(0, 60) : void 0
      });
      if (value !== void 0) {
        const normalizedName = normalizeTextKey(textNode.name || "");
        const normalizedChars = normalizeTextKey(textNode.characters || "");
        if ((normalizedName === "variants" || normalizedChars === "variants") && value.trim().toUpperCase() !== "VARIANTS") {
          value = "VARIANTS";
        }
        const isLabelPointer = LABEL_POINTER_KEYS.has(normalizedName) || LABEL_POINTER_KEYS.has(normalizedChars);
        const targetNode = isLabelPointer ? findSpecsPlaceholder(textNode) || textNode : textNode;
        const valueToWrite = targetNode !== textNode ? stripLabelPointerPrefix(value, normalizedName || normalizedChars) : value;
        try {
          await loadFontsForTextNode(targetNode);
          targetNode.characters = valueToWrite;
          if (targetNode.textAutoResize === "HEIGHT" || targetNode.textAutoResize === "WIDTH_AND_HEIGHT") {
            targetNode.textAutoResize = "HEIGHT";
          }
          await styleFilledContent(targetNode);
          mappedCount += 1;
        } catch (_) {
        }
      }
      return mappedCount;
    }
    if (node.type === "FRAME" || node.type === "GROUP") {
      var frame = node;
      for (var r = 0; r < frameRenames.length; r++) {
        if (frameRenames[r].oldName === frame.name) {
          frame.name = frameRenames[r].newName;
          frameRenames.splice(r, 1);
          break;
        }
      }
    }
    if (node.type === "INSTANCE" || node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      return mappedCount;
    }
    var withChildren = node;
    if (withChildren.children && withChildren.children.length) {
      for (var i = 0; i < withChildren.children.length; i++) {
        mappedCount += await applyNodeMapping(withChildren.children[i], mappingEntries, frameRenames);
      }
    }
    return mappedCount;
  }
  var SECTION_UTILITY_PREFIXES = [
    "Briefing Template",
    "Template",
    "Cover",
    "Status",
    "Safe Zone",
    "Export",
    "_Heimdall Components"
  ];
  function getSectionDividers(allPages) {
    var dividers = [];
    for (var i = 0; i < allPages.length; i++) {
      var page = allPages[i];
      var name = page.name.trim();
      if (name.toUpperCase().indexOf("EXP-") === 0) continue;
      var skip = false;
      for (var j = 0; j < SECTION_UTILITY_PREFIXES.length; j++) {
        if (name.indexOf(SECTION_UTILITY_PREFIXES[j]) >= 0) {
          skip = true;
          break;
        }
      }
      if (skip) continue;
      if (/^[-\u2014\u2013\s*]+$/.test(name)) continue;
      dividers.push({ index: i, name: name.toUpperCase() });
    }
    return dividers;
  }
  function findSectionInsertionIndex(sectionName, allPages) {
    var dividers = getSectionDividers(allPages);
    var upper = sectionName.toUpperCase().trim();
    var matchIdx = -1;
    for (var i = 0; i < dividers.length; i++) {
      if (dividers[i].name === upper || dividers[i].name.indexOf(upper) >= 0 || upper.indexOf(dividers[i].name) >= 0) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) return -1;
    var nextDivider = dividers[matchIdx + 1];
    if (nextDivider) return nextDivider.index;
    return allPages.length;
  }
  function ensureCategoryPages(root, jobs) {
    var sectionNames = /* @__PURE__ */ new Set();
    for (var i = 0; i < jobs.length; i++) {
      var sectionName = jobs[i].briefingPayload.sectionName;
      if (sectionName && String(sectionName).trim()) {
        sectionNames.add(String(sectionName).trim().toUpperCase());
      }
    }
    if (sectionNames.size === 0) return;
    var children = root.children || [];
    var allPages = [];
    for (var c = 0; c < children.length; c++) {
      if (children[c].type === "PAGE") allPages.push(children[c]);
    }
    var dividers = getSectionDividers(allPages);
    var existingNames = new Set(dividers.map(function(d) {
      return d.name;
    }));
    var toCreate = [];
    sectionNames.forEach(function(upper) {
      if (!existingNames.has(upper)) toCreate.push(upper);
    });
    if (toCreate.length === 0) return;
    var insertAt;
    if (dividers.length > 0) {
      insertAt = dividers[dividers.length - 1].index + 1;
    } else {
      var templateIdx = -1;
      for (var t = 0; t < allPages.length; t++) {
        var p = allPages[t];
        if (SECTION_UTILITY_PREFIXES.some(function(pre) {
          return p.name.indexOf(pre) >= 0;
        })) {
          templateIdx = t;
        }
      }
      insertAt = templateIdx >= 0 ? templateIdx + 1 : 0;
    }
    for (var k = 0; k < toCreate.length; k++) {
      var newPage = figma.createPage();
      newPage.name = toCreate[k];
      root.insertChild(insertAt + k, newPage);
    }
  }
  var TEMPLATE_FONT = { family: "Inter", style: "Regular" };
  var TEMPLATE_FONT_BOLD = { family: "Inter", style: "Bold" };
  var S = 4;
  var LABEL_FONT_SIZE = 14 * S;
  var SUB_LABEL_FONT_SIZE = 12 * S;
  var CONTENT_FONT_SIZE = 12 * S;
  var ASSET_SIZES = {
    "9x16": { w: 1440, h: 2560 },
    "4x5": { w: 1440, h: 1800 },
    "1x1": { w: 1440, h: 1440 }
  };
  function solidPaint(r, g, b) {
    return { type: "SOLID", color: { r, g, b } };
  }
  function applyTextColor(text, r, g, b) {
    text.fills = [solidPaint(r, g, b)];
  }
  function makeColumnFrame(name, width) {
    const frame = figma.createFrame();
    frame.name = name;
    frame.resize(width, 100);
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    frame.counterAxisAlignItems = "MIN";
    frame.itemSpacing = 8 * S;
    frame.paddingTop = frame.paddingBottom = frame.paddingLeft = frame.paddingRight = 16 * S;
    if (name === "Briefing") frame.fills = [solidPaint(0.94, 0.95, 0.97)];
    else if (name === "Copy") frame.fills = [solidPaint(0.94, 0.94, 0.96)];
    else if (name === "Design") frame.fills = [solidPaint(0.93, 0.94, 0.95)];
    else frame.fills = [solidPaint(0.95, 0.95, 0.95)];
    frame.clipsContent = false;
    return frame;
  }
  function makeTextNode(name, placeholder, font) {
    const text = figma.createText();
    text.name = name;
    text.fontName = font;
    text.fontSize = 13 * S;
    text.lineHeight = { unit: "PIXELS", value: 18 * S };
    text.characters = placeholder;
    text.textAutoResize = "HEIGHT";
    return text;
  }
  function makeColumnHeader(title, width) {
    const header = figma.createFrame();
    header.name = `${title} Header`;
    header.resize(width, 64 * S);
    header.layoutMode = "HORIZONTAL";
    header.primaryAxisSizingMode = "FIXED";
    header.counterAxisSizingMode = "AUTO";
    header.counterAxisAlignItems = "CENTER";
    header.primaryAxisAlignItems = "SPACE_BETWEEN";
    header.itemSpacing = 16 * S;
    header.paddingLeft = 20 * S;
    header.paddingRight = 20 * S;
    header.paddingTop = 14 * S;
    header.paddingBottom = 14 * S;
    header.cornerRadius = 8 * S;
    header.fills = [solidPaint(0.16, 0.17, 0.2)];
    header.strokes = [solidPaint(0.3, 0.32, 0.36)];
    header.strokeWeight = Math.max(1, S / 2);
    header.clipsContent = false;
    const titleText = figma.createText();
    titleText.name = `${title} Title`;
    titleText.fontName = TEMPLATE_FONT_BOLD;
    titleText.fontSize = 18 * S;
    titleText.characters = title.toUpperCase();
    titleText.textAutoResize = "WIDTH_AND_HEIGHT";
    applyTextColor(titleText, 1, 1, 1);
    header.appendChild(titleText);
    return header;
  }
  var boldFontAvailable = null;
  async function ensureBoldFont() {
    if (boldFontAvailable !== null) return boldFontAvailable;
    try {
      await figma.loadFontAsync(TEMPLATE_FONT_BOLD);
      boldFontAvailable = true;
    } catch (_) {
      boldFontAvailable = false;
    }
    return boldFontAvailable;
  }
  async function styleFilledContent(textNode) {
    const text = textNode.characters;
    if (!text || text.length === 0) return;
    var currentFont = textNode.fontName;
    if (currentFont !== figma.mixed && currentFont.family) {
      try {
        await figma.loadFontAsync(currentFont);
      } catch (_) {
      }
    }
    try {
      await figma.loadFontAsync(TEMPLATE_FONT);
    } catch (_) {
      return;
    }
    const hasBold = await ensureBoldFont();
    const len = text.length;
    textNode.setRangeFontName(0, len, TEMPLATE_FONT);
    textNode.setRangeFontSize(0, len, CONTENT_FONT_SIZE);
    textNode.setRangeLineHeight(0, len, { unit: "PIXELS", value: CONTENT_FONT_SIZE + 5 });
    const KNOWN_LABELS = /^(IDEA:|WHY:|AUDIENCE\/REGION:|SEGMENT:|FORMATS:|VARIANTS:|Product:|Visual:|Copy:|Copy info:|Note:|Test:|Testing:|headline:|subline:|CTA:|[A-D]\s*-\s*(?:Video|Image|Static|Carousel|[A-Za-z]+):)/i;
    const SUB_LABELS = /^(Input visual \+ copy direction:|Script:)/i;
    const lines = text.split("\n");
    let offset = 0;
    for (const line of lines) {
      const subM = SUB_LABELS.exec(line);
      const labelM = KNOWN_LABELS.exec(line);
      if (subM) {
        const labelEnd = offset + subM[1].length;
        if (hasBold) {
          textNode.setRangeFontName(offset, labelEnd, TEMPLATE_FONT_BOLD);
        }
        textNode.setRangeFontSize(offset, labelEnd, SUB_LABEL_FONT_SIZE);
        textNode.setRangeLineHeight(offset, labelEnd, { unit: "PIXELS", value: SUB_LABEL_FONT_SIZE + 5 });
      } else if (labelM) {
        const labelEnd = offset + labelM[1].length;
        if (hasBold) {
          textNode.setRangeFontName(offset, labelEnd, TEMPLATE_FONT_BOLD);
        }
        textNode.setRangeFontSize(offset, labelEnd, LABEL_FONT_SIZE);
        textNode.setRangeLineHeight(offset, labelEnd, { unit: "PIXELS", value: LABEL_FONT_SIZE + 5 });
      }
      offset += line.length + 1;
    }
    applyHyperlinksToTextNode(textNode);
  }
  var URL_REGEX = /https?:\/\/[^\s\]\)"\']+/g;
  function applyHyperlinksToTextNode(textNode) {
    const text = textNode.characters;
    if (!text || text.length === 0) return;
    let m;
    URL_REGEX.lastIndex = 0;
    while ((m = URL_REGEX.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      const url = m[0];
      try {
        textNode.setRangeHyperlink(start, end, { type: "URL", url });
      } catch (_) {
      }
    }
  }
  async function styleTemplateLabel(textNode) {
    const text = textNode.characters;
    if (!text || text.length === 0) return;
    try {
      await figma.loadFontAsync(TEMPLATE_FONT);
    } catch (_) {
      return;
    }
    const hasBold = await ensureBoldFont();
    const len = text.length;
    if (hasBold) {
      textNode.setRangeFontName(0, len, TEMPLATE_FONT_BOLD);
    }
    textNode.setRangeFontSize(0, len, LABEL_FONT_SIZE);
    textNode.setRangeLineHeight(0, len, { unit: "PIXELS", value: LABEL_FONT_SIZE + 5 });
  }
  async function styleTemplateSubLabel(textNode) {
    const text = textNode.characters;
    if (!text || text.length === 0) return;
    try {
      await figma.loadFontAsync(TEMPLATE_FONT);
    } catch (_) {
      return;
    }
    const hasBold = await ensureBoldFont();
    const len = text.length;
    if (hasBold) {
      textNode.setRangeFontName(0, len, TEMPLATE_FONT_BOLD);
    }
    textNode.setRangeFontSize(0, len, SUB_LABEL_FONT_SIZE);
    textNode.setRangeLineHeight(0, len, { unit: "PIXELS", value: SUB_LABEL_FONT_SIZE + 5 });
  }
  function makeBlockFrame() {
    const frame = figma.createFrame();
    frame.name = "Block";
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    frame.counterAxisAlignItems = "MIN";
    frame.itemSpacing = 8 * S;
    frame.paddingTop = frame.paddingBottom = 8 * S;
    frame.paddingLeft = frame.paddingRight = 12 * S;
    frame.fills = [solidPaint(1, 1, 1)];
    frame.strokes = [solidPaint(0.88, 0.89, 0.92)];
    frame.strokeWeight = Math.max(1, S / 2);
    frame.cornerRadius = 6 * S;
    frame.clipsContent = false;
    return frame;
  }
  function appendAndStretch(parent, child) {
    parent.appendChild(child);
    try {
      child.layoutAlign = "STRETCH";
    } catch (_) {
    }
  }
  async function createAutoLayoutTemplate() {
    var _a;
    try {
      await figma.loadFontAsync(TEMPLATE_FONT);
      await figma.loadFontAsync(TEMPLATE_FONT_BOLD);
    } catch (e) {
      return { error: "Could not load Inter fonts" };
    }
    const font = TEMPLATE_FONT;
    const root = figma.root;
    try {
      let makeColumnWithHeader2 = function(title, width) {
        const wrapper = figma.createFrame();
        wrapper.name = `${title} Column`;
        wrapper.layoutMode = "VERTICAL";
        wrapper.primaryAxisSizingMode = "AUTO";
        wrapper.counterAxisSizingMode = "FIXED";
        wrapper.counterAxisAlignItems = "MIN";
        wrapper.itemSpacing = 8 * S;
        wrapper.fills = [];
        wrapper.clipsContent = false;
        wrapper.resize(width, 100);
        const header = makeColumnHeader(title, width);
        wrapper.appendChild(header);
        try {
          header.layoutAlign = "STRETCH";
        } catch (_) {
        }
        const body = makeColumnFrame(title, width);
        wrapper.appendChild(body);
        try {
          body.layoutAlign = "STRETCH";
        } catch (_) {
        }
        return { wrapper, body };
      };
      var makeColumnWithHeader = makeColumnWithHeader2;
      let templatePage = null;
      for (let i = root.children.length - 1; i >= 0; i--) {
        const page = root.children[i];
        if (page.type === "PAGE" && TEMPLATE_PAGE_NAMES.some((n) => page.name.indexOf(n) >= 0)) {
          templatePage = page;
          if (typeof templatePage.loadAsync === "function") {
            try {
              await templatePage.loadAsync();
            } catch (_) {
            }
          }
          for (let c = templatePage.children.length - 1; c >= 0; c--) {
            templatePage.children[c].remove();
          }
          break;
        }
      }
      if (!templatePage) {
        templatePage = figma.createPage();
        templatePage.name = "Briefing Template to Duplicate";
        root.appendChild(templatePage);
      }
      const section = figma.createFrame();
      section.name = "Name Briefing";
      section.layoutMode = "VERTICAL";
      section.primaryAxisSizingMode = "AUTO";
      section.counterAxisSizingMode = "FIXED";
      section.counterAxisAlignItems = "MIN";
      section.itemSpacing = 12 * S;
      section.paddingTop = section.paddingBottom = section.paddingLeft = section.paddingRight = 24 * S;
      section.fills = [];
      section.clipsContent = false;
      section.resize(2400 * S, 100);
      templatePage.appendChild(section);
      const row = figma.createFrame();
      row.name = "Columns";
      row.layoutMode = "HORIZONTAL";
      row.primaryAxisSizingMode = "AUTO";
      row.counterAxisSizingMode = "AUTO";
      row.counterAxisAlignItems = "MIN";
      row.itemSpacing = 40 * S;
      row.paddingTop = row.paddingBottom = row.paddingLeft = row.paddingRight = 0;
      row.fills = [];
      row.clipsContent = false;
      section.appendChild(row);
      const colW = 400 * S;
      const designW = 1200 * S;
      const uploadsW = 280 * S;
      const { wrapper: briefingWrapper, body: briefingCol } = makeColumnWithHeader2("Briefing", colW);
      row.appendChild(briefingWrapper);
      const nameBlock = makeBlockFrame();
      nameBlock.fills = [solidPaint(0.25, 0.25, 0.27)];
      const nameText = makeTextNode("Name EXP", "EXP-NAME", font);
      nameText.setPluginData("heimdallId", "heimdall:exp_name");
      nameText.setPluginData("placeholderId", "heimdall:exp_name");
      applyTextColor(nameText, 1, 1, 1);
      appendAndStretch(nameBlock, nameText);
      appendAndStretch(briefingCol, nameBlock);
      const briefingContentPlaceholder = [
        "IDEA:",
        "Your core creative idea.",
        "",
        "WHY:",
        "Strategic rationale.",
        "",
        "AUDIENCE/REGION:",
        "Target audience and region.",
        "",
        "SEGMENT: ALL",
        "",
        "FORMATS:",
        "e.g. Static, Video, Carousel.",
        "",
        "VARIANTS: 4",
        "",
        "Product:",
        "Product context.",
        "",
        "Visual:",
        "Visual direction.",
        "",
        "Copy info:",
        "Copy tone and CTAs.",
        "",
        "Note: -",
        "",
        "Test: -"
      ].join("\n");
      const briefingContentBlock = makeBlockFrame();
      briefingContentBlock.fills = [solidPaint(0.96, 0.97, 0.99)];
      const briefingContentText = makeTextNode("Briefing Content", briefingContentPlaceholder, font);
      appendAndStretch(briefingContentBlock, briefingContentText);
      appendAndStretch(briefingCol, briefingContentBlock);
      const variantsHeaderBlock = makeBlockFrame();
      variantsHeaderBlock.fills = [solidPaint(0.25, 0.25, 0.27)];
      const variantsHeaderText = makeTextNode("VARIANTS", "VARIANTS", font);
      applyTextColor(variantsHeaderText, 1, 1, 1);
      appendAndStretch(variantsHeaderBlock, variantsHeaderText);
      appendAndStretch(briefingCol, variantsHeaderBlock);
      const variantPlaceholder = (letter) => `${letter} - Image
Input visual + copy direction:
Script:`;
      for (const letter of ["A", "B", "C", "D"]) {
        const block = makeBlockFrame();
        const text = makeTextNode(`${letter} - Image`, variantPlaceholder(letter), font);
        appendAndStretch(block, text);
        appendAndStretch(briefingCol, block);
      }
      const { wrapper: copyWrapper, body: copyCol } = makeColumnWithHeader2("Copy", colW);
      row.appendChild(copyWrapper);
      let copyBlock = makeBlockFrame();
      for (const letter of ["A", "B", "C", "D"]) {
        const varFrame = figma.createFrame();
        varFrame.name = `Variation ${letter}`;
        varFrame.layoutMode = "VERTICAL";
        varFrame.primaryAxisSizingMode = "AUTO";
        varFrame.counterAxisSizingMode = "FIXED";
        varFrame.itemSpacing = 10 * S;
        varFrame.paddingTop = varFrame.paddingBottom = varFrame.paddingLeft = varFrame.paddingRight = 12 * S;
        varFrame.fills = [{ type: "SOLID", color: { r: 0.92, g: 0.92, b: 0.94 } }];
        varFrame.resize(colW, 100);
        varFrame.clipsContent = false;
        appendAndStretch(copyCol, varFrame);
        let b = makeBlockFrame();
        appendAndStretch(varFrame, b);
        appendAndStretch(b, makeTextNode(`Variation ${letter}`, `Variation ${letter}`, font));
        b = makeBlockFrame();
        appendAndStretch(varFrame, b);
        appendAndStretch(b, makeTextNode("in design copy", "in design copy", font));
        for (const field of ["headline:", "subline:", "CTA:", "Note:"]) {
          b = makeBlockFrame();
          appendAndStretch(varFrame, b);
          appendAndStretch(b, makeTextNode(field, field, font));
        }
      }
      const { wrapper: designWrapper, body: designCol } = makeColumnWithHeader2("Design", designW);
      row.appendChild(designWrapper);
      let designBlock = makeBlockFrame();
      const sizes = ["9x16", "4x5", "1x1"];
      for (const letter of ["A", "B", "C", "D"]) {
        const varFrame = figma.createFrame();
        varFrame.name = `Variation ${letter}`;
        varFrame.layoutMode = "VERTICAL";
        varFrame.primaryAxisSizingMode = "AUTO";
        varFrame.counterAxisSizingMode = "FIXED";
        varFrame.itemSpacing = 12 * S;
        varFrame.paddingTop = varFrame.paddingBottom = varFrame.paddingLeft = varFrame.paddingRight = 12 * S;
        varFrame.fills = [];
        varFrame.resize(designW, 100);
        varFrame.clipsContent = false;
        appendAndStretch(designCol, varFrame);
        const assetRow = figma.createFrame();
        assetRow.name = "Assets";
        assetRow.layoutMode = "HORIZONTAL";
        assetRow.primaryAxisSizingMode = "AUTO";
        assetRow.counterAxisSizingMode = "AUTO";
        assetRow.itemSpacing = 12 * S;
        assetRow.fills = [];
        assetRow.clipsContent = false;
        appendAndStretch(varFrame, assetRow);
        for (const size of sizes) {
          const dim = (_a = ASSET_SIZES[size]) != null ? _a : { w: 1440, h: 1440 };
          const f = figma.createFrame();
          f.name = "NAME-EXP-" + size;
          f.resize(dim.w, dim.h);
          f.fills = [];
          f.clipsContent = true;
          const media = figma.createRectangle();
          media.name = "Media Target";
          media.resize(dim.w, dim.h);
          media.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
          f.appendChild(media);
          media.x = 0;
          media.y = 0;
          try {
            media.constraints = { horizontal: "SCALE", vertical: "SCALE" };
          } catch (e) {
          }
          assetRow.appendChild(f);
        }
      }
      const { wrapper: referencesWrapper, body: referencesBody } = makeColumnWithHeader2("References", uploadsW);
      referencesBody.name = "References";
      templatePage.appendChild(referencesWrapper);
      referencesWrapper.x = section.x - uploadsW - 24 * S;
      referencesWrapper.y = section.y + section.paddingTop;
      async function boldAllText(node) {
        if (node.type === "TEXT") {
          await styleTemplateLabel(node);
        }
        const c = node;
        if (c.children) {
          for (const child of c.children) await boldAllText(child);
        }
      }
      await boldAllText(section);
      await boldAllText(referencesWrapper);
      await figma.setCurrentPageAsync(templatePage);
      return {};
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Failed to create template" };
    }
  }
  var STATUS_HEADER_NAMES = ["Briefing Header", "Copy Header", "Design Header"];
  function findTemplatePage() {
    const root = figma.root;
    const children = root.children || [];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.type !== "PAGE") continue;
      const pageName = node.name;
      if (TEMPLATE_PAGE_NAMES.some((n) => pageName.indexOf(n) >= 0 || pageName === n)) {
        return node;
      }
    }
    return null;
  }
  function findWidgetsInHeaders(root) {
    const map = {};
    function walk(node) {
      if (node.type === "FRAME" && STATUS_HEADER_NAMES.includes(node.name)) {
        const frame = node;
        const kids = frame.children || [];
        for (let i = 0; i < kids.length; i++) {
          const child = kids[i];
          if (child.type === "WIDGET") {
            if (!map[frame.name]) map[frame.name] = child;
            return;
          }
        }
      }
      const c = node;
      if (c.children) {
        for (let i = 0; i < c.children.length; i++) walk(c.children[i]);
      }
    }
    walk(root);
    return map;
  }
  function findHeaderFrames(contentRoot) {
    const map = {};
    function walk(node) {
      if (node.type === "FRAME" && STATUS_HEADER_NAMES.includes(node.name)) {
        map[node.name] = node;
        return;
      }
      const c = node;
      if (c.children) {
        for (let i = 0; i < c.children.length; i++) walk(c.children[i]);
      }
    }
    walk(contentRoot);
    return map;
  }
  function removeOldStatusChips(header) {
    const kids = [...header.children || []];
    for (const child of kids) {
      if (child.type === "INSTANCE" && child.name.endsWith(" Status")) {
        child.remove();
      }
    }
  }
  function headerHasWidget(header) {
    const kids = header.children || [];
    for (let i = 0; i < kids.length; i++) {
      if (kids[i].type === "WIDGET") return true;
    }
    return false;
  }
  async function migrateStatusWidgets() {
    var _a;
    const result = { pagesMigrated: 0, pagesSkipped: 0, pagesFailed: 0 };
    const templatePage = findTemplatePage();
    if (!templatePage) {
      result.error = "No template page found.";
      return result;
    }
    if (typeof templatePage.loadAsync === "function") {
      try {
        await templatePage.loadAsync();
      } catch (_) {
      }
    }
    const nameBriefing = (_a = templatePage.children) == null ? void 0 : _a.find(
      (c) => c.type === "FRAME" && c.name === "Name Briefing"
    );
    if (!nameBriefing) {
      result.error = 'Template has no "Name Briefing" frame.';
      return result;
    }
    const templateWidgets = findWidgetsInHeaders(nameBriefing);
    const headerNamesWithWidget = Object.keys(templateWidgets);
    if (headerNamesWithWidget.length === 0) {
      result.error = "No widgets found on template headers. Please add the 'Custom Labels - Status Tracker' widget to the Briefing, Copy, and Design headers first.";
      return result;
    }
    const root = figma.root;
    const briefingPages = [];
    for (let i = 0; i < root.children.length; i++) {
      const node = root.children[i];
      if (node.type !== "PAGE") continue;
      const page = node;
      const mondayId = page.getPluginData("heimdallMondayItemId");
      if (!mondayId || mondayId === "") continue;
      briefingPages.push(page);
    }
    for (const page of briefingPages) {
      if (typeof page.loadAsync === "function") {
        try {
          await page.loadAsync();
        } catch (_) {
        }
      }
      let contentRoot = null;
      for (let ci = 0; ci < page.children.length; ci++) {
        const child = page.children[ci];
        if (child.type === "FRAME" && child.name === "Name Briefing") {
          contentRoot = child;
          break;
        }
      }
      if (!contentRoot) {
        result.pagesSkipped++;
        continue;
      }
      const headers = findHeaderFrames(contentRoot);
      let didMigrate = false;
      let failed = false;
      for (const headerName of STATUS_HEADER_NAMES) {
        const templateWidget = templateWidgets[headerName];
        const targetHeader = headers[headerName];
        if (!targetHeader || !templateWidget) continue;
        if (headerHasWidget(targetHeader)) {
          continue;
        }
        removeOldStatusChips(targetHeader);
        try {
          const cloned = templateWidget.clone();
          if (cloned && targetHeader.appendChild) {
            targetHeader.appendChild(cloned);
            didMigrate = true;
          }
        } catch (_) {
          failed = true;
        }
      }
      if (failed) result.pagesFailed++;
      else if (didMigrate) result.pagesMigrated++;
      else result.pagesSkipped++;
    }
    for (let i = root.children.length - 1; i >= 0; i--) {
      const node = root.children[i];
      if (node.type === "PAGE" && node.name === "_Heimdall Components") {
        node.remove();
        break;
      }
    }
    return result;
  }
  function hasColumnsRow(frame) {
    return frame.children.some(
      (c) => c.type === "FRAME" && c.name === "Columns"
    );
  }
  function findPageContentRoot(page) {
    const directFrames = page.children.filter((c) => c.type === "FRAME");
    const canonical = directFrames.find((frame) => frame.name === "Name Briefing");
    if (canonical) return canonical;
    const legacy = directFrames.find((frame) => hasColumnsRow(frame));
    return legacy != null ? legacy : null;
  }
  function isHeimdallTemplatePage(page) {
    return !!findPageContentRoot(page);
  }
  async function fixLayouts() {
    const result = { pagesFixed: 0, pagesSkipped: 0 };
    const root = figma.root;
    const debugRunId = `fix-layouts-${++debugFixLayoutsRunCounter}`;
    const debugFixedPages = [];
    const debugSkippedPages = [];
    debugActiveFixLayoutsRunId = debugRunId;
    debugFixLayoutsFocusPageName = figma.currentPage.name;
    debugFixLayoutsFrameReports = [];
    postDebugLog(
      "syncBriefings.ts:fixLayouts:start",
      "fix layouts started",
      {
        fileKey: figma.fileKey || "",
        rootPageCount: root.children.length,
        selection: getSelectionDebugData()
      },
      "H2",
      debugRunId
    );
    for (let i = 0; i < root.children.length; i++) {
      const node = root.children[i];
      if (node.type !== "PAGE") continue;
      const page = node;
      if (TEMPLATE_PAGE_NAMES.some((n) => page.name.indexOf(n) >= 0 || page.name === n)) continue;
      if (typeof page.loadAsync === "function") {
        try {
          await page.loadAsync();
        } catch (_) {
        }
      }
      if (!isHeimdallTemplatePage(page)) {
        result.pagesSkipped++;
        debugSkippedPages.push({ pageName: page.name, reason: "not_heimdall_template" });
        continue;
      }
      try {
        const nameBriefing = findPageContentRoot(page);
        if (!nameBriefing) {
          result.pagesSkipped++;
          debugSkippedPages.push({ pageName: page.name, reason: "missing_name_briefing" });
          continue;
        }
        fixAssetFrameRatios(nameBriefing);
        ensureMediaTargets(nameBriefing);
        const gap = 24 * S;
        const columnsRow = nameBriefing.children.find(
          (c) => c.type === "FRAME" && c.name === "Columns"
        );
        const targetDesignW = 1200 * S;
        if (columnsRow) {
          for (let ci = 0; ci < columnsRow.children.length; ci++) {
            const col = columnsRow.children[ci];
            if (col.type === "FRAME" && col.name === "Design Column") {
              const dc = col;
              if (dc.width < targetDesignW) {
                dc.resize(targetDesignW, dc.height);
                for (let vi = 0; vi < dc.children.length; vi++) {
                  const child = dc.children[vi];
                  if (child.type === "FRAME" && child.counterAxisSizingMode === "FIXED") {
                    const cf = child;
                    if (cf.width < targetDesignW) cf.resize(targetDesignW, cf.height);
                  }
                }
              }
              break;
            }
          }
        }
        const anchorY = columnsRow ? nameBriefing.y + columnsRow.y : nameBriefing.y;
        const uploadsBody = findUploadsBody(page);
        if (uploadsBody) {
          const wrapper = uploadsBody.parent;
          if (wrapper && wrapper.type === "FRAME" && wrapper !== page) {
            const wf = wrapper;
            wf.x = nameBriefing.x - wf.width - gap;
            wf.y = anchorY;
          }
        }
        result.pagesFixed++;
        debugFixedPages.push(`${page.name}=>${nameBriefing.name}`);
      } catch (error) {
        result.pagesSkipped++;
        debugSkippedPages.push({
          pageName: page.name,
          reason: "exception",
          detail: error instanceof Error ? error.message : String(error)
        });
        console.warn(
          "[Layout] Skipping page during Fix Layouts:",
          page.name,
          error instanceof Error ? error.message : error
        );
      }
    }
    postDebugLog(
      "syncBriefings.ts:fixLayouts:end",
      "fix layouts finished",
      {
        pagesFixed: result.pagesFixed,
        pagesSkipped: result.pagesSkipped,
        fixedPages: debugFixedPages.slice(0, 20),
        skippedPages: debugSkippedPages.slice(0, 40),
        assetFrameReports: debugFixLayoutsFrameReports,
        selection: getSelectionDebugData()
      },
      "H3",
      debugRunId
    );
    debugActiveFixLayoutsRunId = "";
    debugFixLayoutsFocusPageName = "";
    return result;
  }
  function ensureMediaTargets(node) {
    let added = 0;
    if (node.type === "FRAME") {
      const frame = node;
      const assetFrameKey = getAssetFrameKey(frame);
      if (assetFrameKey) {
        const existingMediaTarget = frame.children.find(
          (c) => c.type === "RECTANGLE" && c.name === "Media Target"
        );
        const hasMediaTarget = !!existingMediaTarget;
        const videoRect = findFrameVideoRect(frame);
        let addedMediaTarget = false;
        if (!hasMediaTarget) {
          if (videoRect) {
            videoRect.name = "Media Target";
            try {
              videoRect.constraints = { horizontal: "SCALE", vertical: "SCALE" };
            } catch (e) {
            }
            frame.clipsContent = true;
            postDebugLog(
              "syncBriefings.ts:ensureMediaTargets:promoteVideoRect",
              "promoted legacy video rectangle to media target",
              {
                frameName: frame.name,
                framePath: getDebugNodePath(frame),
                promotedNodeName: videoRect.name
              },
              "H4",
              debugActiveFixLayoutsRunId || "no-run"
            );
          } else {
            const media = figma.createRectangle();
            media.name = "Media Target";
            media.resize(frame.width, frame.height);
            media.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
            frame.insertChild(0, media);
            media.x = 0;
            media.y = 0;
            try {
              media.constraints = { horizontal: "SCALE", vertical: "SCALE" };
            } catch (e) {
            }
            frame.clipsContent = true;
            added++;
            addedMediaTarget = true;
          }
        } else if (existingMediaTarget && videoRect && existingMediaTarget !== videoRect) {
          const existingFills = getRectangleFills(existingMediaTarget);
          if (isSolidOnlyFill(existingFills)) {
            existingMediaTarget.name = "Media Target Placeholder";
            videoRect.name = "Media Target";
            try {
              videoRect.constraints = { horizontal: "SCALE", vertical: "SCALE" };
            } catch (e) {
            }
            frame.clipsContent = true;
            postDebugLog(
              "syncBriefings.ts:ensureMediaTargets:swapToVideoRect",
              "repointed media target from placeholder to legacy video rectangle",
              {
                frameName: frame.name,
                framePath: getDebugNodePath(frame),
                previousTargetName: existingMediaTarget.name,
                newTargetName: videoRect.name
              },
              "H4",
              debugActiveFixLayoutsRunId || "no-run"
            );
          }
        }
        recordFixLayoutsFrameReport(frame, hasMediaTarget, addedMediaTarget);
        return added;
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) added += ensureMediaTargets(child);
    }
    return added;
  }
  function fixAssetFrameRatios(node) {
    if (node.type === "FRAME") {
      const frame = node;
      const name = frame.name;
      if (name === "Assets" && frame.layoutMode === "HORIZONTAL") {
        if (frame.counterAxisSizingMode !== "AUTO") {
          frame.counterAxisSizingMode = "AUTO";
        }
        frame.clipsContent = false;
        const CANONICAL_ORDER = ["9x16", "4x5", "1x1"];
        const kids = [...frame.children];
        const sorted = kids.slice().sort((a, b) => {
          const aKey = CANONICAL_ORDER.findIndex((k) => a.name.toLowerCase().endsWith(k));
          const bKey = CANONICAL_ORDER.findIndex((k) => b.name.toLowerCase().endsWith(k));
          return (aKey === -1 ? 99 : aKey) - (bKey === -1 ? 99 : bKey);
        });
        for (let si = 0; si < sorted.length; si++) {
          frame.insertChild(si, sorted[si]);
        }
      }
      const assetFrameKey = getAssetFrameKey(frame);
      if (assetFrameKey) {
        const dim = ASSET_SIZES[assetFrameKey];
        if (Math.abs(frame.width - dim.w) > 1 || Math.abs(frame.height - dim.h) > 1) {
          frame.resize(dim.w, dim.h);
        }
        return;
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) fixAssetFrameRatios(child);
    }
  }
  function detectChildArrangement(frame) {
    const kids = frame.children.filter((c) => c.visible !== false);
    if (kids.length < 2) return "VERTICAL";
    const sortedY = [...kids].sort((a, b) => a.y - b.y);
    let vertPairs = 0;
    for (let i = 1; i < sortedY.length; i++) {
      if (sortedY[i].y >= sortedY[i - 1].y + sortedY[i - 1].height - 4) vertPairs++;
    }
    const sortedX = [...kids].sort((a, b) => a.x - b.x);
    let horizPairs = 0;
    for (let i = 1; i < sortedX.length; i++) {
      if (sortedX[i].x >= sortedX[i - 1].x + sortedX[i - 1].width - 4) horizPairs++;
    }
    const threshold = (kids.length - 1) * 0.6;
    if (vertPairs >= threshold) return "VERTICAL";
    if (horizPairs >= threshold) return "HORIZONTAL";
    return "NONE";
  }
  function medianChildSpacing(frame, dir) {
    const kids = frame.children.filter((c) => c.visible !== false);
    if (kids.length < 2) return 8;
    const sorted = [...kids].sort((a, b) => dir === "VERTICAL" ? a.y - b.y : a.x - b.x);
    const gaps = [];
    for (let i = 1; i < sorted.length; i++) {
      const gap = dir === "VERTICAL" ? sorted[i].y - (sorted[i - 1].y + sorted[i - 1].height) : sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
      if (gap >= 0) gaps.push(gap);
    }
    if (gaps.length === 0) return 8;
    gaps.sort((a, b) => a - b);
    return Math.round(gaps[Math.floor(gaps.length / 2)]);
  }
  function estimateFramePadding(frame) {
    const kids = frame.children.filter((c) => c.visible !== false);
    if (kids.length === 0) return { top: 0, left: 0, bottom: 0, right: 0 };
    let minX = Infinity, minY = Infinity, maxR = 0, maxB = 0;
    for (const k of kids) {
      minX = Math.min(minX, k.x);
      minY = Math.min(minY, k.y);
      maxR = Math.max(maxR, k.x + k.width);
      maxB = Math.max(maxB, k.y + k.height);
    }
    return {
      top: Math.max(0, Math.round(minY)),
      left: Math.max(0, Math.round(minX)),
      bottom: Math.max(0, Math.round(frame.height - maxB)),
      right: Math.max(0, Math.round(frame.width - maxR))
    };
  }
  function shouldSkipAutoLayout(frame) {
    const name = frame.name.toLowerCase();
    if (/\d+x\d+/.test(name)) return true;
    if (!frame.children || frame.children.length === 0) return true;
    if (frame.layoutMode !== "NONE") return false;
    return !frame.children.some((c) => c.type === "TEXT" || c.type === "FRAME" || c.type === "GROUP");
  }
  async function phaseFixTextNodes(node) {
    let count = 0;
    if (node.type === "TEXT") {
      const tn = node;
      if (tn.characters && tn.characters.trim().length > 0 && tn.textAutoResize !== "HEIGHT") {
        try {
          await loadFontsForTextNode(tn);
          tn.textAutoResize = "HEIGHT";
          count++;
        } catch (_) {
        }
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) {
        count += await phaseFixTextNodes(child);
      }
    }
    return count;
  }
  function phaseEnableAutoLayout(node, analysis) {
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) {
        phaseEnableAutoLayout(child, analysis);
      }
    }
    if (node.type !== "FRAME") return;
    const frame = node;
    if (frame.layoutMode !== "NONE") return;
    if (shouldSkipAutoLayout(frame)) {
      analysis.skippedFrames.push(frame.name);
      return;
    }
    const arrangement = detectChildArrangement(frame);
    if (arrangement === "NONE") {
      analysis.skippedFrames.push(frame.name);
      return;
    }
    const spacing = medianChildSpacing(frame, arrangement);
    const padding = estimateFramePadding(frame);
    const savedWidth = frame.width;
    const savedHeight = frame.height;
    const sorted = [...frame.children].sort(
      (a, b) => arrangement === "VERTICAL" ? a.y - b.y : a.x - b.x
    );
    for (let i = 0; i < sorted.length; i++) {
      frame.insertChild(i, sorted[i]);
    }
    frame.layoutMode = arrangement;
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    frame.counterAxisAlignItems = "MIN";
    frame.itemSpacing = Math.max(spacing, 4);
    frame.paddingTop = padding.top;
    frame.paddingBottom = Math.max(padding.bottom, 4);
    frame.paddingLeft = padding.left;
    frame.paddingRight = padding.right;
    if (arrangement === "VERTICAL") {
      frame.resize(savedWidth, frame.height);
    } else {
      frame.resize(frame.width, savedHeight);
    }
    analysis.framesConverted++;
  }
  function isColumnHeaderFrame(frame) {
    return frame.layoutMode === "HORIZONTAL" && /header$/i.test(frame.name);
  }
  function phaseEnsureHugContent(node, analysis) {
    if (node.type === "FRAME") {
      const frame = node;
      if (frame.layoutMode !== "NONE") {
        if (isColumnHeaderFrame(frame)) {
          if (frame.primaryAxisSizingMode !== "FIXED") {
            frame.primaryAxisSizingMode = "FIXED";
            analysis.framesHugged++;
          }
          if (frame.counterAxisSizingMode !== "AUTO") {
            frame.counterAxisSizingMode = "AUTO";
            analysis.framesHugged++;
          }
        } else {
          if (frame.primaryAxisSizingMode !== "AUTO") {
            frame.primaryAxisSizingMode = "AUTO";
            analysis.framesHugged++;
          }
          if (frame.layoutMode === "HORIZONTAL" && frame.counterAxisSizingMode !== "AUTO") {
            frame.counterAxisSizingMode = "AUTO";
            analysis.framesHugged++;
          }
        }
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) {
        phaseEnsureHugContent(child, analysis);
      }
    }
  }
  function phaseStretchChildren(node) {
    let count = 0;
    if (node.type === "FRAME") {
      const frame = node;
      if (frame.layoutMode === "VERTICAL") {
        for (let i = 0; i < frame.children.length; i++) {
          const child = frame.children[i];
          if (/\d+x\d+/.test(child.name)) continue;
          if (child.type === "FRAME" || child.type === "TEXT" || child.type === "GROUP") {
            try {
              if (child.layoutAlign !== "STRETCH") {
                child.layoutAlign = "STRETCH";
                count++;
              }
            } catch (_) {
            }
          }
        }
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) {
        count += phaseStretchChildren(child);
      }
    }
    return count;
  }
  function phaseDisableClipping(node) {
    let count = 0;
    if (node.type === "FRAME") {
      const frame = node;
      if (frame.layoutMode !== "NONE" && frame.clipsContent) {
        if (!/\d+x\d+/.test(frame.name)) {
          frame.clipsContent = false;
          count++;
        }
      }
    }
    const children = getTraversableChildren(node);
    if (children) {
      for (const child of children) {
        count += phaseDisableClipping(child);
      }
    }
    return count;
  }
  var TEMPLATE_LABEL_PATTERNS = /* @__PURE__ */ new Set([
    "briefing",
    "not started",
    "copy",
    "design",
    "uploads",
    "frontify",
    "variation a",
    "variation b",
    "variation c",
    "variation d",
    "in design copy",
    "headline:",
    "subline:",
    "cta:",
    "note:",
    "variants",
    "input visual + copy direction:",
    "script:"
  ]);
  var TEMPLATE_SUB_LABELS = /* @__PURE__ */ new Set(["input visual + copy direction:", "script:"]);
  async function phaseStyleTemplateLabels(node) {
    let count = 0;
    if (node.type === "TEXT") {
      const tn = node;
      const text = (tn.characters || "").trim();
      if (text.length > 0 && text.length <= 40 && !text.includes("\n")) {
        const lower = text.toLowerCase();
        if (TEMPLATE_SUB_LABELS.has(lower)) {
          await styleTemplateSubLabel(tn);
          count++;
        } else if (TEMPLATE_LABEL_PATTERNS.has(lower) || /^[A-D] - (image|video|static|carousel)$/i.test(text)) {
          await styleTemplateLabel(tn);
          count++;
        }
      }
    }
    const container = node;
    if (container.children) {
      for (const child of container.children) {
        count += await phaseStyleTemplateLabels(child);
      }
    }
    return count;
  }
  async function normalizeLayout(root) {
    const analysis = {
      textNodesFixed: 0,
      framesConverted: 0,
      framesHugged: 0,
      childrenStretched: 0,
      skippedFrames: []
    };
    analysis.textNodesFixed = await phaseFixTextNodes(root);
    phaseEnableAutoLayout(root, analysis);
    phaseEnsureHugContent(root, analysis);
    analysis.childrenStretched = phaseStretchChildren(root);
    phaseDisableClipping(root);
    await phaseStyleTemplateLabels(root);
    return analysis;
  }
  var debugLog = [];
  function findDocImagesTarget(page) {
    for (let i = 0; i < page.children.length; i++) {
      const node = page.children[i];
      if (node.type !== "FRAME") continue;
      const name = node.name.toLowerCase();
      if (name === "references" || name === "doc images") {
        return node;
      }
    }
    for (let i = 0; i < page.children.length; i++) {
      const node = page.children[i];
      if (node.type !== "FRAME") continue;
      const frame = node;
      for (let j = 0; j < frame.children.length; j++) {
        const child = frame.children[j];
        if (child.type !== "FRAME") continue;
        const childName = child.name.toLowerCase();
        if (childName === "references" || childName === "doc images") {
          return child;
        }
      }
    }
    return null;
  }
  function findUploadsBody(page) {
    const docImages = findDocImagesTarget(page);
    if (docImages) return docImages;
    console.warn("findUploadsBody: References/Doc Images frame not found on page", page.name);
    return null;
  }
  function createFallbackDocImagesTarget(page) {
    const frame = figma.createFrame();
    frame.name = "References";
    frame.layoutMode = "VERTICAL";
    frame.primaryAxisSizingMode = "AUTO";
    frame.counterAxisSizingMode = "FIXED";
    frame.counterAxisAlignItems = "MIN";
    frame.itemSpacing = 8 * S;
    frame.paddingTop = frame.paddingBottom = 8 * S;
    frame.paddingLeft = frame.paddingRight = 8 * S;
    frame.fills = [solidPaint(0.97, 0.97, 0.97)];
    frame.strokes = [solidPaint(0.88, 0.89, 0.92)];
    frame.strokeWeight = Math.max(1, S / 2);
    frame.cornerRadius = 6 * S;
    frame.clipsContent = false;
    frame.resize(280 * S, 60 * S);
    let x = 0;
    let y = 0;
    for (let i = 0; i < page.children.length; i++) {
      const child = page.children[i];
      if (child.type === "FRAME" && child.name === "Name Briefing") {
        x = child.x;
        y = child.y + child.height + 24 * S;
        break;
      }
    }
    frame.x = x;
    frame.y = y;
    page.appendChild(frame);
    return frame;
  }
  var REFERENCE_URL_REGEX = /https?:\/\/[^\s<>"'`]+/gi;
  var REFERENCE_PLACEHOLDER_PATTERNS = [
    "images from monday",
    "uploads placeholder",
    "references placeholder"
  ];
  function isReferencePlaceholderText(text) {
    const normalized = text.toLowerCase().trim();
    if (!normalized) return false;
    if (normalized === "frontify") return true;
    return REFERENCE_PLACEHOLDER_PATTERNS.some((p) => normalized.includes(p));
  }
  async function resolveUploadsBody(page) {
    let uploadsBody = findUploadsBody(page);
    if (!uploadsBody) {
      await new Promise((r) => setTimeout(r, 500));
      uploadsBody = findUploadsBody(page);
    }
    if (!uploadsBody) {
      uploadsBody = createFallbackDocImagesTarget(page);
    }
    return uploadsBody;
  }
  function alignUploadsBodyToPage(page, uploadsBody) {
    const nameBriefing = page.children.find(
      (c) => c.type === "FRAME" && c.name === "Name Briefing"
    );
    if (!nameBriefing) return;
    const gap = 24 * S;
    const columnsRow = nameBriefing.children.find(
      (c) => c.type === "FRAME" && c.name === "Columns"
    );
    const anchorY = columnsRow ? nameBriefing.y + columnsRow.y : nameBriefing.y;
    const wrapper = uploadsBody.parent;
    if (wrapper && wrapper.type === "FRAME" && wrapper !== page) {
      const wf = wrapper;
      wf.x = nameBriefing.x - wf.width - gap;
      wf.y = anchorY;
    } else {
      uploadsBody.x = nameBriefing.x - uploadsBody.width - gap;
      uploadsBody.y = anchorY;
    }
  }
  function clearUploadsPlaceholders(uploadsBody) {
    for (let i = uploadsBody.children.length - 1; i >= 0; i--) {
      const child = uploadsBody.children[i];
      if (child.type === "TEXT") {
        const text = child.characters.toLowerCase();
        if (isReferencePlaceholderText(text)) {
          child.remove();
        }
      } else if (child.type === "FRAME") {
        const block = child;
        let hasOnlyPlaceholder = true;
        for (let j = block.children.length - 1; j >= 0; j--) {
          const nested = block.children[j];
          if (nested.type === "TEXT") {
            const text = nested.characters.toLowerCase();
            if (isReferencePlaceholderText(text)) {
              nested.remove();
            } else {
              hasOnlyPlaceholder = false;
            }
          } else {
            hasOnlyPlaceholder = false;
          }
        }
        if (hasOnlyPlaceholder && block.children.length === 0) {
          block.remove();
        }
      }
    }
  }
  function normalizeReferenceUrl(url) {
    return url.trim().replace(/[)>.,;]+$/g, "");
  }
  function collectExistingReferenceUrls(root) {
    const urls = /* @__PURE__ */ new Set();
    function walk(node) {
      var _a;
      try {
        if ("getPluginData" in node && typeof node.getPluginData === "function") {
          const pluginUrl = normalizeReferenceUrl(node.getPluginData("heimdallReferenceUrl") || "");
          if (pluginUrl) urls.add(pluginUrl);
        }
      } catch (_) {
      }
      if (node.type === "TEXT") {
        const matches = (_a = (node.characters || "").match(REFERENCE_URL_REGEX)) != null ? _a : [];
        for (const match of matches) {
          const normalized = normalizeReferenceUrl(match);
          if (normalized) urls.add(normalized);
        }
      }
      const children = getTraversableChildren(node);
      if (!children) return;
      for (let i = 0; i < children.length; i++) {
        walk(children[i]);
      }
    }
    walk(root);
    return urls;
  }
  function isSupportedImageFormat(bytes) {
    if (bytes.length < 4) return false;
    const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const gif = bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70 && (bytes[3] === 56 || bytes[3] === 57);
    return png || jpeg || gif;
  }
  async function placeImageInUploads(uploadsBody, imageBytes, imageName) {
    if (!isSupportedImageFormat(imageBytes)) {
      const reason = "Unsupported format (use PNG/JPEG/GIF)";
      console.warn("Skipping:", imageName, reason);
      return { ok: false, reason };
    }
    try {
      const image = figma.createImage(imageBytes);
      const rect = figma.createRectangle();
      rect.name = imageName || "Briefing Image";
      const columnWidth = uploadsBody.width > 0 ? uploadsBody.width : 260;
      let thumbWidth = columnWidth;
      let thumbHeight = Math.round(columnWidth * 0.6);
      try {
        const size = await image.getSizeAsync();
        if (size.width > 0 && size.height > 0) {
          const scale = columnWidth / size.width;
          thumbHeight = Math.round(size.height * scale);
        }
      } catch (_) {
      }
      rect.resize(thumbWidth, thumbHeight);
      rect.fills = [{
        type: "IMAGE",
        imageHash: image.hash,
        scaleMode: "FIT"
      }];
      rect.cornerRadius = 4;
      uploadsBody.appendChild(rect);
      try {
        rect.layoutAlign = "STRETCH";
      } catch (_) {
      }
      return { ok: true };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Unknown error";
      console.error("Failed to place image:", imageName, e);
      return { ok: false, reason };
    }
  }
  async function placeReferenceLinkInUploads(uploadsBody, referenceLink) {
    var _a;
    const normalizedUrl = normalizeReferenceUrl(referenceLink.url || "");
    if (!normalizedUrl) {
      return { ok: false, reason: "Empty URL" };
    }
    try {
      await figma.loadFontAsync(TEMPLATE_FONT);
      await figma.loadFontAsync(TEMPLATE_FONT_BOLD);
      const block = makeBlockFrame();
      block.name = "Reference Link";
      try {
        block.setPluginData("heimdallReferenceUrl", normalizedUrl);
      } catch (_) {
      }
      const label = (referenceLink.label || "").trim();
      if (label && label !== normalizedUrl) {
        const labelText = makeTextNode("Reference Label", label, TEMPLATE_FONT_BOLD);
        labelText.fontSize = 11 * S;
        labelText.lineHeight = { unit: "PIXELS", value: 15 * S };
        appendAndStretch(block, labelText);
      }
      const urlText = makeTextNode("Reference URL", normalizedUrl, TEMPLATE_FONT);
      urlText.fontSize = 11 * S;
      urlText.lineHeight = { unit: "PIXELS", value: 15 * S };
      applyTextColor(urlText, 0.1, 0.38, 0.73);
      try {
        urlText.textDecoration = "UNDERLINE";
      } catch (_) {
      }
      try {
        (_a = urlText.setRangeHyperlink) == null ? void 0 : _a.call(urlText, 0, normalizedUrl.length, { type: "URL", value: normalizedUrl });
      } catch (_) {
      }
      appendAndStretch(block, urlText);
      uploadsBody.appendChild(block);
      try {
        block.layoutAlign = "STRETCH";
      } catch (_) {
      }
      return { ok: true };
    } catch (e) {
      const reason = e instanceof Error ? e.message : "Unknown error";
      console.error("Failed to place reference URL:", normalizedUrl, e);
      return { ok: false, reason };
    }
  }
  async function importReferenceLinksToPage(pageId, referenceLinks) {
    const failures = [];
    const page = await figma.getNodeByIdAsync(pageId);
    if (!page || page.type !== "PAGE") {
      console.warn("importReferenceLinksToPage: page not found or not a PAGE", pageId);
      return { placed: 0, failures };
    }
    const uploadsBody = await resolveUploadsBody(page);
    alignUploadsBodyToPage(page, uploadsBody);
    clearUploadsPlaceholders(uploadsBody);
    let placed = 0;
    const existingUrls = collectExistingReferenceUrls(uploadsBody);
    for (const link of referenceLinks) {
      const normalizedUrl = normalizeReferenceUrl(link.url || "");
      if (!normalizedUrl || existingUrls.has(normalizedUrl)) {
        continue;
      }
      const result = await placeReferenceLinkInUploads(uploadsBody, link);
      if (result.ok) {
        placed++;
        existingUrls.add(normalizedUrl);
      } else {
        failures.push({ url: normalizedUrl, reason: result.reason });
      }
    }
    return { placed, failures };
  }
  async function importImagesToPage(pageId, images) {
    const failures = [];
    const page = await figma.getNodeByIdAsync(pageId);
    if (!page || page.type !== "PAGE") {
      console.warn("importImagesToPage: page not found or not a PAGE", pageId);
      return { placed: 0, failures };
    }
    const uploadsBody = await resolveUploadsBody(page);
    alignUploadsBodyToPage(page, uploadsBody);
    clearUploadsPlaceholders(uploadsBody);
    let placed = 0;
    const existingImageNames = /* @__PURE__ */ new Set();
    for (let i = 0; i < uploadsBody.children.length; i++) {
      const child = uploadsBody.children[i];
      const name = (child.name || "").trim().toLowerCase();
      if (name) existingImageNames.add(name);
    }
    for (const img of images) {
      const dedupeName = (img.name || "Briefing Image").trim().toLowerCase();
      if (existingImageNames.has(dedupeName)) {
        continue;
      }
      const result = await placeImageInUploads(uploadsBody, img.bytes, img.name);
      if (result.ok) {
        placed++;
        existingImageNames.add(dedupeName);
      } else {
        failures.push({ name: img.name, reason: result.reason });
      }
    }
    return { placed, failures };
  }
  function scorePageContent(contentRoot) {
    function hasRichBriefingContent(chars) {
      const trimmed = chars.trim();
      if (!trimmed) return false;
      const normalized = trimmed.toUpperCase();
      const sectionSignals = [
        "IDEA:",
        "WHY:",
        "PRODUCT:",
        "VISUAL:",
        "COPY INFO:",
        "TEST:",
        "TESTING:"
      ];
      const sectionHits = sectionSignals.filter((signal) => normalized.includes(signal)).length;
      return sectionHits > 0 && trimmed.length >= 120;
    }
    var nameSet = false;
    var briefingSet = false;
    var variantsPopulated = 0;
    var briefingCharsSample = "";
    var variantSamples = [];
    function scan(node) {
      if (node.type === "TEXT") {
        var textNode = node;
        var chars = (textNode.characters || "").trim();
        var nodeName = (textNode.name || "").trim();
        var heimdallId = "";
        try {
          heimdallId = textNode.getPluginData("heimdallId") || textNode.getPluginData("placeholderId") || "";
        } catch (_) {
        }
        if (heimdallId === "heimdall:exp_name" && chars && chars !== "EXP-NAME" && chars !== "Name EXP") {
          nameSet = true;
        }
        if (nodeName === "Briefing Content") {
          if (!briefingCharsSample) briefingCharsSample = chars.substring(0, 180);
          if (chars && !chars.startsWith("IDEA:\nYour core creative idea.") && chars !== "Briefing Content" && hasRichBriefingContent(chars)) {
            briefingSet = true;
          }
        }
        var variantMatch = /^([A-D]) - Image$/i.exec(nodeName);
        if (variantMatch) {
          var letter = variantMatch[1].toUpperCase();
          var placeholder = letter + " - Image\nInput visual + copy direction:\nScript:";
          var counted = !!(chars && chars !== placeholder && chars !== nodeName);
          if (counted) {
            variantsPopulated++;
          }
          if (variantSamples.length < 6) {
            variantSamples.push({
              nodeName,
              charsSample: chars.substring(0, 120),
              counted
            });
          }
        }
      }
      var withChildren = node;
      if (withChildren.children) {
        for (var ci = 0; ci < withChildren.children.length; ci++) {
          scan(withChildren.children[ci]);
        }
      }
    }
    scan(contentRoot);
    return {
      nameSet,
      briefingSet,
      variantsPopulated,
      briefingCharsSample,
      variantSamples
    };
  }
  async function processJobs(jobs) {
    debugLog = [];
    var root = figma.root;
    var children = root.children || [];
    var templatePage = null;
    for (var i = 0; i < children.length; i++) {
      var node = children[i];
      if (node.type !== "PAGE") continue;
      var pageName = node.name;
      for (var j = 0; j < TEMPLATE_PAGE_NAMES.length; j++) {
        if (pageName.indexOf(TEMPLATE_PAGE_NAMES[j]) >= 0 || pageName === TEMPLATE_PAGE_NAMES[j]) {
          templatePage = node;
          break;
        }
      }
      if (templatePage) break;
    }
    if (templatePage && typeof templatePage.loadAsync === "function") {
      try {
        await templatePage.loadAsync();
      } catch (_) {
      }
    }
    if (!templatePage) {
      return jobs.map(function(job2) {
        return { idempotencyKey: job2.idempotencyKey, experimentPageName: job2.experimentPageName, pageId: "", fileUrl: "", error: "No template page found" };
      });
    }
    ensureCategoryPages(root, jobs);
    var fileKey = figma.fileKey || "";
    var results = [];
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      try {
        var briefing = job.briefingPayload;
        var targetPage = null;
        var createdNew = false;
        if (job.mondayItemId) {
          for (var e = 0; e < root.children.length; e++) {
            var existing = root.children[e];
            if (existing.type === "PAGE" && existing.getPluginData("heimdallMondayItemId") === job.mondayItemId) {
              targetPage = existing;
              break;
            }
          }
        }
        if (!targetPage) {
          for (var e = 0; e < root.children.length; e++) {
            var existing = root.children[e];
            if (existing.type === "PAGE" && existing.name === job.experimentPageName) {
              targetPage = existing;
              break;
            }
          }
        }
        if (!targetPage) {
          targetPage = templatePage.clone();
          targetPage.name = job.experimentPageName;
          createdNew = true;
        }
        if (targetPage && typeof targetPage.loadAsync === "function") {
          try {
            await targetPage.loadAsync();
          } catch (_) {
          }
        }
        targetPage.setPluginData("heimdallIdempotencyKey", job.idempotencyKey);
        targetPage.setPluginData("heimdallMondayItemId", job.mondayItemId || "");
        if (briefing.sectionName) {
          targetPage.setPluginData("heimdallSectionName", briefing.sectionName);
          if (createdNew) {
            var allPages = [];
            for (var k = 0; k < root.children.length; k++) {
              if (root.children[k].type === "PAGE") allPages.push(root.children[k]);
            }
            var insertAt = findSectionInsertionIndex(briefing.sectionName, allPages);
            if (insertAt >= 0 && insertAt < root.children.length) {
              root.insertChild(insertAt, targetPage);
            }
          }
        }
        var hasMapping = job.nodeMapping && job.nodeMapping.length > 0;
        var childCount = 0;
        var wc = targetPage;
        if (wc.children) childCount = wc.children.length;
        debugLog.push({
          nodeName: "__PLUGIN_META__",
          chars: "hasMapping=" + !!hasMapping + " mappingLen=" + (job.nodeMapping ? job.nodeMapping.length : 0) + " pageChildren=" + childCount + " pageName=" + targetPage.name + " createdNew=" + createdNew,
          path: [],
          matched: false
        });
        var contentRoot = targetPage;
        for (var ci = 0; ci < targetPage.children.length; ci++) {
          var child = targetPage.children[ci];
          if (child.type === "FRAME" && child.name === "Name Briefing") {
            contentRoot = child;
            break;
          }
        }
        var usedPlaceholderFallback = false;
        if (hasMapping) {
          var mappingEntries = [];
          for (var m = 0; m < job.nodeMapping.length; m++) {
            var key = job.nodeMapping[m].nodeName;
            var val = job.nodeMapping[m].value;
            mappingEntries.push({
              nodeName: key,
              normalizedNodeName: normalizeTextKey(key),
              value: val
            });
          }
          var mappedCount = await applyNodeMapping(contentRoot, mappingEntries, (job.frameRenames || []).slice());
          debugLog.push({
            nodeName: "__MAPPING_RESULT__",
            chars: "mappedCount=" + mappedCount + " totalEntries=" + mappingEntries.length,
            path: [],
            matched: mappedCount > 0
          });
          await fillTextNodes(contentRoot, briefing);
          usedPlaceholderFallback = true;
        } else {
          await fillTextNodes(contentRoot, briefing);
          usedPlaceholderFallback = true;
        }
        if (!hasMapping || usedPlaceholderFallback) {
          var layoutResult = await normalizeLayout(contentRoot);
          debugLog.push({
            nodeName: "__LAYOUT_NORM__",
            chars: "textFixed=" + layoutResult.textNodesFixed + " framesConverted=" + layoutResult.framesConverted + " framesHugged=" + layoutResult.framesHugged + " stretched=" + layoutResult.childrenStretched + " skipped=[" + layoutResult.skippedFrames.slice(0, 5).join(", ") + "]",
            path: [],
            matched: true
          });
        }
        if (job.referenceLinks && job.referenceLinks.length > 0) {
          await importReferenceLinksToPage(targetPage.id, job.referenceLinks);
        }
        var contentScore = scorePageContent(contentRoot);
        var contentEmpty = !contentScore.briefingSet && contentScore.variantsPopulated === 0;
        var pageId = targetPage.id;
        var fileUrl = "https://www.figma.com/file/" + fileKey + "?node-id=" + encodeURIComponent(pageId.replace(":", "-"));
        var outcome = createdNew ? "created" : "updated";
        results.push({ idempotencyKey: job.idempotencyKey, experimentPageName: job.experimentPageName, pageId, fileUrl, outcome, contentEmpty });
      } catch (e2) {
        var errMsg = e2 instanceof Error ? e2.message : "Unknown error";
        results.push({ idempotencyKey: job.idempotencyKey, experimentPageName: job.experimentPageName, pageId: "", fileUrl: "", error: errMsg });
      }
    }
    return results;
  }
  var uiHtml = '<html><head><style>body{font-family:Inter,sans-serif;padding:12px;margin:0;}h3{margin:0 0 8px 0;font-size:13px;}.tabs{display:flex;gap:0;margin:0 0 10px 0;border-bottom:1px solid #ddd;}.tab{width:auto!important;padding:8px 12px;border:none!important;border-radius:0!important;border-bottom:2px solid transparent!important;background:transparent!important;color:#666!important;cursor:pointer;font-size:11px;font-weight:600;}.tab:hover{background:#f6f7f9!important;color:#222!important;}.tab.active{background:transparent!important;color:#111!important;border-bottom-color:#0d99ff!important;}.row{display:flex;gap:8px;align-items:center;margin:8px 0;}.label{font-size:11px;color:#555;min-width:68px;}input{flex:1;padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;}button{padding:8px 16px;background:#0d99ff;color:#fff;border:none;border-radius:6px;cursor:pointer;width:100%;font-size:12px;}button:hover{background:#0b85e0;}.secondary{background:#fff;color:#333;border:1px solid #ddd;width:auto;padding:6px 10px;}.secondary:hover{background:#f6f6f6;}.outlined{background:transparent;color:#0d99ff;border:1.5px solid #0d99ff;}.outlined:hover{background:rgba(13,153,255,0.06);}.btn-row{display:flex;gap:8px;margin-top:8px;}.btn-row button{flex:1;}.small-row{display:flex;gap:8px;margin-top:6px;}.small-row button{flex:1;padding:5px 8px;font-size:10px;background:#fff;color:#555;border:1px solid #ddd;}.small-row button:hover{background:#f4f4f4;color:#333;}#msg{font-size:11px;color:#666;margin-top:8px;min-height:20px;}.err{color:#f24822;}.list{list-style:none;padding:0;margin:8px 0;max-height:220px;overflow-y:auto;}.list li{padding:6px 8px;margin:2px 0;background:#f6f6f6;border-radius:4px;font-size:11px;display:flex;justify-content:space-between;align-items:center;border-left:3px solid transparent;}.list li.new{border-left-color:#0d99ff;background:#f6f6f6;}.list li.synced{border-left-color:#0fa958;background:linear-gradient(90deg,#e8f5e9 0%,#f1f8f2 100%);color:#666;}.badge{font-size:9px;padding:2px 6px;border-radius:4px;background:#0d99ff;color:#fff;white-space:nowrap;}.badge.synced{background:#0fa958;}.badge.new{background:#888;}select{padding:6px 8px;border:1px solid #ddd;border-radius:6px;font-size:11px;min-width:140px;}.list li label{display:flex;align-items:center;gap:6px;flex:1;cursor:pointer;min-width:0;}.list li label input[type=checkbox]{margin:0;flex-shrink:0;}.list li label span.item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.list li .badge-group{display:flex;align-items:center;gap:4px;flex-shrink:0;}.overwrite-btn{background:none;border:none;padding:2px 4px;cursor:pointer;font-size:11px;color:#999;width:auto;}.overwrite-btn:hover{color:#f24822;}.overwrite-btn.active{color:#f24822;font-weight:600;}.select-bar{display:flex;justify-content:space-between;align-items:center;margin:4px 0;font-size:10px;color:#666;}.select-bar a{color:#0d99ff;cursor:pointer;text-decoration:none;font-size:10px;}.select-bar a:hover{text-decoration:underline;}.list li.exists{border-left-color:#f5a623;background:linear-gradient(90deg,#fef9ef 0%,#fefcf6 100%);}.badge.exists{background:#f5a623;}.list li.populated{border-left-color:#0fa958;background:linear-gradient(90deg,#e8f5e9 0%,#f1f8f2 100%);color:#666;}.badge.populated{background:#0fa958;}.list li.empty-import{border-left-color:#f24822;background:linear-gradient(90deg,#fdecea 0%,#fef5f3 100%);}.badge.empty-import{background:#f24822;}</style></head><body><div class="tabs"><button class="tab active" id="tab-sync">Sync Briefings</button><button class="tab" id="tab-comments">Export Comments</button></div><h3>Heimdall Sync</h3><div class="row"><span class="label">API base</span><input id="api-base" placeholder=' + JSON.stringify(DEFAULT_HEIMDALL_API) + ' /><button class="secondary" id="save-api">Save</button></div><div class="row"><span class="label">Plugin token</span><input id="plugin-token" type="password" placeholder="(required)" style="font-size:9px;" /><button class="secondary" id="save-token">Save</button></div><div class="row"><span class="label">Vercel bypass</span><input id="vercel-bypass" placeholder="(optional)" style="font-size:9px;" /><button class="secondary" id="save-bypass">Save</button></div><div id="sync-panel">  <div id="batch-select-wrap" style="display:none;"><span class="label">Batch</span><select id="batch-select"></select><button class="secondary" id="batch-apply">Apply</button></div>  <p id="batch-label" style="margin:4px 0;font-size:12px;font-weight:600;"></p>  <ul id="briefings-list" class="list"></ul>  <p id="msg" style="margin:8px 0;min-height:20px;font-size:11px;color:#666;"></p>  <div class="btn-row"><button id="load-briefings" class="outlined">Load Briefings</button></div>  <div class="btn-row"><button id="sync">Sync</button><button id="create-template" class="outlined">Create Template</button></div>  <div class="small-row"><button id="migrate-widgets">Migrate Status Widgets</button><button id="fix-layouts">Fix Layouts</button></div></div><script>parent.postMessage({ pluginMessage: { type: "ui-boot" } }, "*");window.onerror = function(message, source, lineno, colno) {  parent.postMessage({ pluginMessage: { type: "ui-script-error", message: String(message || ""), source: String(source || ""), lineno: Number(lineno || 0), colno: Number(colno || 0) } }, "*");};window.addEventListener("unhandledrejection", function(ev) {  var reason = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : "unknown";  parent.postMessage({ pluginMessage: { type: "ui-script-rejection", reason: String(reason) } }, "*");});var DEFAULT_HEIMDALL_API = ' + JSON.stringify(DEFAULT_HEIMDALL_API) + ';var HEIMDALL_API = DEFAULT_HEIMDALL_API;var fileKey = "";var fileName = "";var isSyncing = false;var currentBriefings = [];var queuedJobIds = [];var existingPageNames = [];var existingPageSummaries = [];var existingPageNameSet = {};var existingMondayItemIdSet = {};var pendingResults = null;var pageContentStatusMap = {};var pageContentStatusByNameMap = {};var pageScoreDebugMap = {};function sanitizeApiBase(raw) {  var v = (raw || "").trim();  if (!v) return DEFAULT_HEIMDALL_API;  return v.replace(/\\/$/, "");}function setApiBase(raw) {  HEIMDALL_API = sanitizeApiBase(raw);  var input = document.getElementById("api-base");  if (input) input.value = HEIMDALL_API;}var DEFAULT_PLUGIN_TOKEN = ' + JSON.stringify(DEFAULT_PLUGIN_TOKEN) + ";var DEFAULT_VERCEL_BYPASS = " + JSON.stringify(DEFAULT_VERCEL_BYPASS) + `;var PLUGIN_TOKEN = DEFAULT_PLUGIN_TOKEN;function setPluginToken(t) { PLUGIN_TOKEN = (t || "").trim() || DEFAULT_PLUGIN_TOKEN; var el = document.getElementById("plugin-token"); if (el && PLUGIN_TOKEN) el.value = PLUGIN_TOKEN; }var VERCEL_BYPASS = DEFAULT_VERCEL_BYPASS;function setVercelBypass(v) { VERCEL_BYPASS = (v || "").trim() || DEFAULT_VERCEL_BYPASS; var el = document.getElementById("vercel-bypass"); if (el) el.value = VERCEL_BYPASS; }function stampUrl(url) {  if (!VERCEL_BYPASS) return url;  var sep = url.indexOf("?") >= 0 ? "&" : "?";  return url + sep + "x-vercel-protection-bypass=" + encodeURIComponent(VERCEL_BYPASS);}function authHeaders(extra) {  var h = extra || {};  if (PLUGIN_TOKEN) h["X-Heimdall-Plugin-Token"] = PLUGIN_TOKEN;  return h;}function hintForHttpStatus(status) {  if (status === 401) return " Often means Vercel Deployment Protection (or similar) is blocking unauthenticated API calls from the plugin. In Vercel: allow the deployment used as API base to serve /api/* without browser login, or point the plugin at an unprotected production URL.";  if (status === 403) return " Machine auth failed: save the Plugin Token in Settings (must match HEIMDALL_PLUGIN_SECRET on the server).";  if (status === 503) return " Server not ready: HEIMDALL_PLUGIN_SECRET or HEIMDALL_MACHINE_SECRET may be missing on Vercel.";  return "";}function requestJson(url, options) {  url = stampUrl(url);  options = options || {};  options.headers = authHeaders(options.headers || {});  return fetch(url, options).then(function(r) {    var status = r.status;    var contentType = (r.headers.get("content-type") || "").toLowerCase();    return r.text().then(function(t) {      var raw = t || "";      var parsed = null;      if (raw) {        try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }      }      if (!r.ok) {        var err = parsed && (parsed.error || parsed.reason) ? (parsed.error || parsed.reason) : ("HTTP " + status);        err += hintForHttpStatus(status);        throw new Error(err + " @ " + url);      }      if (parsed !== null) return parsed;      var preview = raw.slice(0, 80).replace(/\\s+/g, " ");      var htmlHint = /<\\s*html/i.test(raw) ? " Body looks like HTML (login or error page), not Heimdall JSON." : "";      throw new Error("Expected JSON but got non-JSON response @ " + url + " (status " + status + ", content-type: " + contentType + ", body: " + preview + ")" + htmlHint);    });  }).catch(function(e) {    var msg = e && e.message ? String(e.message) : String(e);    if (e && e.name === "TypeError" && (/Failed to fetch|NetworkError|fetch|load failed/i.test(msg))) {      throw new Error("Network error reaching " + url + ". Check API base URL, Figma manifest allowedDomains, and that the host is reachable without browser-only auth. (" + msg + ")");    }    throw e;  });}document.getElementById("save-api").onclick = function() {  var input = document.getElementById("api-base");  setApiBase(input ? input.value : "");  parent.postMessage({ pluginMessage: { type: "save-api-base", apiBase: HEIMDALL_API } }, "*");  document.getElementById("msg").textContent = "Saved API base: " + HEIMDALL_API;  document.getElementById("msg").className = "";};document.getElementById("save-token").onclick = function() {  var input = document.getElementById("plugin-token");  setPluginToken(input ? input.value : "");  parent.postMessage({ pluginMessage: { type: "save-plugin-token", token: PLUGIN_TOKEN } }, "*");  document.getElementById("msg").textContent = PLUGIN_TOKEN ? "Saved plugin token." : "Cleared plugin token.";  document.getElementById("msg").className = "";};document.getElementById("load-briefings").onclick = function() {  fetchBriefings(null);};document.getElementById("tab-comments").onclick = function() {  parent.postMessage({ pluginMessage: { type: "open-export-comments" } }, "*");};document.getElementById("create-template").onclick = function() {  document.getElementById("msg").textContent = "Creating template...";  document.getElementById("msg").className = "";  parent.postMessage({ pluginMessage: { type: "create-template" } }, "*");};document.getElementById("migrate-widgets").onclick = function() {  document.getElementById("msg").textContent = "Migrating status widgets...";  document.getElementById("msg").className = "";  parent.postMessage({ pluginMessage: { type: "migrate-widgets" } }, "*");};document.getElementById("fix-layouts").onclick = function() {  document.getElementById("msg").textContent = "Fixing layouts...";  document.getElementById("msg").className = "";  parent.postMessage({ pluginMessage: { type: "fix-layouts" } }, "*");};function normalizeBriefingName(name) {  return String(name || "").toLowerCase().replace(/\\s+/g, " ").trim();}function rebuildExistingLookupSets(existingMondayItemIds) {  existingPageNameSet = {};  for (var i = 0; i < existingPageNames.length; i++) {    var normalizedPage = normalizeBriefingName(existingPageNames[i]);    if (normalizedPage) existingPageNameSet[normalizedPage] = true;  }  existingMondayItemIdSet = {};  for (var j = 0; j < existingMondayItemIds.length; j++) {    var id = String(existingMondayItemIds[j] || "").trim();    if (id) existingMondayItemIdSet[id] = true;  }}function briefingExistsInFigma(item) {  var itemId = item && item.id != null ? String(item.id).trim() : "";  if (itemId && existingMondayItemIdSet[itemId]) return true;  var needle = normalizeBriefingName(item && item.name ? item.name : "");  if (!needle) return false;  return !!existingPageNameSet[needle];}function classifyBriefing(item) {  var itemId = item && item.id != null ? String(item.id).trim() : "";  var hasMondayId = itemId && existingMondayItemIdSet[itemId];  var needle = normalizeBriefingName(item && item.name ? item.name : "");  var hasPageName = needle && !!existingPageNameSet[needle];  if (!hasMondayId && !hasPageName) return "new";  if (hasMondayId && pageContentStatusMap[itemId] === "populated") return "populated";  if (hasMondayId && pageContentStatusMap[itemId] === "empty") return "empty-import";  if (hasPageName && pageContentStatusByNameMap[needle] === "populated") return "populated";  if (hasPageName && pageContentStatusByNameMap[needle] === "empty") return "empty-import";  return "exists";}function updateSyncBtnCount() {  var checked = document.querySelectorAll("#briefings-list input[type=checkbox]:checked");  var btn = document.getElementById("sync");  btn.textContent = checked.length > 0 ? "Sync " + checked.length + " briefing(s)" : "Sync";  btn.disabled = checked.length === 0;}function showBriefings(data) {  currentBriefings = data.items || [];  var listEl = document.getElementById("briefings-list");  listEl.innerHTML = "";  var batchLabel = document.getElementById("batch-label");  batchLabel.textContent = data.batchLabel ? (data.batchLabel + " (" + currentBriefings.length + ")") : "";  var selectBar = document.getElementById("select-bar");  if (!selectBar) {    selectBar = document.createElement("div");    selectBar.id = "select-bar";    selectBar.className = "select-bar";    listEl.parentNode.insertBefore(selectBar, listEl);  }  selectBar.innerHTML = "<span></span><span><a id=\\"select-all\\">Select all</a> | <a id=\\"deselect-all\\">Deselect all</a></span>";  for (var i = 0; i < currentBriefings.length; i++) {    var it = currentBriefings[i];    var classification = classifyBriefing(it);    var exists = classification !== "new";    it._exists = exists;    it._classification = classification;    it._overwrite = false;    var li = document.createElement("li");    li.className = classification !== "new" ? classification : (it.syncState || "new");    li.setAttribute("data-idx", String(i));    var lbl = document.createElement("label");    var cb = document.createElement("input");    cb.type = "checkbox";    cb.checked = classification === "new" || classification === "empty-import";    cb.disabled = classification === "populated";    cb.setAttribute("data-idx", String(i));    cb.onchange = function() { updateSyncBtnCount(); };    lbl.appendChild(cb);    var nameSpan = document.createElement("span");    nameSpan.className = "item-name";    nameSpan.textContent = it.name;    lbl.appendChild(nameSpan);    li.appendChild(lbl);    var badgeGroup = document.createElement("span");    badgeGroup.className = "badge-group";    if (classification === "populated" || classification === "exists") {      var owBtn = document.createElement("button");      owBtn.className = "overwrite-btn";      owBtn.title = "Enable overwrite";      owBtn.textContent = "\\u21bb";      owBtn.setAttribute("data-idx", String(i));      owBtn.onclick = (function(idx, owBtnRef, cbRef) { return function(e) {        e.preventDefault();        var item = currentBriefings[idx];        item._overwrite = !item._overwrite;        owBtnRef.className = item._overwrite ? "overwrite-btn active" : "overwrite-btn";        cbRef.disabled = !item._overwrite;        if (item._overwrite) { cbRef.checked = true; } else { cbRef.checked = false; }        updateSyncBtnCount();      }; })(i, owBtn, cb);      badgeGroup.appendChild(owBtn);    }    var badge = document.createElement("span");    var badgeClass = "new"; var badgeLabel = "New";    if (classification === "populated") { badgeClass = "populated"; badgeLabel = "\\u2713 Working"; }    else if (classification === "empty-import") { badgeClass = "empty-import"; badgeLabel = "\\u26A0 Empty"; }    else if (classification === "exists") { badgeClass = "exists"; badgeLabel = "Exists"; }    else if (it.syncState === "synced") { badgeClass = "synced"; badgeLabel = "\\u2713 Synced"; }    badge.className = "badge " + badgeClass;    badge.textContent = badgeLabel;    badgeGroup.appendChild(badge);    li.appendChild(badgeGroup);    listEl.appendChild(li);  }  document.getElementById("select-all").onclick = function() {    var cbs = listEl.querySelectorAll("input[type=checkbox]");    for (var j = 0; j < cbs.length; j++) { if (!cbs[j].disabled) cbs[j].checked = true; }    updateSyncBtnCount();  };  document.getElementById("deselect-all").onclick = function() {    var cbs = listEl.querySelectorAll("input[type=checkbox]");    for (var j = 0; j < cbs.length; j++) { cbs[j].checked = false; }    updateSyncBtnCount();  };  updateSyncBtnCount();  document.getElementById("msg").textContent = currentBriefings.length === 0 ? "No briefings match this batch and filters." : "";  document.getElementById("msg").className = "";}function fetchBriefings(selectedBatch) {  document.getElementById("msg").textContent = "Loading briefings...";  document.getElementById("msg").className = "";  var body = { fileName: fileName, fileKey: fileKey };  if (existingPageSummaries.length > 0) body.pages = existingPageSummaries;  if (selectedBatch) body.batch = selectedBatch;  requestJson(HEIMDALL_API + "/api/plugin/briefings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })    .then(function(data) {      if (data.needsBatchSelection && data.availableBatches && data.availableBatches.length > 0) {        document.getElementById("batch-select-wrap").style.display = "flex";        document.getElementById("batch-select-wrap").className = "row";        var sel = document.getElementById("batch-select");        sel.innerHTML = "";        var labels = data.batchLabels || data.availableBatches;        for (var i = 0; i < data.availableBatches.length; i++) {          var opt = document.createElement("option");          opt.value = data.availableBatches[i];          opt.textContent = labels[i] || data.availableBatches[i];          sel.appendChild(opt);        }        document.getElementById("batch-label").textContent = "";        document.getElementById("briefings-list").innerHTML = "";        document.getElementById("msg").textContent = "Select a batch to show briefings.";        return;      }      document.getElementById("batch-select-wrap").style.display = "none";      if (data.error) { document.getElementById("msg").textContent = data.error; document.getElementById("msg").className = "err"; return; }      showBriefings(data);    })    .catch(function(e) {      document.getElementById("msg").textContent = "Error: " + e.message;      document.getElementById("msg").className = "err";    });}document.getElementById("batch-apply").onclick = function() {  var sel = document.getElementById("batch-select");  fetchBriefings(sel && sel.value ? sel.value : null);};document.getElementById("sync").onclick = function() {  if (isSyncing) return;  if (currentBriefings.length === 0) {    document.getElementById("msg").textContent = "No briefings loaded yet. Wait for load or check API base/filters.";    document.getElementById("msg").className = "err";    return;  }  isSyncing = true;  document.getElementById("msg").textContent = "Queueing briefings...";  document.getElementById("sync").disabled = true;  var cbs = document.querySelectorAll("#briefings-list input[type=checkbox]:checked");  var selectedIdxs = [];  for (var ci = 0; ci < cbs.length; ci++) selectedIdxs.push(parseInt(cbs[ci].getAttribute("data-idx"), 10));  var items = selectedIdxs.map(function(idx){ var it = currentBriefings[idx]; return { id: it.id, name: it.name, batch: it.batch }; });  if (items.length === 0) {    document.getElementById("msg").textContent = "No briefings selected.";    isSyncing = false;    document.getElementById("sync").disabled = false;    return;  }  requestJson(HEIMDALL_API + "/api/plugin/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileKey: fileKey || "", fileName: fileName || "", items: items }) })    .then(function(data) {      if (data.error) { document.getElementById("msg").textContent = data.error; document.getElementById("msg").className = "err"; isSyncing = false; document.getElementById("sync").disabled = false; return; }      queuedJobIds = (data.jobs || []).map(function(j){ return j.id; });      document.getElementById("msg").textContent = "Queued " + (data.queued || 0) + ". Fetching jobs...";      var q = "";      if (queuedJobIds.length > 0) q = "ids=" + queuedJobIds.map(function(id){ return encodeURIComponent(id); }).join(",");      else if (fileKey) q = "fileKey=" + encodeURIComponent(fileKey);      else if (items.length > 0 && items[0].batch) q = "batch=" + encodeURIComponent(items[0].batch);      return requestJson(HEIMDALL_API + "/api/jobs/queued" + (q ? ("?" + q) : ""));    })    .then(function(data2) {      var jobs = (data2 && data2.jobs) ? data2.jobs : [];      if (jobs.length === 0) { document.getElementById("msg").textContent = "No jobs returned. Try again in a moment."; isSyncing = false; document.getElementById("sync").disabled = false; return; }      document.getElementById("msg").textContent = "Creating " + jobs.length + " page(s)...";      parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: jobs } }, "*");    })    .catch(function(e) {      isSyncing = false;      document.getElementById("sync").disabled = false;      document.getElementById("msg").textContent = "Error: " + e.message;      document.getElementById("msg").className = "err";    });};parent.postMessage({ pluginMessage: { type: "ui-handlers-bound" } }, "*");function fetchJobs(fk) {  fileKey = fk;  requestJson(HEIMDALL_API + "/api/jobs/queued?fileKey=" + encodeURIComponent(fk))    .then(function(data) {      var jobs = data.jobs || [];      if (jobs.length === 0) {        document.getElementById("msg").textContent = "No file-specific jobs. Checking all queued...";        return requestJson(HEIMDALL_API + "/api/jobs/queued").then(function(d2){          var all = d2.jobs || [];          if (all.length === 0) { document.getElementById("msg").textContent = "No queued jobs."; isSyncing = false; return; }          document.getElementById("msg").textContent = "Found " + all.length + " job(s). Creating pages...";          parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: all } }, "*");        });      }      document.getElementById("msg").textContent = "Found " + jobs.length + " job(s). Creating pages...";      parent.postMessage({ pluginMessage: { type: "process-jobs", jobs: jobs } }, "*");    })    .catch(function(e) {      isSyncing = false;      document.getElementById("msg").textContent = "Fetch error: " + e.message;      document.getElementById("msg").className = "err";    });}function reportResults(results, imageLine) {  var done = 0; var updated = 0; var failed = [];  var promises = [];  for (var i = 0; i < results.length; i++) {    var r = results[i];    if (r.error) {      failed.push(r.experimentPageName);      promises.push(fetch(stampUrl(HEIMDALL_API + "/api/jobs/fail"), { method: "POST", headers: authHeaders({"Content-Type":"application/json"}), body: JSON.stringify({idempotencyKey: r.idempotencyKey, errorCode: r.error}) }).catch(function(){}));    } else if (r.contentEmpty) {      failed.push(r.experimentPageName + " (empty)");      promises.push(fetch(stampUrl(HEIMDALL_API + "/api/jobs/fail"), { method: "POST", headers: authHeaders({"Content-Type":"application/json"}), body: JSON.stringify({idempotencyKey: r.idempotencyKey, errorCode: "content_empty"}) }).catch(function(){}));    } else {      if (r.outcome === "updated") updated++; else done++;      promises.push(fetch(stampUrl(HEIMDALL_API + "/api/jobs/complete"), { method: "POST", headers: authHeaders({"Content-Type":"application/json"}), body: JSON.stringify({idempotencyKey: r.idempotencyKey, figmaPageId: r.pageId, figmaFileUrl: r.fileUrl, outcome: r.outcome || "created"}) }).catch(function(){}));    }  }  Promise.all(promises).then(function() {    isSyncing = false;    var syncBtn = document.getElementById("sync");    if (syncBtn) syncBtn.disabled = false;    var el = document.getElementById("msg");    var msg = "Done: " + done + " created"; if (updated > 0) msg += ", " + updated + " updated"; msg += "."; if (failed.length) msg += " Failed: " + failed.join(", ");    if (imageLine) msg += " | " + imageLine;    el.textContent = msg;    el.className = failed.length ? "err" : "";  });}function fetchAllImages(images) {  var el = document.getElementById("msg");  el.textContent = "Fetching " + images.length + " image(s) from Monday...";  el.className = "";  var results = [];  var fetchFailures = [];  var done = 0;  function next(i) {    if (i >= images.length) {      el.textContent = "Images fetched: " + results.length + " ok, " + fetchFailures.length + " failed. Importing...";      parent.postMessage({ pluginMessage: { type: "images-fetched", images: results, imageCount: images.length, fetchFailures: fetchFailures } }, "*");      return;    }    var img = images[i];    el.textContent = "Fetching image " + (i + 1) + "/" + images.length + ": " + img.name;    var fetchUrl = stampUrl(img.assetId ? (HEIMDALL_API + "/api/images/proxy?assetId=" + encodeURIComponent(img.assetId)) : (HEIMDALL_API + "/api/images/proxy?url=" + encodeURIComponent(img.url || "")));    function doFetch(attempt) {      fetch(fetchUrl)        .then(function(r) {          if (!r.ok) { var errBody = r.status + " " + (r.statusText || ""); return r.json().then(function(j){ throw new Error(j.error || j.reason || errBody); }, function(){ throw new Error(errBody); }); }          return r.arrayBuffer();        })        .then(function(buf) {          if (buf && buf.byteLength > 0) results.push({ url: img.url, name: img.name, pageId: img.pageId, bytes: Array.from(new Uint8Array(buf)) });          else fetchFailures.push({ name: img.name, reason: "Empty response" });          done++; next(i + 1);        })        .catch(function(err) {          if (attempt < 2) { setTimeout(function() { doFetch(attempt + 1); }, 500); }          else { var reason = err && err.message ? err.message : String(err); fetchFailures.push({ name: img.name, reason: reason }); console.warn("Image fetch failed:", img.name, reason); done++; next(i + 1); }        });    }    doFetch(1);  }  next(0);}onmessage = function(e) {  var d = typeof e.data === "object" && e.data.pluginMessage ? e.data.pluginMessage : e.data;  if (d.type === "context") {    fileKey = d.fileKey || "";    fileName = d.fileName || "";    existingPageNames = Array.isArray(d.existingPages) ? d.existingPages : [];    existingPageSummaries = Array.isArray(d.existingPageSummaries) ? d.existingPageSummaries : [];    pageContentStatusMap = d.pageContentStatus || {};    pageContentStatusByNameMap = d.pageContentStatusByName || {};    pageScoreDebugMap = d.pageScoreDebug || {};    rebuildExistingLookupSets(Array.isArray(d.existingMondayItemIds) ? d.existingMondayItemIds : []);    var scoreSample = Object.keys(pageScoreDebugMap).slice(0,6).map(function(id){ return { id:id, debug: pageScoreDebugMap[id] }; });    fetchBriefings(null);    if (!fileKey) document.getElementById("msg").textContent = "File key unavailable in this context. Continuing with batch-based sync.";  }  if (d.type === "file-key") {    fetchJobs(d.fileKey);  }  if (d.type === "progress") {    document.getElementById("msg").textContent = "Creating page " + d.current + "/" + d.total + ": " + (d.name || "");  }  if (d.type === "jobs-processed") {    if (d.hasImages) {      pendingResults = d.results;      document.getElementById("msg").textContent = "Pages created. Importing images...";    } else {      reportResults(d.results);    }  }  if (d.type === "api-base") setApiBase(d.apiBase || DEFAULT_HEIMDALL_API);  if (d.type === "plugin-token") { setPluginToken(d.token || ""); var ti = document.getElementById("plugin-token"); if (ti) ti.value = d.token || ""; }  if (d.type === "vercel-bypass") setVercelBypass(d.secret || "");  if (d.type === "create-template-done") {    var el = document.getElementById("msg");    el.textContent = d.error ? "Template error: " + d.error : "Template created. Place the 'Custom Labels - Status Tracker' widget in each column header (Briefing, Copy, Design).";    el.className = d.error ? "err" : "";  }  if (d.type === "migrate-widgets-done") {    var el = document.getElementById("msg");    if (d.error) { el.textContent = "Migrate error: " + d.error; el.className = "err"; }    else { el.textContent = "Migrated: " + (d.pagesMigrated || 0) + " pages, skipped: " + (d.pagesSkipped || 0) + (d.pagesFailed ? ", failed: " + d.pagesFailed : ""); el.className = ""; }  }  if (d.type === "fetch-images" && d.images && d.images.length > 0) {    fetchAllImages(d.images);  }  if (d.type === "images-import-done") {    var line = "Images: " + d.placed + "/" + d.total + " placed in Figma.";    var fetchFailures = d.fetchFailures || [];    var failures = d.failures || [];    if (fetchFailures.length || failures.length) {      line += " Failed: ";      var parts = [];      for (var i = 0; i < fetchFailures.length; i++) parts.push(fetchFailures[i].name + " (fetch: " + fetchFailures[i].reason + ")");      for (var j = 0; j < failures.length; j++) parts.push(failures[j].name + " (" + failures[j].reason + ")");      line += parts.join("; ");    }    if (pendingResults) {      reportResults(pendingResults, line);      pendingResults = null;    } else {      var el = document.getElementById("msg");      var prev = el.textContent || "";      el.textContent = prev ? (prev + " | " + line) : line;      if (fetchFailures.length || failures.length) el.className = "err";    }  }  if (d.type === "fix-layouts-done") {    var el = document.getElementById("msg");    if (d.error) { el.textContent = "Error: " + d.error; el.className = "err"; }    else { el.textContent = "Fixed " + (d.pagesFixed || 0) + " page(s), skipped " + (d.pagesSkipped || 0) + "."; el.className = ""; }  }  if (d.type === "debug-log") {    var el = document.getElementById("msg");    el.style.whiteSpace = "pre-wrap";    el.style.fontSize = "9px";    el.style.maxHeight = "300px";    el.style.overflow = "auto";    el.textContent = d.text;  }};document.getElementById("save-bypass").onclick = function() {  var input = document.getElementById("vercel-bypass");  setVercelBypass(input ? input.value : "");  parent.postMessage({ pluginMessage: { type: "save-vercel-bypass", secret: VERCEL_BYPASS } }, "*");  document.getElementById("msg").textContent = VERCEL_BYPASS ? "Saved Vercel bypass secret." : "Cleared Vercel bypass secret.";  document.getElementById("msg").className = "";};parent.postMessage({ pluginMessage: { type: "get-api-base" } }, "*");parent.postMessage({ pluginMessage: { type: "get-plugin-token" } }, "*");parent.postMessage({ pluginMessage: { type: "get-vercel-bypass" } }, "*");<\/script></body></html>`;
  function serializePageSnapshot(page) {
    function serializeNode(node, depth) {
      var _a;
      const out = {
        id: node.id,
        name: node.name,
        type: node.type
      };
      if (node.type === "TEXT") {
        out.characters = ((_a = node.characters) != null ? _a : "").substring(0, 500);
      }
      if (depth < 4) {
        const children = getTraversableChildren(node);
        if (children) {
          out.children = Array.from(children).map((c) => serializeNode(c, depth + 1));
        }
      }
      return out;
    }
    return {
      pageId: page.id,
      pageName: page.name,
      childCount: page.children.length,
      children: Array.from(page.children).map((c) => serializeNode(c, 0)),
      pluginData: {
        heimdallMondayItemId: page.getPluginData("heimdallMondayItemId") || null,
        heimdallBoardId: page.getPluginData("heimdallBoardId") || null
      }
    };
  }
  async function getPluginToken() {
    const saved = await figma.clientStorage.getAsync("heimdallPluginToken");
    return typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_PLUGIN_TOKEN;
  }
  async function getVercelBypass() {
    const saved = await figma.clientStorage.getAsync("heimdallVercelBypass");
    return typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_VERCEL_BYPASS;
  }
  function stampUrlMain(url, bypass) {
    if (!bypass) return url;
    const sep = url.includes("?") ? "&" : "?";
    return url + sep + "x-vercel-protection-bypass=" + encodeURIComponent(bypass);
  }
  async function capturePreWriteSnapshot(apiBase, page, operationKind, mondayItemId, mondayBoardId) {
    try {
      const figmaFileKey = figma.fileKey || "";
      if (!figmaFileKey) return;
      const snapshot = serializePageSnapshot(page);
      const itemId = mondayItemId || page.getPluginData("heimdallMondayItemId") || page.name;
      const boardId = mondayBoardId || page.getPluginData("heimdallBoardId") || "";
      const pluginToken = await getPluginToken();
      const bypass = await getVercelBypass();
      const headers = { "Content-Type": "application/json" };
      if (pluginToken) headers["X-Heimdall-Plugin-Token"] = pluginToken;
      await fetch(stampUrlMain(apiBase + "/api/plugin/capture-version", bypass), {
        method: "POST",
        headers,
        body: JSON.stringify({
          mondayItemId: itemId,
          mondayBoardId: boardId,
          figmaFileKey,
          figmaPageId: page.id,
          figmaPageName: page.name,
          capturePhase: "pre_write",
          operationKind,
          source: "plugin_sync",
          pageSnapshot: snapshot
        })
      });
    } catch (e) {
    }
  }
  function runSyncBriefings() {
    figma.showUI(uiHtml, { width: 460, height: 580 });
    if (!debugSelectionListenerBound) {
      debugSelectionListenerBound = true;
      figma.on("selectionchange", () => {
        if (debugSelectionLogCount >= 6) return;
        debugSelectionLogCount++;
        postDebugLog(
          "syncBriefings.ts:selectionchange",
          "selection changed",
          getSelectionDebugData(),
          "H1",
          "selection-probe"
        );
      });
    }
    figma.ui.onmessage = async function(msg) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i;
      if (msg.type === "open-export-comments") {
        runExportComments();
        return;
      }
      if (msg.type === "ui-boot") {
        const existingPages = [];
        const existingPageSummaries = [];
        const existingMondayItemIds = [];
        const pageContentStatus = {};
        const pageContentStatusByName = {};
        const pageScoreDebug = {};
        for (let i = 0; i < figma.root.children.length; i++) {
          const p = figma.root.children[i];
          if (p.type === "PAGE") {
            const page = p;
            existingPages.push(page.name);
            const mondayItemId = page.getPluginData("heimdallMondayItemId");
            const normalizedPageName = page.name.trim().toLowerCase().replace(/\s+/g, " ");
            if (mondayItemId) {
              existingMondayItemIds.push(mondayItemId);
            }
            try {
              if (typeof page.loadAsync === "function") {
                await page.loadAsync();
              }
              const contentRoot = (_a = findPageContentRoot(page)) != null ? _a : page;
              const score = scorePageContent(contentRoot);
              const status = score.briefingSet || score.variantsPopulated > 0 ? "populated" : "empty";
              if (mondayItemId) {
                pageContentStatus[mondayItemId] = status;
                pageScoreDebug[mondayItemId] = {
                  pageName: page.name,
                  contentRootName: (_b = contentRoot.name) != null ? _b : "PAGE",
                  childCount: (_d = (_c = contentRoot.children) == null ? void 0 : _c.length) != null ? _d : 0,
                  score
                };
              }
              if (normalizedPageName) {
                pageContentStatusByName[normalizedPageName] = pageContentStatusByName[normalizedPageName] === "populated" ? "populated" : status;
              }
              existingPageSummaries.push(__spreadProps(__spreadValues({
                pageId: page.id,
                pageName: page.name
              }, mondayItemId ? { mondayItemId } : {}), {
                contentStatus: status
              }));
            } catch (err) {
              if (mondayItemId) {
                pageContentStatus[mondayItemId] = "empty";
                pageScoreDebug[mondayItemId] = {
                  pageName: page.name,
                  error: String(err)
                };
              }
              if (normalizedPageName && pageContentStatusByName[normalizedPageName] !== "populated") {
                pageContentStatusByName[normalizedPageName] = "empty";
              }
              existingPageSummaries.push(__spreadProps(__spreadValues({
                pageId: page.id,
                pageName: page.name
              }, mondayItemId ? { mondayItemId } : {}), {
                contentStatus: "empty"
              }));
            }
          }
        }
        figma.ui.postMessage({
          type: "context",
          fileName: figma.root.name,
          fileKey: figma.fileKey || "",
          existingPages,
          existingPageSummaries,
          existingMondayItemIds,
          pageContentStatus,
          pageContentStatusByName,
          pageScoreDebug
        });
      }
      if (msg.type === "ui-handlers-bound") {
      }
      if (msg.type === "get-api-base") {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        figma.ui.postMessage({ type: "api-base", apiBase });
      }
      if (msg.type === "save-api-base") {
        const raw = (_e = msg.apiBase) != null ? _e : "";
        const apiBase = raw.trim().replace(/\/$/, "") || DEFAULT_HEIMDALL_API;
        await figma.clientStorage.setAsync("heimdallApiBase", apiBase);
        figma.ui.postMessage({ type: "api-base", apiBase });
      }
      if (msg.type === "get-plugin-token") {
        const saved = await figma.clientStorage.getAsync("heimdallPluginToken");
        const token = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_PLUGIN_TOKEN;
        figma.ui.postMessage({ type: "plugin-token", token });
      }
      if (msg.type === "save-plugin-token") {
        const token = ((_f = msg.token) != null ? _f : "").trim();
        await figma.clientStorage.setAsync("heimdallPluginToken", token);
        figma.ui.postMessage({ type: "plugin-token", token });
      }
      if (msg.type === "get-vercel-bypass") {
        const saved = await figma.clientStorage.getAsync("heimdallVercelBypass");
        const secret = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_VERCEL_BYPASS;
        figma.ui.postMessage({ type: "vercel-bypass", secret });
      }
      if (msg.type === "save-vercel-bypass") {
        const secret = ((_g = msg.secret) != null ? _g : "").trim();
        await figma.clientStorage.setAsync("heimdallVercelBypass", secret);
        figma.ui.postMessage({ type: "vercel-bypass", secret });
      }
      if (msg.type === "get-file-key") {
        figma.ui.postMessage({ type: "file-key", fileKey: figma.fileKey || "" });
      }
      if (msg.type === "create-template") {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const _apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        const templatePage = findTemplatePage();
        if (templatePage) {
          await capturePreWriteSnapshot(_apiBase, templatePage, "template_create");
        }
        const result2 = await createAutoLayoutTemplate();
        figma.ui.postMessage({ type: "create-template-done", error: result2.error });
      }
      if (msg.type === "migrate-widgets") {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const _apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        for (const page of figma.root.children) {
          if (page.type === "PAGE" && page.getPluginData("heimdallMondayItemId")) {
            await capturePreWriteSnapshot(_apiBase, page, "widget_migrate");
          }
        }
        const result2 = await migrateStatusWidgets();
        figma.ui.postMessage({
          type: "migrate-widgets-done",
          error: result2.error,
          pagesMigrated: result2.pagesMigrated,
          pagesSkipped: result2.pagesSkipped,
          pagesFailed: result2.pagesFailed
        });
      }
      if (msg.type === "fix-layouts") {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const _apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        for (const page of figma.root.children) {
          if (page.type === "PAGE" && page.getPluginData("heimdallMondayItemId")) {
            await capturePreWriteSnapshot(_apiBase, page, "layout_fix");
          }
        }
        const result2 = await fixLayouts();
        figma.ui.postMessage({
          type: "fix-layouts-done",
          error: result2.error,
          pagesFixed: result2.pagesFixed,
          pagesSkipped: result2.pagesSkipped
        });
      }
      if (msg.type === "process-jobs" && msg.jobs) {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const _apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        for (const job2 of msg.jobs) {
          for (const page of figma.root.children) {
            if (page.type === "PAGE") {
              const itemId = page.getPluginData("heimdallMondayItemId");
              if (itemId && itemId === job2.mondayItemId) {
                await capturePreWriteSnapshot(_apiBase, page, "update", job2.mondayItemId, job2.mondayBoardId);
                break;
              }
            }
          }
        }
        var results;
        try {
          results = await processJobs(msg.jobs);
        } catch (e) {
          const err = e instanceof Error ? e.message : "Unknown error";
          results = msg.jobs.map((job2) => ({
            idempotencyKey: job2.idempotencyKey,
            experimentPageName: job2.experimentPageName,
            pageId: "",
            fileUrl: "",
            error: err
          }));
        }
        var imageRequests = [];
        for (var ji = 0; ji < msg.jobs.length; ji++) {
          var job = msg.jobs[ji];
          if (!job.images || job.images.length === 0) continue;
          var matchResult = null;
          for (var ri = 0; ri < results.length; ri++) {
            if (results[ri].idempotencyKey === job.idempotencyKey && !results[ri].error) {
              matchResult = results[ri];
              break;
            }
          }
          if (!matchResult || !matchResult.pageId) continue;
          for (var ii = 0; ii < job.images.length; ii++) {
            imageRequests.push({
              url: job.images[ii].url,
              name: job.images[ii].name,
              pageId: matchResult.pageId,
              assetId: job.images[ii].assetId
            });
          }
        }
        figma.ui.postMessage({ type: "jobs-processed", results, hasImages: imageRequests.length > 0 });
        var matched = debugLog.filter(function(d2) {
          return d2.matched;
        });
        var unmatched = debugLog.filter(function(d2) {
          return !d2.matched;
        });
        var summary = "DEBUG: " + matched.length + " matched, " + unmatched.length + " unmatched.\n";
        summary += "Unmatched nodes (first 20):\n";
        for (var d = 0; d < Math.min(unmatched.length, 20); d++) {
          var u = unmatched[d];
          summary += '  name="' + u.nodeName + '" chars="' + u.chars + '" path=[' + u.path.join(" > ") + "]\n";
        }
        summary += "\nMatched nodes (first 20):\n";
        for (var d = 0; d < Math.min(matched.length, 20); d++) {
          var m = matched[d];
          summary += '  name="' + m.nodeName + '" -> "' + (m.matchedKey || "") + '"\n';
        }
        figma.ui.postMessage({ type: "debug-log", text: summary });
        console.log(summary);
        if (imageRequests.length > 0) {
          setTimeout(function() {
            figma.ui.postMessage({ type: "fetch-images", images: imageRequests });
          }, 200);
        }
      }
      if (msg.type === "images-fetched" && msg.images) {
        const saved = await figma.clientStorage.getAsync("heimdallApiBase");
        const _apiBase = typeof saved === "string" && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API;
        const capturedPageIds = /* @__PURE__ */ new Set();
        for (const imgData2 of msg.images) {
          if (imgData2.pageId && !capturedPageIds.has(imgData2.pageId)) {
            capturedPageIds.add(imgData2.pageId);
            const _node2 = await figma.getNodeByIdAsync(imgData2.pageId);
            if (_node2 && _node2.type === "PAGE") {
              await capturePreWriteSnapshot(_apiBase, _node2, "image_import");
            }
          }
        }
        var totalPlaced = 0;
        var allFailures = [];
        var fetchFailures = (_h = msg.fetchFailures) != null ? _h : [];
        var byPage = {};
        var emptySkipped = 0;
        for (var idx = 0; idx < msg.images.length; idx++) {
          var imgData = msg.images[idx];
          if (!imgData.bytes || imgData.bytes.length === 0) {
            emptySkipped++;
            continue;
          }
          if (!byPage[imgData.pageId]) byPage[imgData.pageId] = [];
          byPage[imgData.pageId].push({
            bytes: new Uint8Array(imgData.bytes),
            name: imgData.name
          });
        }
        var pageIds = Object.keys(byPage);
        for (var pi = 0; pi < pageIds.length; pi++) {
          var pageId = pageIds[pi];
          var _node = await figma.getNodeByIdAsync(pageId);
          if (_node && _node.type === "PAGE" && typeof _node.loadAsync === "function") {
            await _node.loadAsync();
          }
          var result = await importImagesToPage(pageId, byPage[pageId]);
          totalPlaced += result.placed;
          for (var fi = 0; fi < result.failures.length; fi++) {
            allFailures.push(result.failures[fi]);
          }
        }
        var totalRequested = (_i = msg.imageCount) != null ? _i : msg.images.length;
        var totalFailed = allFailures.length + fetchFailures.length;
        var summary = "Images: requested=" + totalRequested + " placed=" + totalPlaced + " failed=" + totalFailed;
        if (allFailures.length + fetchFailures.length > 0) {
          debugLog.push({ nodeName: "__IMAGE_IMPORT__", chars: summary, path: [], matched: true });
        }
        figma.ui.postMessage({
          type: "images-import-done",
          placed: totalPlaced,
          total: totalRequested,
          failures: allFailures,
          fetchFailures
        });
      }
    };
  }

  // code.ts
  var command = figma.command;
  if (command === "sync-briefings") {
    runSyncBriefings();
  } else if (command === "export-comments") {
    runExportComments();
  } else {
    runSyncBriefings();
  }
})();
