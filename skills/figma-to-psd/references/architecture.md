# Converter internals

Read this when an export fails in a way SKILL.md doesn't explain, or when you
need to modify the converter. For normal exports, SKILL.md is enough.

## How it works

`GET /v1/images/:key` renders **any node in isolation** as a PNG. The pipeline
asks Figma to render each meaningful layer separately, reads each node's
bounds to know where it sits, decodes the PNGs to raw RGBA (`sharp`), and
stacks them into a PSD with `ag-psd`. Figma's servers do all rasterising; the
scripts only do bookkeeping.

```
scripts/
├── cli.ts        export entry point (npm run export)
├── probe.ts      eligibility probe (npm run probe)
└── psd/
    ├── figmaApi.ts     minimal REST client (nodes, images, retry/backoff)
    ├── types.ts        LayerSource seam + FigmaNodeLite DTO
    ├── figmaNode.ts    REST JSON -> FigmaNodeLite (incl. paintsOwnBackground)
    ├── flatten.ts      Figma tree -> PsdPlan. Pure. The rule table lives here.
    ├── geometry.ts     bounds -> PSD rect; crop/resize planning for clipped nodes
    ├── blendMode.ts    Figma blend enum -> Photoshop blend mode
    ├── buildPsd.ts     PsdPlan + pixels -> ag-psd Psd object
    ├── restLayerSource.ts    sharp decode, batching, bisect-on-failure
    ├── exportFramesToPsd.ts  orchestrator; injects pure-JS createImageData
    └── concurrency.ts  mapLimit/sleep
```

## The rules that make output correct

**Opacity is baked; blend mode is not.** Figma renders a node in isolation with
its own opacity multiplied into the alpha channel. Setting PSD layer opacity as
well would double-apply it. Blend modes have nothing to blend against in
isolation, so they survive and must be mapped.

```
raster leaf:  PSD opacity = 1              blendMode = mapped
group:        PSD opacity = Figma opacity  blendMode = mapped
```

**Two placement regimes** (`planLayerPlacement` in geometry.ts):

- *Case A — fitting node*: the PNG matches `absoluteRenderBounds` (includes
  drop shadows / thick strokes). Place as-is. Trust render bounds for POSITION,
  the PNG for SIZE — Figma rounds x and width independently, so deriving one
  from the other produces 1px seams.
- *Case B — clipped node*: `/v1/images` renders a node as its own root and
  ignores ancestor clips, so an oversized image cropped by its frame comes back
  at full bounding-box size (clamped if huge). The visible region
  (`absoluteRenderBounds`) is a sub-rect of the bounding box: crop the render to
  it; if Figma clamped, resize the crop up to target (lanczos3). This is the
  only deliberate resize in the pipeline.
- *Neither*: rotated nodes (render bounds are the rotated AABB, the raster is
  unrotated), LAYER_BLUR (raster extends past the shape, render bounds are
  frame-clipped), odd vectors. These throw per-layer; restLayerSource catches
  and yields null → buildPsd emits a named hidden placeholder. One bad layer
  must never sink a frame.

**Containers flatten to one raster when** (flatten.ts): they have their own
effects (effect applies to the composited subtree), they **paint their own
background** (fill/stroke — e.g. a pill CTA frame; descending would drop the
paint), a mask is involved, depth ≥ 4, or the subtree exceeds the layer budget.
INSTANCEs are always atomic (one auto-explode level for instance-only frames).

**ag-psd needs a canvas shim.** `writePsdBuffer({trimImageData: true})` routes
through `createImageData`, which is canvas-backed by default. exportFramesToPsd
injects a plain-object implementation via `initializeCanvas` — without it every
write throws "Canvas not initialized".

**The composite is mandatory.** ag-psd never synthesizes one; a PSD without
`imageData` reads as opaque black outside Photoshop. It comes from one extra
frame render with `use_absolute_bounds=true`.

## Batching

Batches of 30 render sequentially (`/v1/images` is rate-limited by render
cost); downloads run 6-wide. Figma returns a top-level `err` when ANY node in a
batch fails, poisoning all 30 — `renderBatch` bisects to isolate the offender.
429/5xx retry with backoff; 403/404 abort the export (auth, not render, errors).

## Known limits

- Masked groups are flattened (v1).
- SOFT_LIGHT drifts: Figma/Skia use the W3C formula, Photoshop its own.
- Text is rasterized; `.text.json` sidecar carries copy + position + style.
- Memory: at scale 2 a full-bleed 1440x2560 layer is ~59 MB RGBA and
  `writePsdBuffer` needs all layers resident. Default scale 1.

## Provenance

Vendored from the Heimdall repo (`src/psd/` + `tools/figma-to-psd/`) on
2026-07-09, including the fixes for: ag-psd canvas init, clipped-oversized-node
cropping, non-fatal placement failure, painted-container flattening. If
Heimdall's converter improves, re-sync by copying those files and rewriting the
restClient import to `./figmaApi.js`.
