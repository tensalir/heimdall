/**
 * Localization tab — the agency round trip, without leaving Figma.
 *
 *   pick pages + languages -> extract -> download pack
 *   -> (agency translates) -> upload pack -> approve -> push locale pages
 *
 * Auth: a PER-USER token obtained by device pairing, stored under its own
 * clientStorage key. It must not reuse `heimdallPluginToken` — that slot holds
 * the shared bundle secret which /api/plugin/* still expects, and overwriting
 * it would break Sync Briefings.
 *
 * Network: the UI iframe calls Heimdall directly. Heimdall's CORS explicitly
 * allows a literal `null` origin and figma.com, and lists Authorization in
 * Access-Control-Allow-Headers, so no main-thread proxying is needed.
 *
 * The apply step tags pages with the SAME shared plugin data the Babylon MCP
 * path writes ('babylon' / runId + locale), so a page created by either route
 * is recognised and updated in place by the other.
 */

import { DEFAULT_HEIMDALL_API } from '../constants'

/** Separate from `heimdallPluginToken` on purpose — see the note above. */
const TOKEN_KEY = 'heimdallLocalizationToken'
/** Last-used target languages, so the picker is not re-ticked every run. */
const LANGS_KEY = 'heimdallLocalizationLangs'

const localizationUiHtml = `<html><head><style>
  * { box-sizing: border-box; }
  body { font: 11px/1.45 Inter, -apple-system, sans-serif; margin: 0; padding: 12px; color: #1a1a1a; }
  h2 { font-size: 12px; margin: 0 0 8px; }
  .muted { color: #7a7a7a; }
  .row { display: flex; gap: 6px; align-items: center; }
  button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid #d8d8d8; background: #fff; cursor: pointer; }
  button.primary { background: #0d99ff; border-color: #0d99ff; color: #fff; }
  button.primary:disabled { background: #b9dfff; border-color: #b9dfff; cursor: default; }
  button:disabled { opacity: .55; cursor: default; }
  .card { border: 1px solid #e6e6e6; border-radius: 8px; padding: 10px; margin-bottom: 10px; }
  .list { max-height: 150px; overflow: auto; border: 1px solid #eee; border-radius: 6px; padding: 6px; }
  label.item { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
  .code { font: 18px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 3px; text-align: center; padding: 10px; background: #f5f5f5; border-radius: 6px; }
  .status { margin-top: 8px; padding: 6px 8px; border-radius: 6px; font-size: 10.5px; white-space: pre-wrap; }
  .status.err { background: #ffe9e9; color: #9b1c1c; }
  .status.ok { background: #e8f7ee; color: #0f6b33; }
  .status.info { background: #f2f2f2; }
  .hide { display: none; }
  .resume { background:#eef6ff; border:1px solid #cfe6ff; border-radius:6px; padding:6px 8px; margin-bottom:10px; font-size:10.5px; color:#0b5aa6; }
  .step { font-weight: 600; margin-bottom: 6px; }
  input[type=file] { font: inherit; width: 100%; }
</style></head><body>

<div id="pair-view" class="hide">
  <h2>Connect your account</h2>
  <p class="muted">The plugin needs its own connection, tied to you. This replaces the shared key and can be revoked without affecting anyone else.</p>
  <div id="pair-idle">
    <button class="primary" id="pair-start">Connect</button>
  </div>
  <div id="pair-waiting" class="hide">
    <div class="code" id="pair-code">----</div>
    <p class="muted">Approve this code in your browser. It expires in 10 minutes.</p>
    <div class="row"><button id="pair-open">Open approval page</button></div>
  </div>
  <div id="pair-status" class="status info hide"></div>
</div>

<div id="main-view" class="hide">
  <div id="resume" class="resume hide"></div>
  <div class="card hide" id="filekey-card">
    <div class="step">This file</div>
    <p class="muted">Figma only exposes the file key to published plugins, so paste this file's URL once. It is saved on the document, so nobody has to do it again.</p>
    <input type="text" id="filekey-input" placeholder="https://www.figma.com/design/..." style="width:100%;padding:6px;border:1px solid #d8d8d8;border-radius:6px;font:inherit" />
    <div class="row" style="margin-top:6px"><button class="primary" id="filekey-save">Save</button></div>
  </div>
  <div class="card">
    <div class="step">1 · Pages</div>
    <div class="list" id="pages"></div>
  </div>
  <div class="card">
    <div class="step">2 · Languages</div>
    <div class="list" id="langs"></div>
  </div>
  <div class="card">
    <div class="step">3 · Extract</div>
    <button class="primary" id="btn-extract">Create sheet &amp; extract</button>
    <div class="row" style="margin-top:6px"><button id="btn-pack" disabled>Download pack (.xlsx)</button></div>
  </div>
  <div class="card">
    <div class="step">4 · Import translations</div>
    <input type="file" id="file" accept=".xlsx" />
    <div class="row" style="margin-top:6px">
      <button id="btn-preview" disabled>Preview</button>
      <button class="primary" id="btn-commit" disabled>Commit</button>
    </div>
  </div>
  <div class="card">
    <div class="step">5 · Push to Figma</div>
    <button class="primary" id="btn-push" disabled>Approve &amp; push locale pages</button>
  </div>
  <div class="row"><button id="btn-unpair">Disconnect</button></div>
</div>

<div id="status" class="status info"></div>

<script>
var API = '';
var TOKEN = '';
var FILE_KEY = '';
var PAGES = [];
var PROJECT = null;
var TABS = [];
var RUN_IDS = [];
var DEVICE_CODE = '';
var POLL_TIMER = null;
var VERIFY_URI = '';
var CURRENT_PAGE_ID = '';
var SAVED_LANGS = [];
var RESUMED_AT = '';

var LANGS = ['nl','fr-ca','es-419','fr','de','es','it','ja','ko','pt-br','sv','da','fi','no'];

function $(id) { return document.getElementById(id); }
function say(msg, kind) {
  var el = $('status');
  el.className = 'status ' + (kind || 'info');
  el.textContent = msg;
}
function send(type, payload) {
  var m = payload || {};
  m.type = type;
  parent.postMessage({ pluginMessage: m }, '*');
}

async function api(path, opts) {
  var o = opts || {};
  var headers = { 'Authorization': 'Bearer ' + TOKEN };
  if (o.json) headers['Content-Type'] = 'application/json';
  var res = await fetch(API + path, {
    method: o.method || 'GET',
    headers: headers,
    body: o.json ? JSON.stringify(o.json) : undefined
  });
  if (o.binary) {
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.arrayBuffer();
  }
  var body = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status));
  return body;
}

/* ---------------- pairing ---------------- */

$('pair-start').onclick = async function () {
  say('Requesting a code…');
  try {
    var res = await fetch(API + '/api/plugin/pair/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_label: 'Figma · ' + (FILE_KEY || 'unknown file') })
    });
    var body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not start pairing');
    DEVICE_CODE = body.device_code;
    VERIFY_URI = body.verification_uri;
    $('pair-code').textContent = body.user_code;
    $('pair-idle').className = 'hide';
    $('pair-waiting').className = '';
    say('Waiting for approval in your browser…');
    window.open(VERIFY_URI, '_blank');
    POLL_TIMER = setInterval(pollPair, body.poll_interval_ms || 2500);
  } catch (e) { say(String(e.message || e), 'err'); }
};

$('pair-open').onclick = function () { if (VERIFY_URI) window.open(VERIFY_URI, '_blank'); };

async function pollPair() {
  try {
    var res = await fetch(API + '/api/plugin/pair/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: DEVICE_CODE })
    });
    if (res.status === 202) return;
    var body = await res.json();
    clearInterval(POLL_TIMER); POLL_TIMER = null;
    if (res.status === 410) { say('That code expired. Try connecting again.', 'err'); resetPair(); return; }
    if (!res.ok) { say(body.error || 'Pairing failed', 'err'); resetPair(); return; }
    TOKEN = body.token;
    send('save-token', { token: TOKEN });
    say('Connected.', 'ok');
    showMain();
  } catch (e) {
    clearInterval(POLL_TIMER); POLL_TIMER = null;
    say(String(e.message || e), 'err'); resetPair();
  }
}

function resetPair() {
  $('pair-idle').className = '';
  $('pair-waiting').className = 'hide';
  DEVICE_CODE = '';
}

$('btn-unpair').onclick = function () {
  TOKEN = '';
  send('save-token', { token: '' });
  $('main-view').className = 'hide';
  $('pair-view').className = '';
  resetPair();
  say('Disconnected.');
};

/* ---------------- main flow ---------------- */

function showMain() {
  $('pair-view').className = 'hide';
  $('main-view').className = '';
  renderFileKey();
  renderPages();
  renderLangs();
  renderStage();
}

/**
 * Restore the sheet this file is working through. Without this, reopening the
 * plugin (or a colleague opening it) left PROJECT null, and Preview failed
 * server-side with "Provide exactly one of project_id, file_key, batch_id".
 */
function restoreState(raw) {
  if (!raw) return;
  try {
    var s = JSON.parse(raw);
    if (s && s.projectId) {
      PROJECT = s.projectId;
      TABS = s.tabs || [];
      RUN_IDS = s.runIds || [];
      RESUMED_AT = s.updatedAt || '';
    }
  } catch (e) { /* corrupt state is not worth failing over */ }
}

function persistState() {
  send('save-state', {
    state: JSON.stringify({
      projectId: PROJECT, tabs: TABS, runIds: RUN_IDS, updatedAt: new Date().toISOString()
    })
  });
}

/** Enable only the steps that can actually succeed right now. */
function renderStage() {
  var hasSheet = !!PROJECT && RUN_IDS.length > 0;
  $('btn-pack').disabled = !hasSheet;
  $('btn-preview').disabled = !hasSheet || !$('file').files.length;
  $('btn-commit').disabled = true;
  $('btn-push').disabled = !hasSheet;
  $('resume').className = hasSheet ? 'resume' : 'resume hide';
  if (hasSheet) {
    var when = RESUMED_AT ? new Date(RESUMED_AT).toLocaleString() : '';
    $('resume').textContent = 'Working sheet: ' + (TABS.map(function (t) { return t.name; }).join(', ') || 'ready') +
      ' — ' + RUN_IDS.length + ' page(s)' + (when ? ' · extracted ' + when : '');
  }
}

function renderFileKey() {
  // Only ask when we genuinely do not know it.
  $('filekey-card').className = FILE_KEY ? 'card hide' : 'card';
  $('btn-extract').disabled = !FILE_KEY;
}

$('filekey-save').onclick = function () {
  var v = $('filekey-input').value;
  if (!v.trim()) return say('Paste the file URL first.', 'err');
  send('save-file-key', { fileKey: v });
};

function renderPages() {
  // Default to the page she is on; fall back to the first if it is not listed.
  var preferred = CURRENT_PAGE_ID && PAGES.some(function (p) { return p.id === CURRENT_PAGE_ID; })
    ? CURRENT_PAGE_ID : (PAGES[0] ? PAGES[0].id : '');
  $('pages').innerHTML = PAGES.map(function (p) {
    return '<label class="item"><input type="checkbox" data-page="' + p.id + '"' +
      (p.id === preferred ? ' checked' : '') + '> ' + escapeHtml(p.name) + '</label>';
  }).join('');
}
function renderLangs() {
  $('langs').innerHTML = LANGS.map(function (l) {
    var on = SAVED_LANGS.indexOf(l) !== -1;
    return '<label class="item"><input type="checkbox" data-lang="' + l + '"' + (on ? ' checked' : '') + '> ' + l.toUpperCase() + '</label>';
  }).join('');
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function selectedPages() {
  return Array.prototype.slice.call(document.querySelectorAll('[data-page]:checked')).map(function (el) {
    var id = el.getAttribute('data-page');
    var page = PAGES.filter(function (p) { return p.id === id; })[0];
    return { id: id, name: page ? page.name : 'Page' };
  });
}
function selectedLangs() {
  return Array.prototype.slice.call(document.querySelectorAll('[data-lang]:checked')).map(function (el) {
    return el.getAttribute('data-lang');
  });
}

$('btn-extract').onclick = async function () {
  var pages = selectedPages();
  var langs = selectedLangs();
  if (!pages.length) return say('Select at least one page.', 'err');
  if (!langs.length) return say('Select at least one language.', 'err');

  $('btn-extract').disabled = true;
  send('save-langs', { langs: langs });
  try {
    say('Creating sheet…');
    var sheet = await api('/api/plugin/localization/sheet', {
      method: 'POST', json: {
        figma_file_key: FILE_KEY,
        mode: 'localization',
        tabs: pages,
        name: 'Localization · ' + new Date().toISOString().slice(0, 10),
        target_languages: langs
      }
    });
    PROJECT = sheet.project_id;
    TABS = sheet.tabs || [];
    RUN_IDS = [];

    for (var i = 0; i < TABS.length; i++) {
      say('Extracting ' + (i + 1) + '/' + TABS.length + ' — ' + TABS[i].name + '…');
      var out = await api('/api/plugin/localization/extract', {
        method: 'POST', json: {
          project_id: PROJECT,
          tab_node_id: TABS[i].id,
          tab_name: TABS[i].name,
          tab_kind: sheet.tab_kind || 'page'
        }
      });
      RUN_IDS.push(out.run_id);
      if (out.skipped_total > 0) {
        say('Note: ' + out.skipped_total + ' text node(s) were skipped on "' + TABS[i].name +
            '" (hidden layers prune their whole subtree).', 'info');
      }
    }
    persistState();
    renderStage();
    // The pack is what she came for, so produce it without a second click.
    // The button stays for re-downloads.
    say('Extracted ' + RUN_IDS.length + ' page(s). Building the pack…', 'ok');
    await downloadPack();
  } catch (e) {
    say(String(e.message || e), 'err');
  } finally {
    $('btn-extract').disabled = false;
  }
};

$('btn-pack').onclick = function () { downloadPack(); };

async function downloadPack() {
  try {
    say('Building workbook…');
    // Fetched rather than window.open'd: the download needs the Authorization
    // header, which a plain navigation cannot carry.
    var buf = await api('/api/plugin/localization/pack?projectId=' + encodeURIComponent(PROJECT), { binary: true });
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    // Name it after the page and date — several packs end up in Downloads
    // together, and "translation_pack.xlsx (3)" helps nobody.
    var label = (TABS[0] && TABS[0].name ? TABS[0].name : 'pack').replace(/[^A-Za-z0-9]+/g, '_');
    a.download = 'translation_pack_' + label + '_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    say('Downloaded. Send it to the agency, then upload the filled file below.', 'ok');
  } catch (e) { say(String(e.message || e), 'err'); }
}

function readFileBase64(file) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onerror = function () { reject(new Error('Could not read that file')); };
    r.onload = function () {
      var s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.readAsDataURL(file);
  });
}

$('file').onchange = function () {
  $('btn-preview').disabled = !$('file').files.length || !PROJECT;
  $('btn-commit').disabled = true;
};

async function runImport(mode) {
  var file = $('file').files[0];
  if (!file) return say('Choose the filled .xlsx first.', 'err');
  say(mode === 'commit' ? 'Importing…' : 'Checking…');
  var b64 = await readFileBase64(file);
  var report = await api('/api/plugin/localization/import', {
    method: 'POST', json: {
      project_id: PROJECT, xlsx_base64: b64, mode: mode, confirm: mode === 'commit' ? true : undefined
    }
  });
  var t = report.totals || {};
  return { report: report, summary: t.rows + ' row(s), ' + t.cells + ' cell(s): ' +
    (t.created || 0) + ' new, ' + (t.updated || 0) + ' updated, ' + (t.unmatched || 0) + ' unmatched' };
}

$('btn-preview').onclick = async function () {
  try {
    var r = await runImport('preview');
    say('Preview — ' + r.summary + '. Nothing written yet.', 'ok');
    $('btn-commit').disabled = false;
  } catch (e) { say(String(e.message || e), 'err'); }
};

$('btn-commit').onclick = async function () {
  try {
    var r = await runImport('commit');
    say('Imported — ' + r.summary + '.', 'ok');
    $('btn-push').disabled = false;
  } catch (e) { say(String(e.message || e), 'err'); }
};

$('btn-push').onclick = async function () {
  $('btn-push').disabled = true;
  try {
    for (var i = 0; i < RUN_IDS.length; i++) {
      say('Approving ' + (i + 1) + '/' + RUN_IDS.length + '…');
      await api('/api/plugin/localization/approve', { method: 'POST', json: { run_id: RUN_IDS[i] } });
      var pkg = await api('/api/plugin/localization/locale-package?runId=' + encodeURIComponent(RUN_IDS[i]));
      send('apply-locales', { pkg: pkg });
    }
    say('Sent to Figma. Applying…');
  } catch (e) {
    say(String(e.message || e), 'err');
    $('btn-push').disabled = false;
  }
};

/* ---------------- main-thread messages ---------------- */

onmessage = function (event) {
  var msg = event.data.pluginMessage;
  if (!msg) return;
  if (msg.type === 'context') {
    API = msg.apiBase;
    TOKEN = msg.token || '';
    FILE_KEY = msg.fileKey || '';
    PAGES = msg.pages || [];
    CURRENT_PAGE_ID = msg.currentPageId || '';
    SAVED_LANGS = msg.langs || [];
    restoreState(msg.state);
    if (TOKEN) showMain(); else { $('pair-view').className = ''; say('Not connected yet.'); }
  }
  if (msg.type === 'file-key') {
    if (msg.error) return say(msg.error, 'err');
    FILE_KEY = msg.fileKey || '';
    renderFileKey();
    say('File key saved for this document.', 'ok');
  }
  if (msg.type === 'applied') {
    say(msg.summary, msg.errors ? 'err' : 'ok');
    $('btn-push').disabled = false;
  }
};

send('get-context');
</script>
</body></html>`;

