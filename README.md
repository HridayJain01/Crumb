# Crumb — your easy health journal

Snap, say or type what you ate. Crumb turns it into an itemised meal with **honest
estimates** (ranges and a confidence label, never fake precision), adds your steps and
workouts, and suggests **one or two useful next steps**: a protein-rich snack, a walking
loop near you, a short home workout. No guilt, no food-search drudgery.

Built for the Google AI / Cloud Builder Hackathon as an installable PWA on Google's
**free tiers**: Firebase, Cloud Run, Firestore, Gemini on Vertex AI (trial credits) and
Google Maps.

**Design rule:** the AI _interprets_ (what is on the plate, how much); deterministic,
tested code _calculates_ everything (nutrition, ranges, targets, energy, insights). The app
keeps working when the AI doesn't — offline or out of quota it switches to an on-device
parser ("basic mode").

## Features

|                        |                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Log in seconds**     | One sentence ("2 rotis, dal and a glass of milk"), a photo or your voice → review sheet → one tap. Several meals in one sentence are split automatically. |
| **One-tap repeats**    | Foods you log often and "Your usual breakfast" (offered after the same meal 3 times in 2 weeks) log instantly, with undo.                                 |
| **Honest numbers**     | Per-item ranges and High/Medium/Low confidence, editable with steppers; totals are plain sums. See [docs/estimation.md](docs/estimation.md).              |
| **Activity & energy**  | Steps and workouts (manual first; Google Health sync optional), net "extra" calories, and an approximate energy picture for the day.                      |
| **Next steps**         | Goal- and diet-aware nudges (veg, vegan, Jain, eggetarian, allergies), worded by Gemini, chosen by rules.                                                 |
| **Move more**          | Walking loops from where you are (Routes API, shown in Google Maps) sized for minutes or calories, plus 10–30 min home workouts.                          |
| **Insights**           | Weekly averages from complete days, charts that each answer one question, streaks and gentle patterns with data-sufficiency labels.                       |
| **Private by default** | Photos are never stored, location is never stored, guest mode, export and delete-everything. See [docs/privacy.md](docs/privacy.md).                      |

## Architecture (all free tier)

```
PWA (React 19 + Vite + Tailwind, installable, offline)
 ├─ Firebase Auth (Google or guest)            free
 ├─ Firestore + offline cache                  free tier (asia-south1)
 ├─ @crumb/core in the browser: all the maths  works offline
 └─ /api/* ─► Firebase Hosting (CDN) ─► Cloud Run "crumb-api" (Hono, scales to zero)
                                        ├─ Gemini on Vertex AI (service account, no key)
                                        ├─ Routes API (10k free calls/month)
                                        └─ Google Health API (optional, read-only)
```

Why each service and its free allowance: [docs/PLAN.md](docs/PLAN.md). Expected
infrastructure cost is **$0**; Gemini runs from the $300 trial credits at a fraction of a
cent per meal, behind per-user and global daily caps.

```
apps/web        PWA (screens in src/features/*, Firestore hooks in src/data)
apps/api        Cloud Run service: AI interpretation, insights, walk loops, Google Health, account deletion
packages/core   pure TypeScript shared by both: schemas, food table, nutrition, targets, energy, rules, offline parser
tests/rules     Firestore security rules tests      tests/e2e   Playwright journeys + axe accessibility
scripts         setup-gcp.sh, deploy-*.sh, seed-demo.ts, ai-eval.ts, foods-lookup.ts
```

## Run it locally (no cloud account needed)

Requirements: Node 22+, pnpm 10 (`corepack enable`), Java 21+ (for the Firebase emulators).

```bash
pnpm install
pnpm dev          # Firebase emulators + API (mock AI) + web on http://localhost:5173
```

Everything runs against the Firebase Emulator Suite with a rule-based stand-in for Gemini,
so it costs nothing and needs no keys. Open the app, tap **Try it first**, fill in the
one-screen profile and log a meal.

