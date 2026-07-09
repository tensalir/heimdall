---
name: figma-to-psd
description: >
  Convert Figma frames into layered Photoshop (PSD) files via the Figma REST API —
  no Figma plugin, no Photoshop, no desktop app needed. One .psd per frame, layers
  preserved, plus a .text.json sidecar with the copy. Use this skill whenever the
  user wants a PSD, layered file, or "Photoshop version" of a Figma design, mentions
  handing off Figma designs to an external partner or agency (Amazon A+ content,
  retail media, print), asks to "export layers" from Figma, or shares a figma.com
  URL together with any mention of PSD/Photoshop/layered export. Also use it to
  check WHETHER a Figma file can survive conversion (the probe step) even if the
  user hasn't committed to exporting yet.
compatibility: Requires Node.js 20+, npm, network access to api.figma.com, and a Figma personal access token (asked for at runtime). Python + Pillow optional, for independent output verification.
---

# Figma → layered PSD

Turns Figma frames into layered `.psd` files using only the Figma REST API.
Figma's servers rasterize each layer in isolation; the bundled scripts do the
geometry, cropping, and PSD assembly. Everything runs locally in this
environment — no plugin, no Photoshop.

## The workflow

Follow these stages in order. Each exists because skipping it produced real
failures; don't collapse them.

### 1. Token

The scripts need `FIGMA_ACCESS_TOKEN` in the environment.

- Check the environment first. If not set, ask the user for their Figma
  **personal access token** (Figma → Settings → Security → Personal access
  tokens → Generate new token, scope **File content → Read-only**).
- Validate it before doing anything else:

```sh
curl -s -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" https://api.figma.com/v1/me
```

A 200 with user JSON means go. `{"err":"Token expired"}` means ask for a fresh
token — don't retry. A valid token can still hit a 403 on `/v1/images` if the
user's Figma org restricts content access; if that happens, the REST path is
closed for that org and no amount of retrying helps (tell the user; the
conversion would need a Figma plugin instead).

Never write the token into a file that could be committed or packaged. Pass it
as an environment variable.

### 2. Setup (first run only)

The converter lives in `scripts/` and is self-contained. If
`scripts/node_modules` doesn't exist:

```sh
cd <skill>/scripts && npm install --no-audit --no-fund
```

(`sharp` ships prebuilt binaries; no compiler needed.)

### 3. Parse what the user gave you

A Figma URL looks like `figma.com/design/<FILE_KEY>/<name>?node-id=<id>`.
Extract the file key. Node ids appear as `1-23` in URLs; the scripts accept
both `1-23` and `1:23`.

### 4. Probe before exporting — always

```sh
cd <skill>/scripts
npm run probe -- --file <FILE_KEY>              # lists pages and top-level frames
npm run probe -- --file <FILE_KEY> --node <id,id,...>   # eligibility check per frame
```

Two judgment calls the probe output feeds:

**Which frames are the actual deliverables?** Design files mix deliverable
frames with scaffolding (frames named "Assets", "Safe Zones", "Interface",
"Guides"). Deliverables are often *nested inside* container frames — a frame
named "Assets" may hold the real 9x16 and 4x5 creatives as children. If a
top-level frame looks like a container (generic name, size much larger than a
standard ad ratio), fetch its children via the API and offer the nested frames
instead. Each variant (9x16, 4x5, 1x1) is its own PSD — never merge them.
When in doubt, show the user the frame list and ask which ones they want.

**Can these frames survive isolated rendering?** The probe flags:

| Finding | Meaning |
|---|---|
| `BACKGROUND_BLUR` | Hard tripwire. The subtree gets flattened; near the root you get a one-layer PSD. |
| `maskType: LUMINANCE` | Hard tripwire. Same treatment. |
| hidden / zero-opacity | Fine — becomes a named, hidden placeholder layer. |
| `renderable leaf > 400` | Too granular; expect a heavy, slow export. |

`GO` means export. Anything else: explain the consequence to the user before
proceeding, don't silently produce a degraded file.

### 5. Export

```sh
npm run export -- --file <FILE_KEY> --node <id,id,...> --scale 1 --out <dir>
```

- `--scale 1` is the right default. Higher scales multiply memory (~59 MB per
  full-bleed layer at scale 2) and Figma clamps oversized renders harder.
- Each frame yields `<Name>.psd` plus `<Name>.text.json` — text is rasterized
  into the PSD, the sidecar keeps the copy machine-readable. Always mention the
  sidecar when delivering.
- Frames export sequentially (the images API is rate-limited by render cost).
  A ~150-layer frame takes a few minutes; tell the user before a big batch.

### 6. Read the warnings — they are the honest part

The exporter never guesses. When it can't place a layer correctly it says so.
Translate the warnings for the user:

- `bounds-drift … clipped by ancestor: rendered WxH, cropped to WxH` — normal
  and handled. The design uses oversized images cropped by the frame; the
  converter cropped the isolated render to the visible region. If it also says
  `then resized`, Figma clamped a giant image and some resolution was lost on
  that layer (unavoidable; only affects heavily-zoomed image fills).
- `render-failed … Not reconcilable` → the layer became a **named hidden
  placeholder** (1px, suffix `⟨render-failed⟩`). Causes: rotated nodes,
  LAYER_BLUR glows, vector paths whose painted bounds diverge from their boxes.
  These still look right in the flattened composite; they're just not separately
  editable. Tell the user which layers, and that they're typically decorative.
- `painted-flattened` — a container that paints its own background (a pill CTA
  button) rendered as one unit. Correct behaviour; the button's text is in the
  sidecar.
- `soft-light-drift` — Photoshop's soft-light formula differs from Figma's;
  expect slight visual drift on those layers.

### 7. Verify before delivering

Never hand over unverified PSDs. If Python + Pillow are available:

```sh
python -c "
from PIL import Image
im = Image.open('<file>.psd')
print(im.size, len(im.layers), 'layers')
for L in im.layers[:10]: print(' ', L[0], L[2])"
```

Pillow is an independent parser — a much stronger check than reading back with
the same library that wrote the file. Check: canvas size matches the frame,
layer count is plausible, real layers have non-trivial bboxes. **The flattened
preview proves nothing** (it comes from Figma's own frame render and looks right
even if every layer is misplaced) — check individual layer bboxes.

No Python? At minimum check the files exist with plausible sizes (a 1440x2560
frame is roughly 15–60 MB), and suggest the user drag one into photopea.com
for a visual check.

### 8. Deliver

Give the user the output directory, per-frame stats (size, layer count), the
placeholder list if any, and remind them of the `.text.json` sidecars. If any
frame degraded badly (one-layer PSD from a near-root tripwire), say so plainly
rather than presenting it as a success.

## What this cannot do (be upfront)

- **Editable text layers.** Text is rasterized; the sidecar carries the copy.
  Editable PSD text would require font matching that fails silently on variable
  fonts — worse than honest rasterization.
- **Rotated / layer-blurred elements as separate layers** — hidden placeholders
  (see stage 6). Fine for decoration; a dealbreaker only if the user needs
  exactly those elements editable.
- **Org-restricted files.** If the Figma org blocks content access via API,
  nothing here works — the token gets 403 on `/v1/images` despite being valid.
- **Figma MCP is not a substitute.** The MCP connector can screenshot designs
  but cannot batch-render isolated nodes; this pipeline needs the REST token
  regardless of whether an MCP is connected.

## References

- `references/architecture.md` — how the converter works internally (read when
  debugging a failed export or unexpected geometry, not for normal use).
