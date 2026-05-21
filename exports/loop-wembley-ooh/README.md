# Loop x Pleasing - Wembley OOH

Deliverables for the 39-site London Underground 48-sheet creative allocation across the Harry Styles Wembley campaign (12 Jun - 12 Jul 2026), plus a low-poly isometric one-pager that visualises the final A/B split.

## Open the one-pager

The map loads `data/geometry.json` and `data/placements.json`, so serve the folder locally instead of opening `index.html` via `file://`.

```powershell
cd "C:\Users\buyss\Manifold Delta\Artifacts\11_Heimdall\exports\loop-wembley-ooh"
python -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/index.html
```

Current validation: served locally on port 8000, `index.html`, `geometry.json`, and `placements.json` all returned 200, and the browser console had no page errors.

## Files in this folder

- **`index.html`** - the low-poly isometric map. Uses three.js from CDN, an orthographic isometric camera, real lat/lng projection, OSM-derived TfL tube geometry, a simplified Thames, Wembley Stadium beacon, 39 billboard pins, subtle crowd-particle drift, A/B filtering, Wembley focus, and hover cards with the actual creative thumbnails.
- **`data/placements.json`** - 39 final signed-off placements joined from the V5 workbook: `{station, line, platform, frameId, lat, lng, creative, copy}`.
- **`data/geometry.json`** - baked geographic geometry: clipped/simplified TfL linework, Thames polygons, line colours, and Wembley landmarks. This avoids any runtime dependency on Google Maps, Gemini, Mapbox, or a paid API key.
- **`assets/creative-a.png`** and **`assets/creative-b.png`** - the supplied creative references.
- **`BOOKED_CREATIVE_REC_V5_FINAL_21.05.26.xlsx`** — the booked workbook with the `RECOMMENDED CREATIVE PLACEMENT` sheet rewritten to the final 20 A / 19 B allocation. Side-panel summary counts updated. All other sheets untouched. A copy also sits at `C:\Users\buyss\Downloads\BOOKED_CREATIVE_REC_V5_FINAL_21.05.26.xlsx` for direct email attachment.
- **`allocation-research.md`** — full audit trail. Per-station rationale grounded in TfL line topology, platform direction, and Wembley access. Read this if you want to spot-check why any one frame is A or B.
- **`placement-list.md`** — paste-ready list for the email to MGOMD / Robbie Gardner. Includes a frame-ID → creative table, A/B grouped views, and a single-line scan version for email body.
- **`_update_xlsx_com.py`** - the one-shot script that wrote the V5 workbook. Drives Excel via `win32com` so all workbook dynamic-array metadata, calculation chain, shared strings, custom XML, drawings (logos), and sensitivity label survive intact. Requires Excel + `pywin32`. Close Excel before running.
- **`_bake_placements.py`** - regenerates `data/placements.json` from the V5 workbook.
- **`_bake_geometry.py`** - regenerates `data/geometry.json` from the raw OSM-derived files.
- **`_raw_tfl_lines.json`**, **`_raw_tfl_stations.json`**, **`_raw_river_thames_simp.json`** - source geometry files downloaded from `oobrien/vis` (`tubecreature/data/*`), which is OSM-derived open data.

## What changes vs. the previous draft

The prior draft was 15 A / 24 B and was inflating A at major hubs without checking platform direction. The new allocation is 20 A / 19 B, derived from a station-by-station read of TfL line topology and the booked platform direction. Net of 15 cell flips (10 B → A, 5 A → B). Detail in section 8 of `allocation-research.md`.

## Status

Phase 1 and Phase 2 complete.
