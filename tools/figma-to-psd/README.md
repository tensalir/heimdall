# Figma → layered PSD

One `.psd` per Figma frame, layers preserved. No plugin required.

## How it works

`GET /v1/images/:key` renders **any node in isolation** as a PNG. So: ask Figma to
render each meaningful layer separately, read each node's `absoluteRenderBounds`
to know where it sits, decode the PNGs to raw RGBA, and stack them into a PSD
with [`ag-psd`](https://github.com/Agamnentzar/ag-psd). Figma's servers do all
the rasterising; we only do bookkeeping.

No native dependencies: `ag-psd` layers take `imageData` (raw RGBA), so
`node-canvas` is never needed. `sharp` (already a dep) decodes the PNGs.

(One catch: `writePsdBuffer({ trimImageData: true })` trims transparent layer
margins via ag-psd's `cropImageData`, which allocates through a canvas-backed
`createImageData`. `exportFramesToPsd.ts` injects a pure-JS `createImageData` via
`initializeCanvas` so trimming stays canvas-free. Without it the writer throws
"Canvas not initialized" on the first non-trivial layer.)

## Prerequisites

`FIGMA_ACCESS_TOKEN` in `.env.local`, with `file_content:read` scope and access
to the target file. Check it first:

```sh
curl -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" https://api.figma.com/v1/me
```

An org-level "Content access" restriction can 403 `/v1/images` even for a valid
token. If that happens, the REST path is closed and the plugin becomes mandatory.

## Usage

```sh
# 1. What's in the file? Lists pages and their top-level frames.
npm run psd:probe -- --file Yujv66E4t42TLxzAJHIpJ8

# 2. Can these frames survive isolated rendering? Run this BEFORE exporting.
npm run psd:probe -- --file <key> --node 1-23,1-99

# 3. Export.
npm run psd:export -- --file <key> --node 1-23,1-99 --scale 1 --out ./out
```

Each frame yields `<Frame Name>.psd` and `<Frame Name>.text.json` (the copy —
text is rasterized into the PSD, so the sidecar keeps it machine-readable).

## Read the probe output

The image endpoint renders a node **as its own root**. Three things break that:

| Finding | Meaning |
|---|---|
| `BACKGROUND_BLUR` | **Hard tripwire.** Nothing behind the node to blur → Figma returns a clear pane. The subtree must be flattened; if it's near the frame root you get a one-layer PSD, i.e. a PNG with extra steps. |
| `maskType: LUMINANCE` | **Hard tripwire.** Needs the masked content present. |
| `visible: false` / `opacity: 0` | Survivable. Figma returns `null`; we emit a named, correctly-positioned hidden placeholder layer so the designer knows the content existed. |

Also watch `renderable leaf > 400` (neither path handles it well) and
`hidden > 15% of leaves` (ask whether the team actually needs them).

## The two rules that make the output correct

**Opacity is baked; blend mode is not.** Figma renders a node in isolation with
its own opacity already multiplied into the alpha channel. Setting the PSD layer
opacity *as well* would double-apply it. A blend mode, by contrast, has nothing
to blend against in isolation, so it survives and must be mapped.

```
raster leaf:  PSD opacity = 1              blendMode = mapped
group:        PSD opacity = Figma opacity  blendMode = mapped
```

(A group emits no pixels, so nothing baked its opacity into anything.)

Getting one of these right and the other wrong is the most likely cause of a PSD
that looks *almost* correct. `verify-isolation.ts` settles it against the live
renderer:

```sh
npx tsx tools/figma-to-psd/verify-isolation.ts --file <key> --node <frameId>
```

**Trust `absoluteRenderBounds` for position, the PNG for size.** Render bounds
include drop shadows and thick strokes, which is what the PNG contains. Figma
rounds `x` and `width` independently, so deriving `right` from `width * scale`
produces 1px seams. `geometry.ts` throws rather than guessing if the drift
exceeds 3px.

## Layer granularity

Tuned for external-partner hand-off (Amazon A+ content): coarse, clean,
well-named layers. `INSTANCE`s render atomically, containers with effects
flatten, depth caps at 4, masked groups flatten (v1). See `ATOMIC_TYPES` and the
rule table in `src/psd/flatten.ts`.

A frame whose only child is an `INSTANCE` auto-explodes one level — otherwise the
whole design collapses to a single layer.

## Verifying output without Photoshop

```sh
file out/Hero.psd                       # header: dimensions, channels
python -c "from PIL import Image; im=Image.open('out/Hero.psd'); \
  print(im.size); [print(l[0], l[2]) for l in im.layers]"
```

Pillow is an independent C parser — a much stronger check than reading back with
`ag-psd`, which would only prove the library agrees with itself. Drag-and-drop
into [Photopea](https://www.photopea.com) for a full visual check.

**The flattened preview is not proof.** `psd.imageData` comes from Figma's own
frame render, so it looks right even if every layer is in the wrong place. Check
individual layer bboxes, or open the file and toggle layers.

## Architecture

`src/psd/` is **isomorphic** — no `sharp`, no `Buffer`, no `node:*` — and speaks
decoded `PixelData`, never PNG bytes. That's deliberate: if we ever need the
plugin (background blur, luminance masks, or hidden layers that must render),
the plugin cannot ship 200 full-scale PNGs to the backend and would have to build
the PSD in its own iframe. The fallback then costs a `pluginLayerSource.ts` plus
a download button, not a rewrite.

```
types.ts      LayerSource seam + FigmaNodeLite DTO
flatten.ts    Figma tree -> PsdPlan. Pure. The testable core.
geometry.ts   absoluteRenderBounds -> PSD rect, with drift reconciliation
blendMode.ts  Figma blend enum -> Photoshop blend mode
buildPsd.ts   PsdPlan + pixels -> ag-psd `Psd` (not bytes: Node writes a Buffer,
              a plugin iframe writes an ArrayBuffer)
restLayerSource.ts    Node-only. sharp decode, batching, bisect-on-failure.
exportFramesToPsd.ts  Node-only orchestrator.
```

Batches of 30 render sequentially (`/v1/images` is rate-limited by render cost);
downloads run 6-wide. Figma returns a **top-level** `err` when *any* node in a
batch fails, so one bad node poisons all 30 — `renderBatch` bisects to isolate it.

## Clipped, oversized, rotated, and blurred nodes

`/v1/images` renders a node **as its own root** — it ignores the parent frame's
clip. A child that spills outside the frame (a full-bleed photo positioned so
only a window shows) therefore comes back at its *full* bounding-box size, not
the visible size, and Figma clamps the giant ones to its max render dimension.
`geometry.ts` handles this: when the render matches the bounding box rather than
the (frame-clipped) render bounds, it crops the render down to the visible region
and, if Figma clamped, resizes up to the target — the one deliberate `sharp`
resize, quality-lossy only on heavily-zoomed image fills.

What this **can't** recover, because the clipped render bounds no longer map to an
axis-aligned crop of the isolated raster:

- **Rotated** nodes — `rb` is the rotated AABB; the raster is the un-rotated node.
- **Layer-blur** nodes — the blur's raster extends past the shape, and `rb` is
  clipped to the frame, so neither box describes the render.
- **Vectors** whose painted path bounds diverge from both boxes.

These fall back to a **named hidden placeholder** (1px, `⟨render-failed⟩`) rather
than being placed wrong or killing the frame. They still appear in the flattened
composite. In this file that hit only decorative accents (gradient glows, vector
line-art, one rotated badge); the plugin path — which renders in-canvas, with the
clip and effects native — is the documented fix if any of them must be editable.

## Known limits

- Masked groups are flattened (v1). PSD `clipping` maps cleanly onto Figma's
  mask-affects-later-siblings, but mask emulation hides subtle wrongness.
- `SOFT_LIGHT` drifts: Figma/Skia use the W3C formula, Photoshop uses its own.
  Warned once per export.
- Text is rasterized. Editable PSD text is possible but fragile —
  `fontPostScriptName` is `null` for variable fonts, so Photoshop substitutes and
  silently reflows the layout.
- Memory: at `scale: 2` a full-bleed 1440×2560 layer is ~59 MB of RGBA, and
  `writePsdBuffer` needs them all resident. Default `--scale 1`.
