# Figma template setup for Heimdall

## Template page

- Create a page named **"Briefing Template to Duplicate"** (or "Briefing Template" / "Template") in your monthly Performance Ads file.
- This page will be cloned once per queued experiment; the clone is renamed to the experiment name (e.g. `EXP-LM177.ChooseYourLoop-Mix-Productfocus`).

## Placeholder IDs

For each text node that should be filled from Monday briefing data, set **plugin data** on that node:

- **Key:** `heimdallId` (or `placeholderId` for legacy)
- **Value:** one of the IDs below.

| Placeholder ID | Monday / briefing source |
|----------------|--------------------------|
| `heimdall:exp_name` | Experiment name (item name) |
| `heimdall:idea` | Idea / Why |
| `heimdall:audience_region` | Audience / region |
| `heimdall:segment` | Segment (e.g. TOF) |
| `heimdall:formats` | Formats (e.g. Video) |
| `heimdall:var_a_headline` | Variation A headline |
| `heimdall:var_a_subline` | Variation A subline |
| `heimdall:var_a_cta` | Variation A CTA |
| `heimdall:var_b_headline` | … same for B, C, D |
| `heimdall:var_b_subline` | |
| `heimdall:var_b_cta` | |
| `heimdall:var_c_headline` | |
| `heimdall:var_c_subline` | |
| `heimdall:var_c_cta` | |
| `heimdall:var_d_headline` | |
| `heimdall:var_d_subline` | |
| `heimdall:var_d_cta` | |

## Section divider pages (page ordering)

Monthly design files use **empty pages as section headers** to group experiments by product/use case (e.g. "BUNDLES", "SWITCH", "ENGAGED KITS"). When Heimdall creates a new experiment page, it inserts it under the correct section divider.

### How it works

1. The briefing's `sectionName` is extracted from Monday (columns: `use_case`, `product`, `product_category`, `section`, `category`).
2. If no explicit column is found, Heimdall parses the experiment name for known keywords (e.g. "Bundles" in `EXP-SB150.Q&ABundles-Bundles-Mix`).
3. The plugin scans `figma.root.children` for section divider pages (non-EXP, non-template pages) and inserts the new page just before the next section divider.
4. If no matching section is found, the page is appended at the end.

### Known sections (add more in `src/domain/briefing/mondayToBriefing.ts`)

- BUNDLES
- SWITCH
- ENGAGED KITS
- NOISE CANCELLING
- NOISE SENSITIVITY

### Adding a new section

1. Create an empty page in the Figma file with the section name (e.g. "NEW PRODUCT").
2. Add the name to `KNOWN_SECTIONS` in `src/domain/briefing/mondayToBriefing.ts`.
3. Ensure the Monday item has a matching value in its `use_case` / `product` column.

## Design asset slots and media targets

Each design variation (A through D) contains an **Assets** row with three aspect-ratio frames:

- `NAME-EXP-9x16` (1080 x 1920)
- `NAME-EXP-4x5` (1080 x 1350)
- `NAME-EXP-1x1` (1080 x 1080)

Inside each of these outer frames, there is a **Media Target** rectangle node. This is the intended selection layer for placing visual assets (images, video fills, video posters).

- The outer `NAME-EXP-*` frame is the structural slot used by Heimdall for mapping, renaming, and layout.
- The inner `Media Target` is the leaf node designers should select when placing content.
- **Previewing video:** In Figma, video is a **fill** on a shape. Use the **Fill** section in the right sidebar to play/scrub the selected layer. **`Shift+Space` is not “play this video”** — it opens Figma’s **inline prototype preview** for the file/page, which often feels like “the whole page” when your layout lives under a large frame (e.g. `Name Briefing`). See Figma’s docs: [Play your prototypes](https://help.figma.com/hc/en-us/articles/360040318013) and [Use videos in prototypes](https://help.figma.com/hc/en-us/articles/8878274530455-Use-videos-in-prototypes).
- **Heimdall plugin:** Open the Heimdall plugin and use **Preview diagnostics** (read-only JSON: selection, fills, flow hints) or **Preview selected asset** to clone the chosen media into a **top-level** frame named `Heimdall · Media Preview` so you can scrub video in the Fill panel or use prototype preview on that smaller surface without copying layers by hand.
- **Fix Layouts** will automatically backfill a `Media Target` into any existing asset frame that is missing one, without removing existing content.

## Long text (overflow)

- By default, the plugin sets **text auto-resize** to **HEIGHT** on filled text nodes so they grow with content.
- Ensure the frame containing these text nodes uses auto-layout (or enough space) so that growing height doesn't clip. For very long copy, consider a scrollable container or a "notes" block in the template.

## Version history and restore

Every plugin write operation (sync, template creation, layout fix, widget migration, image import) captures page snapshots in Supabase for version history.

### How it works

- **Pre-write snapshots** are captured automatically before destructive operations (template overwrite, page update, image import).
- **Post-write snapshots** are captured after successful job completion via `/api/jobs/complete`.
- Snapshots are stored in the `briefing_page_versions` table, linked to `briefing_syncs` via `current_version_id`.

### Browsing history

- `GET /api/plugin/versions?mondayItemId=X&figmaFileKey=Y` returns version history for a specific page.
- `GET /api/plugin/versions?figmaFileKey=Y` returns all versions for a file.

### Restoring a version

- `POST /api/plugin/restore` queues a restore-as-copy operation for a specific version.
- The plugin fetches pending restore items via `GET /api/plugin/restore?figmaFileKey=X` and creates a new page from the snapshot.
- Default restore mode is **restore_copy**: a new page is created alongside the current one, named `[Original] [restored vN]`. The current page is never overwritten by default.

### Backfilling existing pages

- `POST /api/plugin/backfill-versions` creates version-1 snapshots for synced pages that have no history yet.
- Run this before structural repairs (like media target backfill) to ensure a restore point exists.

### Known limitations

- Snapshots capture page structure (node tree, text content, plugin data) but not binary image data. Image fidelity on restore is best-effort.
- Pages synced with a file-name fallback (no real `figma_file_key`) have limited restore reliability.
- In-place restore is not yet supported; only restore-as-copy is available in V1.
