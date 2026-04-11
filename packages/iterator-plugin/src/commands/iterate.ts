/**
 * Iterate on Selection — the primary v1 command.
 *
 * Inspects the selected frame, extracts its layer structure,
 * sends it to the Iterator backend for analysis and edit planning,
 * and applies the returned edits as editable Figma layers.
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

  const html = buildUI('iterate', frame.id, frame.name)
  figma.showUI(html, { width: 420, height: 600 })

  figma.ui.onmessage = async (msg: { type: string; [key: string]: unknown }) => {
    if (msg.type === 'ready') {
      const layerSummary = extractLayerSummary(frame as FrameNode)
      figma.ui.postMessage({ type: 'frame-data', data: layerSummary })
    }

    if (msg.type === 'apply-edits') {
      // Future: apply structured edit plan returned by backend
      figma.ui.postMessage({ type: 'status', text: 'Edit application not yet implemented.' })
    }
  }
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

function buildUI(mode: string, frameId: string, frameName: string): string {
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
    .status { padding: 8px 12px; background: #2a2a2a; border-radius: 6px; margin-top: 12px; }
    button { background: #4f46e5; color: #fff; border: none; border-radius: 6px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
    button:hover { background: #4338ca; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .layers { max-height: 300px; overflow-y: auto; margin: 8px 0; }
    .layer { padding: 4px 8px; background: #2a2a2a; border-radius: 4px; margin: 2px 0; font-size: 11px; display: flex; justify-content: space-between; }
    .layer-type { color: #888; }
  </style>
</head>
<body>
  <h2>Iterator — ${mode === 'iterate' ? 'Iterate on Selection' : mode}</h2>
  <div class="meta">Frame: ${frameName} (${frameId})</div>
  <div id="layers" class="layers">Loading layers...</div>
  <div style="margin-top: 12px;">
    <button id="btn-analyze" disabled>Analyze & Plan Iterations</button>
  </div>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    const API_BASE = '${apiBase}'
    const TOKEN = '${token}'

    window.onmessage = (event) => {
      const msg = event.data.pluginMessage
      if (!msg) return

      if (msg.type === 'frame-data') {
        renderLayers(msg.data)
        document.getElementById('btn-analyze').disabled = false
      }
      if (msg.type === 'status') {
        const el = document.getElementById('status')
        el.style.display = 'block'
        el.textContent = msg.text
      }
    }

    function renderLayers(data) {
      const container = document.getElementById('layers')
      container.innerHTML = data.children.map(c =>
        '<div class="layer"><span>' + c.name + '</span><span class="layer-type">' + c.type + ' ' + c.width + '×' + c.height + '</span></div>'
      ).join('')
    }

    document.getElementById('btn-analyze').addEventListener('click', async () => {
      const btn = document.getElementById('btn-analyze')
      btn.disabled = true
      btn.textContent = 'Analyzing...'
      const status = document.getElementById('status')
      status.style.display = 'block'
      status.textContent = 'Sending to Iterator backend...'

      // TODO: POST to API_BASE + '/api/plugin/iterator/analyze'
      status.textContent = 'Backend analysis not yet connected. Plugin skeleton is ready.'
      btn.textContent = 'Analyze & Plan Iterations'
      btn.disabled = false
    })

    parent.postMessage({ pluginMessage: { type: 'ready' } }, '*')
  </script>
</body>
</html>
  `.trim()
}
