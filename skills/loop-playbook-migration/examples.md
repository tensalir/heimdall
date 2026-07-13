# Worked examples

> This file is intentionally a skeleton. After Gabriel's recorded walkthrough lands and Phase 4 of the migration plan runs, fill in 3–5 worked examples here. The translator does **not** load this file directly; it's a reference for humans iterating on `SKILL.md`.

## Template for each example

```
### Example: <page title>

**Source:** `tools/playbook-migration/pages/<slug>.json`
**Manual reference:** <link to Gabriel's manually-migrated page on Google Sites, or screenshot path>

**Why this example matters:**
<one-line explanation of what design decision this page exercises>

**Notable mappings:**
- <SharePoint pattern> -> <Google Sites translation> (rule: <rule name>)
- <SharePoint pattern> -> manualOverride: "<reason>" (rule: <rule name>)

**Diff vs. Gabriel's manual version:**
<paste a short diff or describe in 2-3 lines what's different and why it's acceptable>
```

## Examples to capture (when Gabriel's video lands)

1. A simple text-heavy page with one hero banner — proves the "hero is always manualOverride" rule.
2. A two-column page with image+text — proves twoColumn block selection.
3. A three-column "card grid" page — proves the "collapse to single column" rule.
4. A page with brand-collab imagery — proves the manualOverride pattern for collab visuals.
5. A page with colored callouts as primary visual rhythm — proves the global override pattern.
