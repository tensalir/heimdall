#!/usr/bin/env bash
# Post-deploy cleanup for the need-state ad discovery migration.
#
# Run this ONCE after deploying the 024 migration + code changes.
# It does two things:
#   1. Re-runs the quality pass on ALL existing ads (not just pending).
#      This applies the raised threshold (40) and backfills need_state.
#   2. Triggers a fresh watchlist sync with the new need-state-aligned seeds.
#
# Usage:
#   BASE_URL=https://your-app.vercel.app ./scripts/post-deploy-need-state-cleanup.sh
#
# Or for local dev:
#   BASE_URL=http://localhost:3000 ./scripts/post-deploy-need-state-cleanup.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "=== Step 1: Re-qualify all existing ads ==="
echo "This re-evaluates every ad with the updated tagger (raised threshold + need_state classification)."
echo "POST ${BASE_URL}/api/briefing-assistant/meta-ads?action=run-quality-pass"

curl -s -X POST "${BASE_URL}/api/briefing-assistant/meta-ads?action=run-quality-pass" \
  -H "Content-Type: application/json" \
  -d '{"requalify_all": true}' | jq .

echo ""
echo "=== Step 2: Trigger fresh watchlist sync ==="
echo "This pulls new ads using the 6 need-state-aligned search terms."
echo "POST ${BASE_URL}/api/briefing-assistant/meta-ads?action=sync-watchlist"

curl -s -X POST "${BASE_URL}/api/briefing-assistant/meta-ads?action=sync-watchlist" | jq .

echo ""
echo "=== Done ==="
echo "The quality pass runs in the background. Check logs for progress."
echo "The watchlist sync also runs in the background. New ads will appear within a few minutes."
