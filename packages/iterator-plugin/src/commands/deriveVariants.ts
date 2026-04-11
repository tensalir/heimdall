/**
 * Derive Variants — generates resized format variants from a master frame.
 *
 * Takes the selected frame as the master and creates 4:5, 1:1,
 * or 9:16 variants depending on the source ratio.
 */

export function runDeriveVariants(): void {
  const selection = figma.currentPage.selection
  if (selection.length === 0) {
    figma.closePlugin('Select a master frame to derive variants from.')
    return
  }

  const frame = selection[0]
  if (frame.type !== 'FRAME') {
    figma.closePlugin('Please select a frame.')
    return
  }

  const ratio = detectRatio(frame.width, frame.height)

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
  <h2>Iterator — Derive Variants</h2>
  <div class="meta">Master: ${frame.name} (${Math.round(frame.width)}×${Math.round(frame.height)}, detected ${ratio || 'unknown'})</div>
  <div class="targets">
    <label><input type="checkbox" value="9x16" ${ratio !== '9x16' ? 'checked' : ''}> 9:16 (1440×2560)</label>
    <label><input type="checkbox" value="4x5" ${ratio !== '4x5' ? 'checked' : ''}> 4:5 (1440×1800)</label>
    <label><input type="checkbox" value="1x1" ${ratio !== '1x1' ? 'checked' : ''}> 1:1 (1440×1440)</label>
  </div>
  <button id="btn-derive">Derive Selected Variants</button>
  <div id="status" class="status" style="display:none;"></div>
  <script>
    document.getElementById('btn-derive').addEventListener('click', () => {
      const status = document.getElementById('status')
      status.style.display = 'block'
      status.textContent = 'Variant derivation not yet connected. Plugin skeleton is ready.'
    })
  </script>
</body>
</html>
  `.trim()

  figma.showUI(html, { width: 420, height: 400 })
}

function detectRatio(w: number, h: number): string | null {
  const RATIOS: Record<string, { w: number; h: number }> = {
    '9x16': { w: 1440, h: 2560 },
    '4x5': { w: 1440, h: 1800 },
    '1x1': { w: 1440, h: 1440 },
  }
  for (const [key, dim] of Object.entries(RATIOS)) {
    if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key
  }
  return null
}