Want three weeks of history to explore insights? `pnpm seed:demo`, then **Sample account
(local emulators only)** on the welcome screen. The history is generated and labelled
"Sample history".

### Use the real Gemini model locally

Create `apps/api/.env` (see `apps/api/.env.example`):

```bash
MOCK_EXTERNALS=false
AI_PROVIDER=gemini-api        # free AI Studio key — use synthetic data only
GEMINI_API_KEY=...
# or: AI_PROVIDER=vertex + VERTEX_PROJECT=<project> with `gcloud auth application-default login`
```

Model IDs are configuration (`AI_MODEL_TEXT`, `AI_MODEL_VISION`, `AI_FALLBACK_MODELS`);
check the current ones in Vertex AI Model Garden or AI Studio.

## Test

```bash
pnpm typecheck && pnpm lint && pnpm test   # core engines, AI output validation, API, web
pnpm test:rules                            # Firestore security rules (emulator)
pnpm test:e2e                              # Playwright: PRD demo journey, offline, photo, delete, axe audit
pnpm ai:eval                               # real model vs 42 labelled meals (recall, precision, grams)
pnpm ai:eval --mock                        # same harness, offline parser, free
```

CI (`.github/workflows/ci.yml`) runs all of these except the paid model eval.

## Deploy on the free tiers

1. **Create a Google Cloud project with billing linked** (needed for Cloud Run, Routes API
   and Vertex AI even within free tiers; new accounts get $300 of credits). Install `gcloud`.
2. **One-time setup** (APIs, Firestore in `asia-south1`, least-privilege service account,
   secrets, image cleanup policy; optional Maps keys and budget alerts):
   ```bash
   PROJECT_ID=my-crumb WITH_MAPS=1 BILLING_ACCOUNT=XXXXXX-XXXXXX-XXXXXX pnpm setup:gcp
   ```
3. **Firebase console:** enable **Google** and **Anonymous** sign-in; add a **Web app** and
   copy its config into `apps/web/.env.production.local` (template:
   `apps/web/.env.production.example`), plus the Maps Embed key printed by the setup.
4. **Deploy:**
   ```bash
   PROJECT_ID=my-crumb pnpm deploy:api    # Cloud Run from source (Cloud Build + Dockerfile)
   PROJECT_ID=my-crumb pnpm deploy:web    # Hosting + Firestore rules and indexes
   ```
   Hosting rewrites `/api/**` to the Cloud Run service, so the app and API share one origin.
5. **Demo day:** `MIN_INSTANCES=1 pnpm deploy:api` avoids cold starts (paid from credits);
   set it back to 0 afterwards. To show history, run
   `pnpm seed:demo --project my-crumb --email you@gmail.com --yes` after signing in once
   (uses `gcloud auth application-default login`; the history is labelled as sample data).

**Optional — Google Health sync** (needs a Fitbit or Pixel Watch): create an OAuth client
(Web application) with redirect URI `https://<project>.web.app/api/integrations/google-health/callback`,
add the read-only activity scope and your test users to the consent screen (Testing mode),
store the secret with
`printf %s "$SECRET" | gcloud secrets create crumb-google-health-client-secret --data-file=-`,
and deploy with `GOOGLE_HEALTH_CLIENT_ID=... pnpm deploy:api`.

## Notes and limits

- Estimates are approximate and **not medical advice**. Targets never come from the AI.
- Fast first load: ~135 KB of gzipped JavaScript for the first screen; Lighthouse (mobile)
  Performance 97, Accessibility 100, Best Practices 100, SEO 100 on a production build.
- The bundled food table (~190 foods, Indian home cooking first) is curated; add foods with
  `pnpm foods:lookup "<name>"` (USDA FoodData Central, public domain).
- Health Connect and Apple Health have no web APIs, so a PWA can't read them; manual steps
  are the default and Google Health is the cloud option.
- Plan, decisions and verified platform facts: [docs/PLAN.md](docs/PLAN.md).

Food data: USDA FoodData Central (CC0) and typical home-style values for Indian dishes.
