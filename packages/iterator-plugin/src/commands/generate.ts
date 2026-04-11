/**
 * Generate from Briefing — creates a new ad design from a briefing.
 *
 * Opens a UI where the user can paste or reference a briefing,
 * optionally select reference frames, and kick off generation.
 */

export function runGenerate(): void {
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
  <h2>Iterator — Generate from Briefing</h2>
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
  </script>
</body>
</html>
  `.trim()

  figma.showUI(html, { width: 420, height: 500 })
}
