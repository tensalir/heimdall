# Supply-Chain Security

This repo follows the [`npm-supply-chain-defense`](https://github.com/thoughtform-co/npm-supply-chain-defense) skill (installed locally at `~/.cursor/skills/npm-supply-chain-defense` and `~/.claude/skills/npm-supply-chain-defense`).

## Baseline

- Baseline: **B (npm)**
- Cooldown: `minimum-release-age=10080` minutes (7 days)
- Lifecycle scripts: `ignore-scripts=true` (or `ignoreScripts = true` for Bun)
- Git dependencies: `allow-git=none` (npm only; pnpm/Yarn/Bun enforced via lockfile review)
- Migration to pnpm@11 is recommended but **deferred**: pinning `packageManager` and running `pnpm install` should happen in a supervised step after the cooldown is verified.

## Approved lifecycle scripts

| Package | Reason | How to run |
|---|---|---|
| _(none yet)_ | _document here when an exception is needed_ | `npm rebuild --force <pkg>` after the safe install step |

## Exceptions

| Setting | Value | Reason | Owner | Expiry |
|---|---|---|---|---|
| _(none)_ |  |  |  |  |

## Quick commands

```powershell
# Scan this repo (read-only)
pwsh -NoProfile -File "$env:USERPROFILE/.cursor/skills/npm-supply-chain-defense/scripts/scan-repos.ps1" -Roots .

# Host persistence check (read-only)
pwsh -NoProfile -File "$env:USERPROFILE/.cursor/skills/npm-supply-chain-defense/scripts/ioc-host.ps1"
```

## Incident response

See PLAYBOOKS.md in the skill. Default to the Green Path. Switch to Red Path only when the scanner returns a hit. **Network-isolate before token revocation.**