/* ------------------------------------------------------------------ */
/*  Main thread                                                        */
/* ------------------------------------------------------------------ */

interface LocaleNode { id: string; source: string; target: string }
interface LocalePackage { language: string; pageName: string; nodes: LocaleNode[] }
interface LocalizationPackage {
  run_id: string;
  source_page_id: string | null;
  locales: Record<string, LocalePackage>;
}

/**
 * Load every font used across a text node's character ranges. A single
 * unloaded range makes `characters` throw, and mixed-font nodes are common in
 * display copy.
 */
async function loadFontsForTextNode(node: TextNode): Promise<void> {
  const len = node.characters.length
  if (len === 0) {
    try { await figma.loadFontAsync(node.fontName as FontName) } catch { /* mixed/absent */ }
    return
  }
  const loaded = new Set<string>()
  for (let c = 0; c < len; c++) {
    const f = node.getRangeFontName(c, c + 1)
    if (f && typeof f === 'object' && 'family' in f) {
      const key = f.family + ':' + f.style
      if (!loaded.has(key)) { loaded.add(key); await figma.loadFontAsync(f) }
    }
  }
}

interface ApplyTally { updated: number; missing: number; skipped: number; errors: string[] }

/**
 * Walk source and clone in lockstep.
 *
 * `clone()` assigns fresh ids, so the copy cannot be matched to the original by
 * id — but immediately after cloning the two trees are structurally identical,
 * so position identifies the counterpart. Translations are keyed by SOURCE id.
 */
