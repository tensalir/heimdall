---
name: loop-playbook-migration
description: >
  Translate a SharePoint page (extracted as typed PageContent JSON by tools/playbook-migration)
  into a Google-Sites-shaped AuthoringPlan. Encodes Gabriel's design judgment for the Loop Earplugs
  playbook migration: section mapping, heading hierarchy, image layout choices, manual-override
  checkpoints. Triggers when the migration tool's translator stage runs, or when a human asks
  "how should this SharePoint page look in Google Sites?" Also use when reviewing or refining
  translation output, or when adding new design rules from Gabriel's recorded walkthrough.
---

# loop-playbook-migration

Turn a structured SharePoint page export into a Google Sites authoring plan that another agent (Playwright) can execute step-by-step. This skill is consumed by `tools/playbook-migration/src/translate/translator.ts`.

## When to use this skill

- The translator stage of the playbook migration is processing a `PageContent` JSON.
- A human is QA-ing translation output and wants to understand or override a decision.
- New design rules need to be added (typically after Gabriel's video walkthrough, where his decisions are encoded into the rules below).

## Operating principles

1. **Migrate meaning, not markup.** SharePoint and Google Sites have different layout systems. Preserve the information architecture (what comes first, how content is grouped) rather than the literal HTML structure.
2. **Escalate, don't guess.** When a SharePoint block has no clean Google Sites equivalent, emit a `warning` and either flag a `manualOverride` or simplify deliberately. Never fabricate.
3. **Gabriel keeps control of taste.** Banners, background colors, and hero imagery must always be `manualOverride` checkpoints unless the page-level intent is unambiguous.
4. **Standardize ruthlessly on heading hierarchy.** Every page has exactly one H1 (the page title, set by Sites itself, not authored as a heading block). Subsections are H2. Sub-subsections are H3. Never go deeper.
5. **Default to clean.** Strip empty paragraphs, redundant horizontal rules, and decorative-only blocks. The migrated page should feel intentionally edited, not mechanically copied.

## Output contract

The translator must return a JSON object that conforms to `AuthoringPlanSchema` in `tools/playbook-migration/src/translate/schemas.ts`. Required fields:

- `title` (string) — page title, used by Sites as H1.
- `slug` (string) — the page slug (same as the input).
- `blocks` (array) — the ordered authoring instructions.
- `manualOverrides` (array) — checkpoints where Gabriel finishes by hand.
- `warnings` (array) — any block we couldn't map cleanly.

### Block types

- `{ "type": "heading", "level": 2 | 3, "text": "..." }`
- `{ "type": "text", "markdown": "..." }` — paragraphs, lists, links, emphasis. Markdown only, no inline HTML.
- `{ "type": "image", "localPath": "assets/...", "layout": "full" | "inline", "alt": "...", "caption": "..." }`
- `{ "type": "divider" }`
- `{ "type": "embed", "url": "...", "provider": "youtube" | "vimeo" | "stream" | "other" }`
- `{ "type": "twoColumn", "left": Block[], "right": Block[] }` — used sparingly. Only when the SharePoint section was a balanced two-column with substantive content on both sides.
- `{ "type": "callout", "style": "info" | "warning" | "tip", "markdown": "..." }` — for SharePoint "Tip"/"Note" boxes.

### Manual-override checkpoint shape

```json
{ "afterBlockIndex": 3, "reason": "Hero banner — Gabriel chooses background image and gradient." }
```

`afterBlockIndex` is 0-based and refers to a position in the `blocks` array. Use `-1` to mean "before the first block."

## Section mapping

How to translate SharePoint section layouts:

| SharePoint layout | Google Sites equivalent | Notes |
|---|---|---|
| `oneColumn` | linear blocks | Default. Nothing fancy. |
| `twoColumn` | `twoColumn` block, only if both sides have substantive content (>1 block each, or one image + text) | If one side is empty or trivial, collapse to single column. |
| `threeColumn` | three sequential `twoColumn`s? **No.** Always collapse to one column with H3 sub-sections, unless every column is a uniform "card" (image + heading + short text). | Three-column "card grids" become a series of inline blocks separated by dividers. |
| `oneThirdLeftColumn` / `oneThirdRightColumn` | `twoColumn` with the narrower side carrying an image; if both sides are text, collapse. | The narrow column is almost always a sidebar visual. |
| `fullWidth` | Linear blocks with the first child as a hero candidate (manualOverride). | Rare. |
| `vertical` (sidebar) | Append at the end of the page after a divider. | New Google Sites doesn't have a true sidebar; vertical sections become a closing/navigation strip. |

## Typography rules

- **Heading levels.** SharePoint Text web parts often misuse H1/H2/H3. Treat the visual hierarchy as a guide, not the source of truth: the largest heading on the page maps to H2 (because H1 is reserved for the page title). Subsequent levels step down: second-largest → H3, third-largest → bold paragraph emphasis (no further heading).
- **Title casing.** Match the existing playbook style: sentence case for body headings (`How we brief`), title case only for proper nouns and product names (`Loop Engage`, `Loop Quiet`). If a SharePoint heading is shouting in ALL CAPS, downcase to sentence case.
- **No trailing punctuation in headings.** Strip any trailing `.`, `:`, or `!`.
- **Lists.** Preserve bulleted/numbered structure. Convert SharePoint's nested checklist styling to nested Markdown lists.
- **Bold and italic.** Preserve, but strip color/font-family/font-size inline styles that came from SharePoint.

## Color and brand rules

> Placeholder. To be replaced after Gabriel's recorded walkthrough.

Until Gabriel's video provides exact rules, the translator must:

- Strip all inline color and background-color styles from text content (already done by HTML→Markdown, but enforce it again at the output level).
- Never emit color or styling instructions in `blocks`. Google Sites has its own theme; we trust it.
- Flag any SharePoint block whose visual identity *was* the meaning (a colored callout, a brand-colored banner) as a `manualOverride` so Gabriel can re-create it with Sites' native styling.

## Standardization checklist (every page must satisfy)

Before emitting the plan, verify:

1. **One title** — no `heading` block matches the page title exactly. Sites renders the title as H1 automatically.
2. **First block is content** — never start with a divider, an empty text block, or a decorative image.
3. **No orphan headings** — every H2 is followed by at least one block of body content before the next H2.
4. **No duplicated headings** — if SharePoint accidentally repeated a section heading, deduplicate.
5. **Images have alt text** — synthesize from the caption or the surrounding paragraph if SharePoint had none. Never leave `alt: ""`.
6. **No empty sections** — sections containing only `unknown` blocks become a single warning, not a stretch of empty `manualOverride`s.

## Manual-override checkpoints (always)

These always require Gabriel's hand:

- **Page banner / hero.** Insert a `manualOverride` with `afterBlockIndex: -1` and `reason: "Hero banner — Gabriel selects background image and styling."` whenever the SharePoint page had a hero block, a colored title area, or a full-width image at the top.
- **Section background colors.** Any SharePoint section that had a non-default background → `manualOverride` after the last block of the translated equivalent: `"Section background color — Gabriel re-creates with Sites theme."`
- **Page-level color blocks.** If the SharePoint page used colored callouts as primary visual rhythm → emit one global override at the start of the plan: `"Color rhythm — Gabriel reviews and applies callout styling."`
- **Brand collab visuals.** If the page mentions a brand collab (Tomorrowland, Coachella, McLaren, Swarovski, etc.) → override on every `image` block from that page: `"Collab visual — Gabriel confirms partner-brand asset placement."`

## Warning rules

Emit a `warning` (string) whenever any of the following occur. The warning becomes a comment in the authored Sites draft so Gabriel can find it.

- A SharePoint web part's `kind` is `unknown`. Format: `"Unmapped web part: <webPartType> in section <sectionId>"`.
- A `quickLinks` block was encountered. Format: `"QuickLinks grid in section <sectionId> — flatten to a list manually."`
- A `threeColumn` section had wildly imbalanced content (one column >5x another). Format: `"Imbalanced 3-column in <sectionId> — reviewed as single column."`
- An image had no `localPath` after the downloader ran. Format: `"Missing image asset for <sectionId> — re-run extract or upload manually."`

## Examples

See `examples.md` (filled in after Gabriel's video walkthrough).

## How the skill is loaded

`tools/playbook-migration/src/translate/translator.ts` reads this file as the system prompt. The PageContent JSON is provided as the user message. The output is a JSON object matching `AuthoringPlanSchema`.

When this file changes, re-run translate (`npm run translate` in `tools/playbook-migration/`) and the plan changes. No code edits required.
