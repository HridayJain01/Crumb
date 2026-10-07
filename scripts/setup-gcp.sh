#!/usr/bin/env bash
# One-time Google Cloud + Firebase setup for Crumb. Safe to re-run: every step checks first.
#
#   PROJECT_ID=my-crumb ./scripts/setup-gcp.sh
#
# Optional:
#   REGION=asia-south1            Cloud Run + Firestore region (Firestore's location is permanent)
#   BILLING_ACCOUNT=XXXXXX-...    adds $1 and $5 budget alerts on that billing account
#   WITH_MAPS=1                   creates restricted Maps keys (Routes API server key, Embed browser key)
#
# Prerequisites: gcloud (logged in as a project owner) and the Firebase CLI (`pnpm exec firebase`).
# Everything here stays inside free tiers except Gemini on Vertex AI, which is paid from the
# $300 trial credits at a fraction of a cent per call.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID, e.g. PROJECT_ID=my-crumb $0}"
REGION="${REGION:-asia-south1}"
SA_NAME="crumb-api"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
HOSTING_ORIGINS="https://${PROJECT_ID}.web.app/*,https://${PROJECT_ID}.firebaseapp.com/*"

step() { printf '\n\033[1m› %s\033[0m\n' "$1"; }

gcloud config set project "$PROJECT_ID" >/dev/null

step "Enabling APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  firebase.googleapis.com \
  identitytoolkit.googleapis.com \
  apikeys.googleapis.com

step "Firebase on this project"
if ! pnpm exec firebase projects:list 2>/dev/null | grep -q "$PROJECT_ID"; then
  pnpm exec firebase projects:addfirebase "$PROJECT_ID"
else
  echo "  already a Firebase project"
fi

step "Firestore (Native mode) in $REGION"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  echo "  database exists"
else
  gcloud firestore databases create --location="$REGION" --type=firestore-native
fi

step "API service account with least-privilege roles"
if ! gcloud iam service-accounts describe "$SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" --display-name="Crumb API (Cloud Run)"
fi
# Vertex AI (no API key in production), Firestore, Secret Manager, and deleting Auth users
# when someone asks to delete their account.
for role in roles/aiplatform.user roles/datastore.user roles/secretmanager.secretAccessor \
  roles/firebaseauth.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${SA}" --role="$role" --condition=None >/dev/null
  echo "  $role"
done

step "Secrets (random keys for token encryption and OAuth state signing)"
create_secret() {
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    echo "  $1 exists"
  else
    printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic >/dev/null
    echo "  $1 created"
  fi
}
create_secret crumb-token-enc-key "$(openssl rand -base64 32)"
create_secret crumb-state-hmac-key "$(openssl rand -base64 32)"

step "Container images: keep only recent builds (Artifact Registry free tier is 0.5 GB)"
if ! gcloud artifacts repositories describe cloud-run-source-deploy --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create cloud-run-source-deploy \
    --repository-format=docker --location="$REGION" \
    --description="Cloud Run source deployments"
fi
policy="$(mktemp)"
cat >"$policy" <<'JSON'
[
  { "name": "keep-latest-2", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 2 } },
  { "name": "delete-older", "action": { "type": "Delete" }, "condition": { "olderThan": "3d" } }
]
JSON
gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \
  --location="$REGION" --policy="$policy" --no-dry-run >/dev/null
rm -f "$policy"
echo "  cleanup policy set"

if [[ "${WITH_MAPS:-}" == "1" ]]; then
  step "Maps keys (Routes API: 10,000 free calls/month; Embed API: free, unlimited)"
  gcloud services enable routes.googleapis.com maps-embed-backend.googleapis.com
  # Re-runs reuse existing keys instead of minting new ones.
  key_named() {
    gcloud services api-keys list --filter="displayName=$1" --format='value(name)' | head -n1
  }
  server_key="$(key_named crumb-routes-server)"
  if [[ -z "$server_key" ]]; then
    server_key="$(gcloud services api-keys create --display-name=crumb-routes-server \
      --api-target=service=routes.googleapis.com --format='value(response.name)')"
  fi
  create_secret crumb-maps-server-key \
    "$(gcloud services api-keys get-key-string "$server_key" --format='value(keyString)')"
  embed_key="$(key_named crumb-embed-browser)"
  if [[ -z "$embed_key" ]]; then
    embed_key="$(gcloud services api-keys create --display-name=crumb-embed-browser \
      --api-target=service=maps-embed-backend.googleapis.com \
      --allowed-referrers="${HOSTING_ORIGINS},http://localhost:5173/*" \
      --format='value(response.name)')"
  fi
  echo "  Browser Embed key (public by design, referrer-restricted). Put it in"
  echo "  apps/web/.env.production.local as VITE_MAPS_EMBED_KEY:"
  echo "  $(gcloud services api-keys get-key-string "$embed_key" --format='value(keyString)')"
fi

if [[ -n "${BILLING_ACCOUNT:-}" ]]; then
  step "Budget alerts at \$1 and \$5"
  gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" \
    --display-name="Crumb ($PROJECT_ID)" --budget-amount=5USD \
    --filter-projects="projects/${PROJECT_ID}" \
    --threshold-rule=percent=0.2 --threshold-rule=percent=1.0 >/dev/null
  echo "  budget created"
fi

cat <<EOF

Done. Finish in the Firebase console (https://console.firebase.google.com/project/${PROJECT_ID}):
  1. Authentication → Sign-in method: enable Google and Anonymous.
  2. Project settings → Your apps → add a Web app; copy its config into
     apps/web/.env.production.local (see apps/web/.env.production.example).
Then deploy:
  PROJECT_ID=${PROJECT_ID} pnpm deploy:api
  PROJECT_ID=${PROJECT_ID} pnpm deploy:web
EOF
