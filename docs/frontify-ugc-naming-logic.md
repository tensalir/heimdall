# Frontify UGC Naming Logic

## Source workbook

Workbook analysed:

- `C:\Users\buyss\OneDrive - Loop\Creative Technology\04_Projects\10_Heimdall\01_UGC Naming Renamer\NamingConvention_v4 - CCP1.xlsm`

This workbook is a macro-enabled naming engine with multiple channel-specific sheets:

- `Meta-NC`
- `PaidSocial-NC`
- `X-NC`
- `Circle-NC`
- `PaidSearch-NC`
- taxonomy and lookup sheets for topics, products, countries, languages, LP codes, and changelog

For Frontify UGC renaming, the relevant part is not the full campaign/ad naming output. The useful layer is the lighter `Batch Name` block.

## Key finding

The workbook already contains the exact reduced naming pattern needed for Frontify batch renaming.

In `Meta-NC`, the `Batch Name` output lives in `C33` and is built from:

- `Source`
- `Number`
- `Name`
- optional `Variation`
- `Batch Number`

Example extracted from the workbook:

- Inputs:
  - `Source = Valeriya`
  - `Number = 040326`
  - `Name = WithVsWithoutLoop`
  - `Variation = blank`
  - `Batch Number = Batch126`
- Output:
  - `Valeriya.040326.WithVsWithoutLoop.Batch126`

The exact workbook formula is:

```text
CONCAT(
  TEXTJOIN(".", TRUE, Source, Number, Name),
  IF(Variation = "", "", CONCAT("-", Variation)),
  ".",
  BatchNumber
)
```

Equivalent programmatic rule:

```ts
baseName = `${source}.${number}.${name}${variation ? `-${variation}` : ''}.${batchNumber}`
```

## Important distinction

The workbook also produces a fuller `Creative Name` layer, for example:

- `Video-UGC-NoiseSensitive-Mix-Black-None-CCP-T2-Valeriya.040326.WithVsWithoutLoop.Batch126`

That is useful for campaign/creative management, but it is not the right target for the Frontify rename flow discussed for UGC videos. For Frontify, we should use the reduced `Batch Name` pattern, not the full creative taxonomy prefix.

## Validation rules derived from the workbook

The formulas enforce a few constraints that should be carried into Heimdall:

- No underscores in user-entered naming fields.
- `Source`, `Number`, `Name`, and `Batch Number` are required for the base Frontify name.
- `Variation` is optional and is appended with `-variation` before the final `.BatchNumber`.
- Taxonomy values are generally normalized tokens rather than free prose.
- Topics and subtopics are maintained in camel/pascal-style tokens in the workbook taxonomy.

## Frontify-specific naming layer

Based on the screenshots and the agreed examples, Frontify needs one base name plus optional aspect-ratio suffixes:

- Base:
  - `Valeriya.040326.WithVsWithoutLoop.Batch126`
- `9x16`:
  - `Valeriya.040326.WithVsWithoutLoop.Batch126.9x16`
- `4x5`:
  - `Valeriya.040326.WithVsWithoutLoop.Batch126.4x5`

Programmatic rule:

```ts
function buildFrontifyAssetName(baseName: string, notation?: '9x16' | '4x5' | null) {
  return notation ? `${baseName}.${notation}` : baseName
}
```

## Proposed Heimdall flow

### Phase 1: Inbox overview

Already underway in Heimdall:

- Read the Frontify `Asset Submission Inbox`
- Group assets by dated inbox folder
- Show operators what has been submitted

### Phase 2: Rename preparation

For each uploaded video or variant group, create a rename draft with:

- `source`
- `number`
- `name`
- `variation` (optional)
- `batchNumber`
- `notation`

Input sources should be prioritized as:

1. Operator-entered form values in Heimdall
2. CSV import for bulk batches
3. Existing metadata, if later added to Frontify submissions
4. Filename heuristics only as a fallback

### Phase 3: Validation

Before applying any rename:

- Reject missing required fields
- Reject underscores in naming tokens
- Trim whitespace
- Normalize obvious spacing issues
- Keep `number` as a six-digit date token like `040326`
- Keep `batchNumber` in the explicit `Batch126` format

### Phase 4: Name generation

1. Build the workbook-aligned base name:
   - `source.number.name[-variation].batchNumber`
2. Detect or assign variant notation:
   - uncaptioned/default = no suffix
   - vertical = `.9x16`
   - portrait alt = `.4x5`
3. Generate the final Frontify asset title and filename stem

### Phase 5: Frontify write

For each asset:

- Update Frontify `title`
- Update Frontify `filename` while preserving the original extension

Example:

- old filename: `clip123.mp4`
- new filename: `Valeriya.040326.WithVsWithoutLoop.Batch126.9x16.mp4`

## Routing recommendation

From the screenshots, folder structure and naming are related but should be treated as separate layers:

- naming determines the canonical asset name
- routing determines whether the asset belongs under:
  - `UGC / Organic / ...`
  - `UGC / Performance / Content Creator Pool / Batches / ...`
  - another UGC subtree

Because that routing logic is flexible and business-driven, Heimdall should implement:

- rename first
- optional move second

The move step should only be automated once the team defines stable folder rules.

## Recommended implementation scope

For the next rename implementation pass in Heimdall:

- implement the base-name generator from the workbook logic
- add optional aspect-ratio suffixing for Frontify
- support operator review before apply
- defer automatic folder routing until folder mapping rules are explicit

This keeps the first Frontify rename workflow aligned with the workbook while respecting the real flexibility shown in the screenshots and team notes.
