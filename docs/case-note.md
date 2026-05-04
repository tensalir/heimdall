# Heimdall Case Note

The build story behind Heimdall. The README answers what it is. This note answers how it came to be and what it proves about how the bridge framing works in practice.

## Trigger

Loop's design briefings live in Monday.com Docs. The design team works in Figma. Each month, someone had to read every brief, find the correct Figma file for the active monthly template, create a page following the template format, and paste the content in. Volume kept rising. The copy-paste tax was visible to the team running it and invisible to leadership above it.

The first ask was concrete: can we move briefings from Monday into Figma automatically, following the team's specific template formats? Monday has structured data behind a GraphQL API. Figma is an infinite canvas with very different ergonomics. The bridge had to figure out the difference.

## Bottleneck

The visible bottleneck was manual transcription. The deeper bottleneck was that no off-the-shelf tool was going to connect Monday Docs to Figma pages with Loop's template logic. Vendors do not build for one team's template format. An external agency build was not justifiable for the user count. Without AI-assisted building, the team would have stayed in copy-paste mode indefinitely, paying the tax invisibly.

The same shape repeated as scope grew. Stakeholder feedback lived across Figma comments, Slack threads, and verbal review. Aggregating it required someone to do the round trip. The studio team needed format derivation (9:16, 4:5, 1:1) inside Figma without redoing the layout per variant. None of those gaps had a vendor solution that fit, and each one had clear business impact for a small group of users.

## Key insight

The tools are not going away. Monday, Figma, and Frontify do their jobs and Loop will keep using them. The value is in the connective tissue between them and in the features too specific for any vendor to build. Heimdall's role is to fill those gaps without replacing the systems on either side.

That framing has a useful side effect. Because Heimdall does not try to be the system of record for any of the connected tools, it stays small and replaceable. If Monday changes its API or Figma adds native templates, Heimdall absorbs the change at the bridge instead of forcing a re-platform on the team.

## What emerged

A multi-surface internal tool around four anchor capabilities: briefing sync, the Iterator Figma plugin, feedback summarisation, and the ops pipeline view. Plus document collections, Frontify intake, HiBob leave sync, and an admin hub for routing and health.

Heimdall also originated the paid-social briefing assistant work that lived inside the repo for a while. As that stream's needs grew toward research, evidence synthesis, and creative-strategy briefing, it outgrew the bridge framing and was extracted into [Mimir](https://github.com/tensalir/mimir). Heimdall stayed focused on what it does best: moving information faithfully between systems and surfacing what those systems do not.

## Transfer lineage

- **Informed by:** Babylon's multi-surface hub shape (one auth, one navigation, multiple specialized surfaces) and Babylon's sheet-based review surface (now the Heimdall feedback summariser); the Loop Monday and Figma conventions; the Loop-Vesper design tokens.
- **Informs:** Babylon (provides the Figma copy ingestion bridge, HMAC-authenticated payload contract); Mimir (the briefing assistant capability that originated here is now its own repo and consumes Heimdall's structured inputs).
- **Knowledge transfer mode:** principle transfer dominates. The bridge metaphor, the sheet shape, and the routing-map idea are reusable. Loop board IDs, Frontify project paths, and Figma template conventions are not.

## Reusable patterns

- [workflow-bridge](patterns/workflow-bridge.md) — Heimdall's contribution to the constellation; fill the gaps between SaaS tools without replacing them.
- [software-for-few](https://github.com/tensalir/Loop-Vesper/blob/main/docs/patterns/software-for-few.md) — the framing that makes the bridge build justifiable.
- [skill-as-portable-substrate](https://github.com/tensalir/Loop-Vesper/blob/main/docs/patterns/skill-as-portable-substrate.md) — the Claude mapping agent and the briefing field extractor are encoded as Skills usable both inside Heimdall and out.

## What not to copy

- Loop board IDs, column mappings, and the specific Loop Monday Doc structure.
- Loop Figma template conventions (page naming, monthly file routing, frame structures).
- The Loop CCP naming taxonomy referenced via Babylon and Frontify.
- The HiBob leave sync logic and webhook handlers (Loop-specific HR setup).
- Any briefing assistant code that was extracted into Mimir; treat Heimdall as the bridge layer, not the upstream creative-strategy layer.

## Portfolio interpretation

Heimdall proves that connective software can be the product. When the existing SaaS layer is fine but the gaps between systems are paying a daily tax, the leverage move is not a new platform. It is the bridge that absorbs the change between systems and surfaces what they cannot. Building it that way also makes the next bridge cheaper, because each integration is small and replaceable.

## Provenance

Drafted from a May 2026 retrospective and the working notes staged at [thoughtform-repo-intelligence/proposals/heimdall](https://github.com/thoughtform-co/thoughtform-repo-intelligence/tree/main/proposals/heimdall).
