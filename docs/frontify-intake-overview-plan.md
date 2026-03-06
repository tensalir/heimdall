# Heimdall Frontify Intake Plan

## Outcome

Build a separate internal Heimdall feature for Frontify intake operations: pull one or more Frontify submission inboxes into a unified overview, preview submitted UGC assets, and later bulk rename them to the approved naming convention.

Heimdall is the better home for this than Babylon because it already owns the Monday + Frontify integration surface and internal operator tooling through `ARCHITECTURE.md`, `docs/FRONTIFY_INTEGRATION.md`, and the existing Frontify client/provider at `src/integrations/frontify/client.ts` and `src/integrations/providers/frontifyProvider.ts`.

## Confirmed constraints

- Frontify `Asset Submission Block` submissions land in an `Asset Submission Inbox` inside the selected library, with dated subfolders.
- Frontify GraphQL supports `updateAsset`, including both `title` and `filename`, so bulk rename is feasible.
- Frontify `moveAssets` only supports moves within the same library/workspace.
- Because final destinations span multiple libraries, the recommended intake model is `one inbox per destination library or use case`, while Heimdall provides a single aggregated overview across those inboxes.

## Recommended feature shape

Follow Heimdall’s architecture rule for internal tools and start this as an internal namespace under admin:

- UI: `app/admin/frontify-intake/page.tsx`
- API: `app/api/frontify-intake/*`
- Domain: `src/domain/frontifyIntake/*`
- Integration: extend `src/integrations/frontify/client.ts`

## Architecture

```mermaid
flowchart LR
  submitter[UGCCreator] --> submitBlock[SubmissionBlock]
  submitBlock --> libraryInbox[LibraryAssetSubmissionInbox]
  libraryInbox --> intakeApi[HeimdallFrontifyIntakeAPI]
  intakeApi --> intakeUi[HeimdallInboxOverview]
  intakeUi --> renameEngine[BulkRenameEngine]
  renameEngine --> destinationFolder[LibraryTargetFolders]
```

## Implementation phases

1. Extend the Frontify integration layer so Heimdall can browse library inbox folders, enumerate dated inbox subfolders, and list assets with the metadata needed for an intake overview.
2. Add an internal Heimdall page that aggregates configured inboxes and shows what has been submitted: library, inbox folder, submit date bucket, asset name, file type, and current status.
3. Add a dry-run rename engine that derives proposed names from the agreed naming convention and previews `current -> proposed` changes before any writes.
4. Add apply mode to update both Frontify `title` and `filename`, preserving the original extension on `filename`.
5. Add optional in-library routing after rename for libraries where the final folders are known and remain within the same library.
6. Add a CSV override/import path for backlog cleanup and exception handling.

## Product recommendation

Make the Heimdall feature the single operational dashboard across multiple libraries, but keep the Frontify intake itself per library. That gives operators one overview while respecting Frontify’s same-library move constraint.

## Inputs needed later

- The actual Frontify library ID(s) and inbox location(s) to monitor.
- The canonical naming convention tokens and variant rules for `9x16`, `4x5`, and uncaptioned/default assets.
- The per-library destination folder mappings for any automated move step.
- Whether rename should run only on operator approval or support a scheduled apply mode.

## Initial build status

The first implementation slice should prioritize `overview before rename`:

- Add library configuration storage in Heimdall.
- Pull inbox contents from Frontify into an aggregated admin overview.
- Hold bulk rename/apply until the real library IDs and naming inputs are provided.