async function walkAndApply(
  src: BaseNode,
  dst: BaseNode | undefined,
  dict: Record<string, string>,
  tally: ApplyTally,
): Promise<void> {
  if (!dst) { tally.missing++; return }
  if (src.type === 'TEXT') {
    const target = dict[src.id]
    if (target === undefined) { tally.skipped++; return }
    try {
      const dstText = dst as TextNode
      await loadFontsForTextNode(dstText)
      dstText.characters = target
      if (dstText.textAutoResize === 'WIDTH_AND_HEIGHT') dstText.textAutoResize = 'HEIGHT'
      tally.updated++
    } catch (e) {
      tally.errors.push(src.id + ': ' + String(e))
    }
    return
  }
  // Instance internals are not editable and burn the traversal budget.
  if (src.type === 'INSTANCE' || src.type === 'COMPONENT' || src.type === 'COMPONENT_SET') return
  const sc = 'children' in src ? src.children : []
  const dc = 'children' in dst ? (dst as ChildrenMixin).children : []
  const n = Math.min(sc.length, dc.length)
  for (let i = 0; i < n; i++) await walkAndApply(sc[i]!, dc[i], dict, tally)
}

async function applyLocalePackage(pkg: LocalizationPackage): Promise<string> {
  if (!pkg.source_page_id) return 'No source page id in the package.'
  const src = await figma.getNodeByIdAsync(pkg.source_page_id)
  if (!src || src.type !== 'PAGE') return 'Source page not found: ' + pkg.source_page_id
  await src.loadAsync()

  const parts: string[] = []
  for (const lang of Object.keys(pkg.locales)) {
    const locale = pkg.locales[lang]!
    if (!locale.nodes.length) continue
    const dict: Record<string, string> = {}
    for (const n of locale.nodes) dict[n.id] = n.target
    const LOCALE = lang.toUpperCase()

    // Same namespace and keys the Babylon MCP path writes, so a locale page
    // created by either route is found and updated in place by the other.
    let dst: PageNode | null = null
    for (const p of figma.root.children) {
      if (p.getSharedPluginData('babylon', 'locale') === LOCALE &&
          p.getSharedPluginData('babylon', 'runId') === pkg.run_id) { dst = p; break }
    }
    let reused = true
    if (!dst) {
      reused = false
      dst = src.clone()
      dst.name = locale.pageName
      dst.setSharedPluginData('babylon', 'locale', LOCALE)
      dst.setSharedPluginData('babylon', 'runId', pkg.run_id)
    }
    await dst.loadAsync()

    const tally: ApplyTally = { updated: 0, missing: 0, skipped: 0, errors: [] }
    const srcTop = src.children
    const dstTop = dst.children
    const count = Math.min(srcTop.length, dstTop.length)
    for (let i = 0; i < count; i++) await walkAndApply(srcTop[i]!, dstTop[i], dict, tally)

    parts.push(LOCALE + ': ' + tally.updated + ' updated' +
      (reused ? ' (existing page)' : ' (new page)') +
      (tally.errors.length ? ', ' + tally.errors.length + ' error(s)' : ''))
  }
  return parts.length ? parts.join('\n') : 'Nothing to apply — no approved translations.'
}

