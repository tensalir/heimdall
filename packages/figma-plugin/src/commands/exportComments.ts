/**
 * Export Comments command — pull and consolidate Figma comments.
 * Shows a UI that fetches comments via the Heimdall backend REST API
 * and displays them in a consolidated view with export options.
 *
 * Flow:
 *   1. Plugin sends file key to UI
 *   2. UI fetches comments from Heimdall backend (/api/comments?fileKey=...)
 *   3. UI renders a consolidated table with filters
 *   4. User can copy to clipboard (CSV) or download
 */

import { DEFAULT_HEIMDALL_API, DEFAULT_VERCEL_BYPASS } from '../constants'

const commentsUiHtml = `<html><head><style>
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
          var htmlHint = /<\\s*html/i.test(raw) ? " (HTML body — wrong host or auth page?)" : "";
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
</script></body></html>`

export function runExportComments() {
  figma.showUI(commentsUiHtml, { width: 520, height: 600 })

  figma.ui.onmessage = async function (msg: {
    type: string;
    apiBase?: string;
    token?: string;
  }) {
    if (msg.type === 'get-api-base') {
      const saved = await figma.clientStorage.getAsync('heimdallApiBase')
      const apiBase = typeof saved === 'string' && saved.trim() ? saved.trim() : DEFAULT_HEIMDALL_API
      figma.ui.postMessage({ type: 'api-base', apiBase })
    }
    if (msg.type === 'save-api-base') {
      const raw = msg.apiBase ?? ''
      const apiBase = raw.trim().replace(/\/$/, '') || DEFAULT_HEIMDALL_API
      await figma.clientStorage.setAsync('heimdallApiBase', apiBase)
      figma.ui.postMessage({ type: 'api-base', apiBase })
    }
    if (msg.type === 'get-plugin-token') {
      const saved = await figma.clientStorage.getAsync('heimdallPluginToken')
      const token = typeof saved === 'string' && saved.trim() ? saved.trim() : ''
      figma.ui.postMessage({ type: 'plugin-token', token })
    }
    if (msg.type === 'save-plugin-token') {
      const token = (msg.token ?? '').trim()
      await figma.clientStorage.setAsync('heimdallPluginToken', token)
      figma.ui.postMessage({ type: 'plugin-token', token })
    }
    if (msg.type === 'get-vercel-bypass') {
      const saved = await figma.clientStorage.getAsync('heimdallVercelBypass')
      const secret = typeof saved === 'string' && saved.trim() ? saved.trim() : DEFAULT_VERCEL_BYPASS
      figma.ui.postMessage({ type: 'vercel-bypass', secret })
    }
    if (msg.type === 'get-file-key') {
      figma.ui.postMessage({ type: 'file-key', fileKey: figma.fileKey || '' })
    }
  }
}
