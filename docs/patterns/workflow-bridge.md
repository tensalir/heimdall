# Workflow Bridge

## Intent

Fill the gaps between SaaS tools the team is not replacing. Move information faithfully between systems, surface patterns the systems cannot show on their own, and stay small enough to absorb upstream API changes without forcing a re-platform.

## Seen in

- `heimdall` (Monday Docs to Figma briefings, Figma comments to feedback sheets, Frontify to internal intake, HiBob to Monday leave sync, document corpus to GPT Actions retrieval).
- `babylon` (Monday and Frontify to video pipeline, Figma to localization hub via the Heimdall payload contract, Frontify push-back for finished dubs).
- Cousin pattern: any internal tool whose primary value is connective tissue rather than a new system of record.

## Transfer

The pattern crystallized in Heimdall when the briefing sync (Monday Doc to Figma page) became the first bridge that worked end-to-end. Once that worked, adjacent gaps surfaced naturally and got the same treatment. Babylon adopted the same posture for its localization surfaces: it does not try to replace Monday, Figma, or Frontify; it sits between them and adds the translation pipeline the vendors are not building.

The principle is older than the codename. It descends from the same observation that drives software-for-few: the SaaS layer is mostly fine, the gaps are where the cost lives, and AI-assisted building is now cheap enough to fill those gaps without an agency project.

## Best current expression

`heimdall` for the most complete bridge layer (multiple integrations, plugin layer, idempotent page creation, routing map, queue and audit). `babylon` for a domain-specific bridge (localization-shaped, but built on the same posture).

## Do not copy

- Loop board IDs, Monday column mappings, Figma template conventions, Frontify project paths, HiBob fields. Reuse the shape; rewrite the configuration.
- Routing map structures that assume Loop's monthly file convention.
- Webhook handlers that depend on specific Monday status taxonomies.
- The assumption that the bridge can grow into a system of record. The shape stops working at scale; if you cross that line, plan a new architecture.

## Reusable principle

When the team's existing SaaS stack is doing its job and the cost lives in the gaps between tools, build the bridge instead of a replacement. Make each integration small, idempotent, and replaceable. Surface the patterns that no individual tool can see on its own. Stay narrow enough that an upstream API change is a one-day fix, not a re-platform.

## Encoding target

- `thoughtform-repos` Skill pattern card.
- ADR for any future internal tool that connects three or more SaaS systems.
- Reference in the per-repo README "Why this exists" section, where the bridge framing should be explicit.

## Status

`candidate-canonical`. Promote to `canonical` when a non-Loop repo (Thoughtform internal or external client) ships a bridge built on the same posture.

## Evidence

- Heimdall's Monday/Figma/Frontify/HiBob/document-chat/Iterator surfaces (see this repo's README).
- `babylon` localization hub consuming Heimdall's HMAC-authenticated Figma payload.