/**
 * Accept either a bare file key or a full Figma URL.
 * `https://www.figma.com/design/<KEY>/<name>` — also matches /file/ and /board/.
 */
function parseFileKey(input: string): string {
  const raw = input.trim()
  if (!raw) return ''
  const fromUrl = /figma\.com\/(?:design|file|board)\/([A-Za-z0-9]+)/.exec(raw)
  if (fromUrl) return fromUrl[1]!
  // A bare key: Figma keys are alphanumeric, ~22 chars.
  if (/^[A-Za-z0-9]{10,}$/.test(raw)) return raw
  return ''
}

/**
 * `figma.fileKey` is only populated for plugins published privately to an
 * organisation — in development mode it is undefined. So fall back to a value
 * stored on the document, which the user supplies once per file.
 */
function resolveFileKey(): string {
  const native = (figma as unknown as { fileKey?: string }).fileKey
  if (typeof native === 'string' && native.trim()) return native.trim()
  const stored = figma.root.getSharedPluginData('babylon', 'fileKey')
  return typeof stored === 'string' ? stored.trim() : ''
}

export function runLocalization(): void {
  figma.showUI(localizationUiHtml, { width: 460, height: 700 })

  figma.ui.onmessage = async function (msg: {
    type: string
    token?: string
    fileKey?: string
    langs?: string[]
    state?: string
    pkg?: LocalizationPackage
  }) {
    if (msg.type === 'get-context') {
      const savedBase = await figma.clientStorage.getAsync('heimdallApiBase')
      const apiBase = typeof savedBase === 'string' && savedBase.trim() ? savedBase.trim() : DEFAULT_HEIMDALL_API
      const savedToken = await figma.clientStorage.getAsync(TOKEN_KEY)
      const savedLangs = await figma.clientStorage.getAsync(LANGS_KEY)
      figma.ui.postMessage({
        type: 'context',
        apiBase,
        token: typeof savedToken === 'string' ? savedToken : '',
        fileKey: resolveFileKey(),
        pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
        // Pre-select what she is actually looking at, rather than page one.
        currentPageId: figma.currentPage.id,
        // Most runs use the same language set; remembering it saves re-ticking
        // three boxes every time.
        langs: Array.isArray(savedLangs) ? savedLangs : [],
        // The sheet this file is currently working through, so import and push
        // still work after the plugin is closed or opened by someone else.
        state: figma.root.getSharedPluginData('babylon', 'localizationState') || '',
      })
    }

    if (msg.type === 'save-langs') {
      await figma.clientStorage.setAsync(LANGS_KEY, Array.isArray(msg.langs) ? msg.langs : [])
    }

    if (msg.type === 'save-state') {
      // On the DOCUMENT, not clientStorage: the agency round trip spans days,
      // and whoever imports the returned pack is often not whoever extracted.
      // Storing it per-user meant the importer had no project id and the call
      // failed with "Provide exactly one of project_id, file_key, batch_id".
      figma.root.setSharedPluginData('babylon', 'localizationState', msg.state ?? '')
    }

    if (msg.type === 'save-file-key') {
      const key = parseFileKey(msg.fileKey ?? '')
      if (!key) {
        figma.ui.postMessage({ type: 'file-key', fileKey: '', error: 'Could not read a file key from that.' })
        return
      }
      // Stored on the document, not clientStorage: the key belongs to the
      // file, so everyone who opens it inherits the answer.
      figma.root.setSharedPluginData('babylon', 'fileKey', key)
      figma.ui.postMessage({ type: 'file-key', fileKey: key })
    }

    if (msg.type === 'save-token') {
      await figma.clientStorage.setAsync(TOKEN_KEY, (msg.token ?? '').trim())
    }

    if (msg.type === 'apply-locales' && msg.pkg) {
      try {
        const summary = await applyLocalePackage(msg.pkg)
        figma.ui.postMessage({ type: 'applied', summary, errors: summary.indexOf('error') !== -1 })
      } catch (e) {
        figma.ui.postMessage({ type: 'applied', summary: String(e), errors: true })
      }
    }
  }
}
