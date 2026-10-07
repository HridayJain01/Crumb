#!/usr/bin/env bash
# Builds and deploys the API to Cloud Run from source (Cloud Build runs the root Dockerfile).
#
#   PROJECT_ID=my-crumb pnpm deploy:api
#
# Optional environment:
#   REGION=asia-south1          must match firebase.json's Hosting rewrite
#   MIN_INSTANCES=0             set 1 only on demo day to avoid cold starts (paid from credits)
#   PUBLIC_APP_URL=...          defaults to https://$PROJECT_ID.web.app
#   AI_MODEL_TEXT / AI_MODEL_VISION / AI_FALLBACK_MODELS / VERTEX_LOCATION
#   AI_USER_DAILY_LIMIT / AI_GLOBAL_DAILY_LIMIT
#   GOOGLE_HEALTH_CLIENT_ID     enables the Google Health connection (secret: crumb-google-health-client-secret)
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
[[ -n "$PROJECT_ID" ]] || { echo "Set PROJECT_ID" >&2; exit 1; }
REGION="${REGION:-asia-south1}"
SA="crumb-api@${PROJECT_ID}.iam.gserviceaccount.com"
APP_URL="${PUBLIC_APP_URL:-https://${PROJECT_ID}.web.app}"

# "|" separates variables because AI_FALLBACK_MODELS may contain commas.
env_vars="NODE_ENV=production|FIREBASE_PROJECT_ID=${PROJECT_ID}|PUBLIC_APP_URL=${APP_URL}"
env_vars+="|AI_PROVIDER=vertex|VERTEX_PROJECT=${PROJECT_ID}|VERTEX_LOCATION=${VERTEX_LOCATION:-global}"
for name in AI_MODEL_TEXT AI_MODEL_VISION AI_FALLBACK_MODELS AI_USER_DAILY_LIMIT \
  AI_GLOBAL_DAILY_LIMIT GOOGLE_HEALTH_CLIENT_ID; do
  if [[ -n "${!name:-}" ]]; then env_vars+="|${name}=${!name}"; fi
done

# Only wire secrets that exist, so optional integrations stay optional.
secrets=""
add_secret() {
  if gcloud secrets describe "$2" --project "$PROJECT_ID" >/dev/null 2>&1; then
    secrets+="${secrets:+,}$1=$2:latest"
  fi
}
add_secret TOKEN_ENC_KEY crumb-token-enc-key
add_secret STATE_HMAC_KEY crumb-state-hmac-key
add_secret MAPS_SERVER_KEY crumb-maps-server-key
add_secret GOOGLE_HEALTH_CLIENT_SECRET crumb-google-health-client-secret

args=(
  run deploy crumb-api
  --source .
  --project "$PROJECT_ID"
  --region "$REGION"
  --service-account "$SA"
  # Firebase Hosting must reach the service; every route checks a Firebase ID token itself.
  --allow-unauthenticated
  --min-instances "${MIN_INSTANCES:-0}"
  --max-instances 3
  --cpu 1
  --memory 512Mi
  --concurrency 40
  --timeout 60
  --cpu-boost
  --set-env-vars "^|^${env_vars}"
)
if [[ -n "$secrets" ]]; then args+=(--set-secrets "$secrets"); fi

echo "Deploying crumb-api to ${REGION} in ${PROJECT_ID}…"
gcloud "${args[@]}"
echo "Health check: $(gcloud run services describe crumb-api --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')/api/health"
