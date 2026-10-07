#!/usr/bin/env bash
# Builds the PWA and deploys Firebase Hosting plus Firestore rules and indexes.
#
#   PROJECT_ID=my-crumb pnpm deploy:web
#
# Needs apps/web/.env.production.local (copy apps/web/.env.production.example).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
[[ -n "$PROJECT_ID" ]] || { echo "Set PROJECT_ID" >&2; exit 1; }

env_file="apps/web/.env.production.local"
if [[ ! -f "$env_file" ]]; then
  echo "Missing $env_file — copy apps/web/.env.production.example and fill in your web app config." >&2
  exit 1
fi
if grep -q "VITE_USE_EMULATORS=true" "$env_file"; then
  echo "$env_file has VITE_USE_EMULATORS=true; production must use the real project." >&2
  exit 1
fi

pnpm --filter @crumb/web build
pnpm exec firebase deploy --project "$PROJECT_ID" --only hosting,firestore:rules,firestore:indexes
echo "Live at https://${PROJECT_ID}.web.app"
