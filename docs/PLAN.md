# Crumb: Verified, Free-Tier Build Plan

## Context

`HridayJain01/Crumb` is an empty repository with no commits, so this is a greenfield build on branch `claude/kind-lovelace-lp0mba`. The PRD describes a low-friction AI health journal. Users log food by photo, text or voice and get approximate nutrition with a confidence level. That is combined with their activity, and the app suggests one or two useful next actions. The request was to **check the PRD's platform assumptions** and plan the build on **free software and free tiers**, keeping the app **very quick and easy to use**.

**Decisions you confirmed:**
- **Billing:** a billing account is linked. Usage stays inside free tiers, Gemini is paid from the $300 / 90-day trial credits, and a budget alert fires at $5.
- **Database:** Firestore instead of PostgreSQL.
- **Activity data:** you have no wearable, so manual activity comes first and the Google Health connector is built last.
- **Timeline:** 2+ weeks, so the full scope is in, including food memory, weekly insights and walking routes.

After approval, step 1 of implementation is to commit this plan as `docs/PLAN.md`.

---

## 1. PRD assumptions checked (as of Oct 2026)

| PRD assumption | Finding | What the plan does |
|---|---|---|
| The legacy Fitbit Web API shuts down Oct 30, 2026 | ✅ True. Developer support ended Sep 30. The API turns off Oct 30, 2026. OAuth tokens do not carry over to the new API. | Never use the Fitbit Web API. |
| Use the Google Health API | ✅ It is live at `health.googleapis.com/v4`. Endpoint: `users/me/dataTypes/{steps,distance,active-energy-burned,exercise}/dataPoints`, supporting list and dailyRollup. Scope: `googlehealth.activity_and_fitness.readonly`. ⚠️ **Every scope is restricted.** An unverified app is limited to 100 test users added by hand. Going public needs OAuth verification plus a yearly CASA security assessment. Data only comes from Fitbit, Pixel Watch and their connected sources. | Fine for a hackathon: add the judges as test users. Built last, since you have no wearable. |
| Health Connect "where applicable" | ❌ Not reachable from a PWA. Health Connect is an on-device Android SDK with no web API. Google Fit's APIs take no new sign-ups and shut down at the end of 2026. | Manual entry is the main activity source. Health Connect needs a future native wrapper. |
| Future Apple Health | ❌ HealthKit has no web access. | Optional free workaround: an iOS Shortcut posts daily steps to a personal webhook. |
| Gemini through Vertex AI | ✅ Vertex AI is pay-as-you-go, covered by trial credits, and does not train on your prompts. The AI Studio free tier still exists, but only for Flash and Flash-Lite (Pro left the free tier on Apr 1, 2026). Daily quotas are small and differ by model: reports put the newest Flash at about 20 requests a day and 3.5 Flash-Lite at about 500. Google no longer publishes these numbers. Free-tier prompts may be used to improve Google products. | Vertex AI in the deployed app. A free AI Studio key only for local development, with synthetic data. Model IDs come from environment variables, with a fallback chain. The design keeps AI calls to a minimum. |
| Routes API for walking routes | ✅ "Compute Routes Essentials" is free up to 10,000 calls a month (per-SKU free caps since Mar 2025). Needs a billing account. Walking warnings must be shown to the user. | Called server-side only, at most 4 calls per suggestion. |
| Maps URLs for navigation, plus a route preview | ✅ Maps URLs are free and need no key. The Maps Embed API is free with no usage limit. | "Open in Google Maps" link plus an Embed iframe preview. |
| Cloud Run backend | ✅ Always free up to 2M requests, 180K vCPU-seconds and 360K GiB-seconds a month. Needs the Blaze (billing) plan. `asia-south1` is a Tier-1 region. | One service that scales to zero. |
| PostgreSQL / Cloud SQL | ⚠️ Cloud SQL has no free tier. | Firestore instead. Free tier per day: 1 GiB stored, 50K reads, 20K writes, 20K deletes. |
| Cloud Storage for photos | Needs Blaze (5 GB free, US regions only). The PRD also says not to keep high-resolution images. | No image storage. The photo goes to Gemini and is then discarded. Only a ~10 KB thumbnail is kept, inside the entry document. |
| Google sign-in | ✅ Firebase Auth is free (the Spark plan caps at 3,000 daily active users). | Google sign-in plus a guest mode. |
| Nutrition data (the PRD leaves the source open) | ✅ USDA FoodData Central is public domain (CC0), with a 1,000 requests/hour API and full downloads. ✅ The Indian Nutrient Databank (INDB) is open access: 1,095 foods and 1,014 Indian recipes, based on IFCT 2017. Its redistribution license needs confirming. | Bundle a curated food database with attribution. |
| PRD example: "~250 kcal ≈ 3.5 km walk" | ⚠️ That is running-level energy use (about 1 kcal per kg per km). Walking at 5 km/h burns about 0.5 kcal/kg/km above resting (about 0.7 including resting). So 250 extra kcal is roughly 6–7 km for a 72 kg adult. | Show net "extra kcal" everywhere, so BMR is never double-counted. Offer jog and home-workout options alongside walking. |

## 2. The free stack

| Need | Choice | Free allowance | Why |
|---|---|---|---|
| UI | React 19, Vite, TypeScript, Tailwind v4, vite-plugin-pwa | Open source (MIT) | The PRD's stack. Small bundles, fast builds, installable PWA through Workbox. |
| Static hosting | Firebase Hosting | 10 GB storage, 360 MB/day transfer | Free global CDN. Rewriting `/api/**` to Cloud Run keeps the API on the same origin, so no CORS. |
| Backend | **1** Cloud Run service (Node 22 + Hono) | See §1 | Keeps secrets server-side. Vertex AI authenticates through the service account. Scales to zero. No microservices. |
| Database | Cloud Firestore | See §1 | Offline cache and offline write queue built in. Real-time updates. Per-user security rules. Nothing to run or maintain. |
| Auth | Firebase Auth | 3K daily active users | One-tap Google sign-in. A guest mode avoids a sign-up wall. |
| AI | Gemini on Vertex AI through the `@google/genai` SDK | Trial credits (fractions of a cent per call); AI Studio key for development | Understands images, returns schema-shaped JSON. One SDK covers both Vertex AI and AI Studio. |
| Secrets | Secret Manager | 6 active versions, 10K accesses/month | No keys in code or in the frontend. |
| Maps | Maps URLs + Embed API + Routes API | See §1 | Navigation and preview cost nothing. Routes API is used only to measure loop distance accurately. |
| Health | Google Health API (built last) | Free; up to 100 test users | The only current Google cloud API for health data. |
| Food data | Bundled `foods.json` built from USDA FDC (CC0) and INDB | Free | Instant, works offline, deterministic. |
| Dev and CI | Firebase Emulator Suite, Vitest, Playwright (Chromium already installed), GitHub Actions, pnpm | Free | Full local stack with no cloud usage. |

**Libraries (all open source):** react-router, @tanstack/react-query, zod v4 (its `z.toJSONSchema` also produces the schema Gemini must follow), hono with @hono/zod-validator and @hono/node-server, firebase and firebase-admin, @google/genai, vaul (bottom sheets), lucide-react (icons), fuse.js (fuzzy food matching), date-fns, @fontsource-variable/nunito (self-hosted font). Rings and charts are hand-drawn SVG, so no chart library.

**Deliberately not used:**
- Cloud SQL: no free tier.
- Photo storage: privacy, and not needed.
- Fitbit Web API and Google Fit: both shutting down.
- Health Connect and HealthKit: no web access.
- Paid nutrition APIs.
- A separate chatbot.
- Extra services beyond the one Cloud Run service.

**Expected cost:** $0 for infrastructure. Gemini costs about $1 or less per day at hackathon scale, paid from credits.

## 3. Architecture

```
PWA (React/Vite, installable) ── Firebase Auth (Google / guest)
 │  Firestore SDK: persistent local cache + offline write queue + realtime ──► Firestore (all user data)
 │  @crumb/core in the browser: nutrition math, targets, energy, rules → instant edits, works offline
 └─ fetch /api/*  (Authorization: Bearer <Firebase ID token>)
        ▼  Firebase Hosting CDN (rewrite /api/** → Cloud Run, same origin)
  Cloud Run "crumb-api" (Hono, Node 22, min 0 / max 3 instances, asia-south1)
   ├─ verifyIdToken + per-user daily caps (Firestore counters)
   ├─ meal/activity interpretation, insight wording ──► Vertex AI Gemini (service-account auth, no key)
   ├─ walk loops ──► Routes API (server key) → Maps URL + Embed params
   ├─ Google Health OAuth + sync ──► health.googleapis.com → writes activity docs
   └─ account deletion (Admin SDK)
  Secret Manager: OAuth client secret, token-encryption key, Maps server key, state-HMAC key
```

**Who does what (PRD §35):**
- **The AI** interprets input. It identifies foods, breaks meals into items, guesses portions, flags ambiguity and words insights.
- **Code** does all the arithmetic. `@crumb/core` is a shared, pure-TypeScript package that runs on both client and server. It handles units-to-grams, nutrition, ranges, confidence, totals, targets, energy, rules and statistics.
- **The client** writes user data straight to Firestore, with rules limiting each user to their own data. That makes saves instant and lets them work offline.
- **The server** handles only what needs secrets or AI. It stays nearly stateless: the client sends it computed statistics and memory hints rather than raw history.

## 4. Repo layout (pnpm workspaces, no Turbo or Nx)

```
apps/web/        React PWA: src/{app,screens,components/{ui,feature},features,lib,styles}
apps/api/        Hono service: src/{routes,ai,providers/{health,maps},middleware,lib}
packages/core/   pure TS, no I/O: schemas/ (Zod), nutrition/ (foods.json, units, match, compute,
                 confidence), targets/, energy/ (met.ts), recommend/, insights/, parse/ (offline parser)
scripts/         build-food-db.ts, ai-eval.ts, seed-demo.ts
docs/            PLAN.md, estimation.md (every formula + source), privacy.md
firebase.json, firestore.rules, firestore.indexes.json, Dockerfile (API), .gcloudignore,
.github/workflows/ci.yml, pnpm-workspace.yaml, tsconfig.base.json
```

## 5. Data model (Firestore)

```
users/{uid}                 profile {age, sex, heightCm, weightKg, activityLevel, goal, targetWeightKg?,
                            diet, allergies[], units, timezone}, targets {kcal, proteinG, carbsG, fatG, bmr,
                            tdee, method:'v1'}, settings, createdAt
users/{uid}/entries/{id}    FoodEntry: date 'YYYY-MM-DD' (local), loggedAt, mealType, inputType
                            (photo|text|voice|manual|quick), rawInput?, thumb? (≤40 KB data URL),
                            status (confirmed|pending_ai), items[FoodItem], totals, aiModel?
  FoodItem                  name, foodId|null, quantity, unit, grams, gramsSource (user|memory|db_unit|
                            ai_estimate|generic), nutrition {kcal,proteinG,carbsG,fatG}, range {low,high},
                            confidence (high|medium|low), source (curated_db|memory|ai_estimate|user),
                            assumptions[], aiOriginal? {quantity, grams, name}
users/{uid}/activities/{id} date, startedAt, type, label, durationMin?, distanceKm?, steps?, kcal (net),
                            range, met?, source (manual|google_health|webhook), confidence, externalId?
users/{uid}/days/{date}     DailySummary cache: intake totals + range, steps, activeKcal, expenditure
                            {kcal,low,high}, balance, mealsLogged, engineVersion
users/{uid}/memory/{key}    PersonalFoodMemory: label, foodId, count, lastUsed, typicalGrams (EMA),
                            typicalUnit, mealTypeCounts, corrections
users/{uid}/meals/{id}      meal templates ("My usual breakfast"): label, items, count, typicalHour, source
users/{uid}/corrections/{id} entryId, item, field, aiValue, userValue, createdAt
users/{uid}/insights/{key}  cached AI wording: stateHash, text, action, model
users/{uid}/integrations/{p} {connected, lastSyncAt}: client may read, only the server writes
private/{uid}/tokens/{p}    AES-256-GCM-encrypted refresh token: server only
rateLimits/{uid_date}       {ai, routes} counters: server only
```

- **Day summaries.** The client recomputes `days/{date}` from that day's entries and activities, using `core.summarizeDay`, in the same batch as the change. It recomputes again whenever a listener shows the stored summary is out of date or its `engineVersion` is old. This avoids drift and keeps weekly views cheap (7–30 reads).
- **Security rules.** Every subcollection gets its own match block, with no recursive wildcard. Access is owner-only. `integrations` is read-only for the client. `private/**` and `rateLimits/**` deny all client access. Entries are checked for shape and size: at most 30 items, length limits on strings, thumbnail at most 40 KB.
- **Indexes.** Composite indexes on `entries(date, loggedAt)` and `activities(date, startedAt)`.

## 6. API contracts

All endpoints take a Firebase ID token and use Zod schemas from `@crumb/core` on both sides. Hono's typed client gives the frontend a typed API.

| Endpoint | Request | Response / notes |
|---|---|---|
| `POST /api/meals/interpret` | `{text?, imageBase64?, localTime, timezone, mealTypeHint?, memoryHints[≤15]}`. Text up to 1,000 characters, image up to 1.5 MB. | `{draft:{meals:[{mealType, items: FoodItemDraft[]}]}, clarifyingQuestion?, model}`. Errors: 422 `not_food` / `poor_image`, 429 `quota`, 503 `ai_unavailable`, which triggers the client fallback. |
| `POST /api/activity/interpret` | `{text, weightKg}` | `{activities: ActivityDraft[]}`. The AI picks type and duration; the MET value and kcal come from code. |
| `POST /api/insights` | `{kind: daily\|weekly\|tomorrow, context}`, where `context` is statistics only, in the PRD §34 format | `{insight, action, source: ai\|template}` |
| `POST /api/walk/routes` | `{origin:{lat,lng}, targetKcal? \| targetMin?, weightKg, pace}` | `{options:[{distanceKm, durationMin, kcal:{low,high}, polyline, waypoints, mapsUrl, embed, warnings[]}], disclaimer}`. Location is never stored or logged. |
| `GET /api/integrations/google-health/start` | — | `{authUrl}`. The `state` value is an HMAC-signed nonce tied to the user ID, valid for 10 minutes. |
| `GET /api/integrations/google-health/callback` | `code`, `state` | Encrypts and stores the refresh token, then redirects to `/profile`. |
| `POST /api/integrations/google-health/sync` | `{from, to}` | Upserts `activities` keyed by `externalId` and returns the changed dates. |
| `DELETE /api/integrations/google-health` · `DELETE /api/account` | — | Revokes and deletes tokens. Account deletion recursively removes all user data and the Auth user. |
| `POST /api/ingest/steps` (optional) | Personal token (stored hashed), `{date, steps, activeKcal?}` | iOS Shortcut webhook for Apple Health steps. |

## 7. AI pipeline (Gemini)

- **Model routing**, set through environment variables:
  - Text and voice parsing, insights: `AI_MODEL_TEXT`, Flash-Lite class.
  - Photos: `AI_MODEL_VISION`, Flash class.
  - On a 429, a 5xx or a 20-second timeout, the next model in `AI_FALLBACK_MODELS` is tried, then the API returns 503.
  - Starting IDs, to be confirmed in Vertex Model Garden on day 0: `gemini-3.6-flash` (vision), `gemini-3.5-flash-lite` (text), `gemini-3.5-flash` (fallback).
  - Use the `global` location if the region doesn't list a model.
- **Generation config:** `responseMimeType: application/json`, `responseJsonSchema` generated from Zod, temperature 0.2, lowest thinking level, at most 2K output tokens.
- **Response schema.** There are deliberately **no totals anywhere** in it. Fields:
  - Top level: `status (ok|not_food|unclear_image)`, `imageIssue?`, `meals[]`, `clarifyingQuestion?`.
  - Each meal: `mealType|null` (inferred from phrases like "this morning" or "for lunch") and `items[]`.
  - Each item:
    - `name` and `canonicalName`.
    - `quantity`, `unit` (piece, bowl, katori, glass, cup, plate, slice, tbsp, tsp, scoop, g, ml, serving), `quantityStated: bool`, `estimatedGrams`.
    - `preparation`, `oilLevel`, `identification (high|med|low)`, up to 3 `alternatives` (for example sabzi → aloo, bhindi, mixed veg).
    - `per100g?`, used only when the food database has no match. `memoryRef?` lets "my usual shake" resolve to a saved meal.
- **Prompt context** (about 1K tokens):
  - Indian household measures: katori ≈ 150 ml, roti ≈ 40 g, glass ≈ 250 ml.
  - Home-style cooking by default.
  - The user's diet, local time and top-15 memory foods with their usual portions.
  - Rule: split composite meals into separate items.
- **Validation before anything is used:**
  - Zod `safeParse`, then numeric clamps: grams 1–2,000, quantity 0.25–50, per-100 g kcal 0–900.
  - An Atwater check: 4P + 4C + 9F must be within ±25% of kcal, or the per-100 g estimate is dropped.
  - At most 20 items.
  - One retry, then a 503.
- **Images.** The client compresses to a 1024 px JPEG (about 100–200 KB), which is sent inline. The server never stores or logs it.
- **AI call budget.** One call per typed, spoken or photographed meal. Insight wording only when the day's state hash changes, at most 6 times per user per day. Quick-add, edits, manual entry, totals, targets and energy make **zero** AI calls.
- **Caps.** The server enforces 60 AI calls per user per day plus a global daily cap, to protect credits.

## 8. Deterministic engines (`@crumb/core`, documented in `docs/estimation.md`)

**Targets:**
- BMR (Mifflin–St Jeor) = 10·kg + 6.25·cm − 5·age, plus 5 (male), −161 (female) or −78 (other).
- TDEE = BMR × activity factor: 1.2 (sedentary), 1.375 (light), 1.55 (moderate), 1.725 (very active).
- Calorie target by goal:
  - Lose fat: TDEE − min(20% of TDEE, 750), never below the larger of BMR and 1,200 (female) / 1,500 (male) / 1,350 (other).
  - Gain muscle: TDEE + min(10%, 350).
  - All other goals: TDEE.
- Protein in g/kg of reference weight: 1.6 (lose fat), 1.8 (gain muscle), 1.4 (fitness), 1.2 (maintain), 1.0 (general health). The reference weight is the weight at BMI 25 when BMI is 30 or more.
- Fat = 27% of kcal ÷ 9. Carbs = the remaining kcal ÷ 4.
- Displayed as approximate values: kcal rounded to the nearest 50, macros to the nearest 5 g.
- Guards: users must be 18 or older. With BMI under 18.5, no calorie deficit is ever offered.

**Nutrition and confidence:**
- **Grams, first match wins:** grams the user typed > memory's typical portion (3+ uses) > the food's own unit weight × quantity > the AI's estimate > a generic unit table.
- **Source, first match wins:** memory or curated database (Fuse.js over names and aliases) > the AI's validated per-100 g values > "tell me what this is".
- **Nutrition** = per-100 g values × grams ÷ 100. The oil level shifts oil-sensitive dishes from −10% to +20%.
- **Uncertainty σ** = √(σ_identification² + σ_quantity² + σ_source² + σ_prep²):
  - σ_identification: high 0.05, medium 0.15, low 0.30.
  - σ_quantity: user grams 0.05, memory 0.08, stated count with a food-specific unit 0.10, stated generic unit 0.15, AI text estimate 0.20, AI photo estimate 0.25.
  - σ_source: database or memory 0.05, AI per-100 g 0.30.
  - σ_prep: unknown oil 0.10.
- **Range** = value × (1 ± σ). σ ≤ 0.15 is 🟢 High, ≤ 0.33 is 🟡 Medium, otherwise 🔴 Low.
  - Check: "2 rotis" → High; text "paneer sabzi" → Medium; a clear photo → Medium; an unknown food → Low. This matches PRD §13.
- **Day totals** are the sum of item values. The range combines item errors as root-sum-square.

**Energy** (all activity values are net extra kcal, so BMR is never counted twice):
- Expenditure = BMR × 1.2 (which assumes about 3,000 baseline steps) + step energy + exercise energy.
  - If a device reports active kcal: BMR × 1.1 + device active kcal + manual workouts the device didn't record.
- Step energy = max(0, steps − 3,000) × strideKm × 0.5 kcal/kg/km × kg, where strideKm = 0.415 × height in metres ÷ 1000 (0.413 for women). Example: 8,000 steps at 72 kg and 1.75 m ≈ 130 kcal.
- Exercise energy = (MET − 1) × kg × hours, with METs from the 2024 Adult Compendium: walk 5 km/h 3.5, brisk walk 4.3, jog 8 km/h 8.3, cycling 6.8, strength 3.5 (moderate) / 6.0 (vigorous), yoga 2.5, HIIT 8.0.
- Range: root-sum-square of BMR ±10%, steps ±25%, exercise ±30%.
- Balance = intake − expenditure. If the gap is within the uncertainty, it shows as "roughly balanced". It is always labelled *Approximate*.

## 9. Memory, insights, recommendations

- **Food memory**, updated client-side in the same batch when a meal is confirmed:
  - Each food's memory doc gets its count, its typical grams (exponential average, α 0.3) and its meal-type histogram updated.
  - A correction doc is written wherever the final value differs from the AI's draft.
  - When the same set of foods is confirmed 3 times in 14 days, the app offers to save it as "Your usual breakfast" (renamable).
  - Saved meals appear as quick-add chips, ordered for the time of day.
- **Insights:**
  - Weekly averages: kcal, protein, steps, workouts.
  - Adherence: the share of logged days with kcal within ±10% of target and protein at 90% or more of target.
  - Lowest-protein meal, weekend vs weekday difference (reported only if it is 15% or more over 2+ weekends), median meal times, logging streak, personal bests.
  - Data labels: fewer than 3 days is "not enough data yet"; 14+ days is "early pattern"; 30+ days is "stronger trend" (PRD §33).
- **Recommendations.** Code rules pick 1–2 actions, scored:
  - A protein gap of 15 g or more later in the day → suggests foods filtered by diet: veg, vegan, Jain (no root vegetables or eggs), eggetarian, allergies.
  - Steps under 70% of the 7-day average after 5 pm → a walk card.
  - Muscle-gain goal with no strength session in 3 days → a workout card.
  - The rules never suggest restricting food to compensate.
  - Gemini only words the chosen action. Template text is the fallback, and an output filter blocks shaming words and medical claims.

## 10. Activity and walking routes

- **Manual first** (you have no wearable): activity chips (Walk, Run, Gym, Yoga, Cycling, Steps) with a duration stepper, and no AI needed. Free text such as "30-min upper-body workout" goes to `/activity/interpret`.
- **`HealthDataProvider` interface** on the server: `capabilities`, `getDaily(uid, from, to)` and `getWorkouts(...)`.
  - Implementations: `GoogleHealthProvider` (pull, OAuth) and the optional webhook (push). Manual entries are written by the client.
  - Merge rules: device steps and active kcal win over manual entries; workouts are deduplicated when their times overlap.
- **Walk planner.** The user enters target extra kcal or minutes.
  1. Distance = kcal ÷ ((MET − 1) ÷ speed × kg).
  2. Generate 2 loop options. Each has 3 waypoints on a circle through the user's position, with radius = distance ÷ (2π × 1.25 detour factor), in different directions.
  3. Call Routes API `computeRoutes` with `travelMode: WALK` and field mask `distanceMeters,duration,polyline,warnings`.
  4. Rescale the radius once if the result is more than 15% off target.
  5. Return a Maps URL (`/maps/dir/?api=1&origin=…&destination=…&waypoints=a|b|c&travelmode=walking`; at most 3 waypoints for mobile) and an Embed directions preview.
  - Always show the "Check the route and local conditions before walking" notice plus the API's own walking warnings.
  - If the Routes API is unavailable, show an estimated distance with the link, labelled "approximate".
  - Jog and home-workout alternatives are shown alongside (PRD §26).
- **Home workouts:** deterministic templates by goal and length (10, 20 or 30 minutes), with energy from METs.

## 11. Frontend and UX

**Speed rules (target: log a meal in under 15 seconds):**
1. One tap starts logging from anywhere: the centre Log tab, a PWA shortcut, or Android "share to Crumb" (`share_target`).
2. Type, speak (Web Speech API, `en-IN`, only where supported) or snap a photo. Then a review sheet, then one tap on **"Looks right ✓"**.
3. Usual meals and recent foods log in one tap, with undo and no AI call.
4. Defaults instead of questions: meal type from the clock or the wording, portions from memory, units chosen automatically.
5. No sign-up wall: a guest mode, then a one-screen onboarding of about 30 seconds (6 fields) that shows the targets live. Guests can later link a Google account.
6. Editing uses steppers and variant chips rather than keyboards. Saves update the screen immediately, with a "Saved · Undo" toast.
7. Nothing blocks: the AI works in the background behind a skeleton showing "Analyzing your meal…". Any failure drops straight to manual entry.

**Screens:**

| Screen | Contents |
|---|---|
| Welcome | Continue with Google / Try it first |
| Onboarding | The 6 required fields, optional diet, live targets |
| **Home** | NutritionCard (calorie ring, macro bars), ActivityCard, Insight and Recommendation cards, collapsible EnergyCard, today's timeline of MealCards that expand into FoodCards with ConfidenceBadge, ranges and assumptions |
| **Log** | Text box with mic and camera buttons, quick-add strip, food search, activity chips. Opens ConfirmationSheet. |
| **Insights** | Weekly stats, protein-vs-target and steps charts (each chart answers one question), habit notes with data labels, streaks and bests, a "Move more" section (walk planner, workouts) |
| **Profile** | Goals and body stats, "How we estimate", integrations, units, data export and deletion, disclaimer |

**Components:** the PRD §49 list is split into `components/ui` (primitives) and `components/feature`.

**Design tokens** (Tailwind v4 `@theme` in `styles/tokens.css`):
- **Colours:**
  - Background: warm cream `#FFF8F1`. Surfaces: `#FFFFFF` and `#FDEFE2`.
  - Primary: tomato `#F2643D`. Secondary: deep teal `#0F766E`.
  - Status: success `#2E9E5B`, warning `#D99A00`, danger crimson `#B42318` (kept distinct from the brand colour).
  - Text `#2A1E17`, muted `#7A6A5D`. Carbs blue `#4F7CEB`, fat plum `#C2569B`.
  - All text/background pairs must pass WCAG AA. Status is always shown with an icon and a label as well as colour.
- **Shape and spacing:** radius 8 / 12 / 16 (cards) / 24 (sheets) / full (pill buttons). One soft card shadow. 4 px spacing scale with 16 px page margins.
- **Type:** Nunito variable font. Display 32/800, H1 24/700, H2 18/700, body 16/400, caption 13/500, stats 28/800 with tabular numbers.
- **Motion:** 150–250 ms ease-out, respecting reduced-motion settings.
- **Personality:** food emoji on cards, a small SVG Crumb mascot for empty, loading and error states, and friendly copy. Banned words: "failed", "bad", "cheat".

**State management:**
- Firestore hooks (`useProfile`, `useDay(date)`, `useEntries(date)`) are the source of truth: instant from the cache, and they work offline.
- TanStack Query handles `/api` calls. An AuthContext and local component state cover the rest. No Redux or Zustand.

**PWA and performance:**
- vite-plugin-pwa with `generateSW` precaches the app shell, the font and the lazy-loaded `foods.json`. `/api` calls always go to the network. The manifest includes maskable icons and shortcuts.
- Camera: `<input type=file accept="image/*" capture="environment">`.
- Images are compressed with canvas: 1024 px for the AI, a 192 px thumbnail for the timeline.
- Budgets: initial JS at most 250 KB gzipped (**met: ~135 KB**, see §19), LCP under 2.5 s on 4G, Lighthouse 90+ for performance, PWA and accessibility. Screens are code-split, and charts and the walk planner load lazily.

## 12. Security, privacy, safety

- **Secrets:**
  - The only identifiers visible in the browser are the Firebase web config and a Maps Embed key. Both are public by design; the Embed key is restricted to the Embed API and our domains.
  - Everything else lives in Secret Manager. Vertex AI uses the service account (`roles/aiplatform.user`), so there is no AI key in production.
- **Server protection:**
  - Zod validation and size limits on every request.
  - Per-user caps (60 AI calls and 20 route requests per day), Cloud Run max of 3 instances, and App Check with reCAPTCHA in the hardening phase.
- **Data handling:**
  - Logs never contain meal text, images or coordinates. Location is used only within the request.
  - Photos are never stored. Refresh tokens are encrypted with AES-GCM and stored where only the server can read them.
- **User controls:** export to JSON and "Delete all my data", which also revokes Google Health access.
- **Google Health:** request only the read-only activity scope, and keep the app in Testing mode with listed test users. In Testing mode, refresh tokens expire after 7 days, which is acceptable for a demo.
- **Safety:**
  - Show the disclaimer on onboarding, in Profile and in the estimate details: "Nutrition, calorie, activity and exercise values are estimates and should not be treated as medical advice."
  - Calorie floors, a BMI guard and an 18+ minimum.
  - If a user logs under 800 kcal a day for 3+ days, show a supportive note pointing them to a professional, and never suggest eating less.
  - Never diagnose anything.

## 13. Error handling and reduced-functionality modes (PRD §51–52)

| Situation | Behaviour |
|---|---|
| Not food, or the AI isn't sure | "I'm not confident about this one — tell me what it is", with the text pre-filled plus food search |
| Poor photo | "Try taking the photo from above, in good light", with retake or describe options |
| Food not in the database | Item marked 🔴 Low using the AI's per-100 g values, with an inline "Tell me what this is" |
| AI quota hit, timeout or outage | Try the fallback models, then the offline rule-based parser in `core/parse`, then manual search. A "Basic mode" banner is shown. |
| Offline | Cached data stays visible. Manual and quick-add entries save and queue. Text is saved as `pending_ai` and analysed when back online. Photos prompt "describe it instead". |
| No integration connected | "No activity data connected" plus manual entry |
| Routes API fails | Estimated loop distance plus the Google Maps link, labelled approximate |
| Health token expired | A "Reconnect" chip; manual entry still works |

Every route has an error boundary. Logging is never blocked.

## 14. Build order (PRD phases in brackets; each step can be demoed)

| # | Milestone | Deliverables | Size |
|---|---|---|---|
| 0 | Setup | Firebase/GCP project, billing with $5 budget alert, APIs enabled. Firestore in `asia-south1` (its location is permanent). Monorepo, TS/ESLint/Prettier, Vitest, CI, emulators, env validation. `docs/PLAN.md`. | S |
| 1 | Design system and shell [P1] | Tokens and primitives (Card, StatCard, ProgressRing, Chip, Stepper, Sheet, Toast, Skeleton, Empty/Error/Loading states), AppShell, BottomNav, PWA manifest and service worker | M |
| 2 | Auth, onboarding, targets [P2, P8] | Google and guest sign-in, account linking, one-screen onboarding, `core/targets` with tests | M |
| 3 | Logging without AI [P3, P5] | `build-food-db.ts` producing about 300–400 foods (Indian staples plus common global foods), the nutrition engine and its tests, food search, ConfirmationSheet, entry and day writes, timeline, re-logging recent meals, the offline parser | L |
| 4 | AI interpretation [P4] | API skeleton (auth, caps, errors), Gemini client (Vertex / AI Studio switch, fallback chain), `/meals/interpret` for text, voice and photo, validation, `ai-eval.ts` with prompt tuning, the `pending_ai` queue | L |
| 5 | Dashboard [P6] | NutritionCard, MealCard, FoodCard, ConfidenceBadge, ranges, day switcher, "How we estimate" | M |
| 6 | Activity and energy [P7] | Activity chips, `/activity/interpret`, MET table, energy model, ActivityCard, EnergyCard | M |
| 7 | Recommendations and insights [P9] | Rules, diet-aware food suggestions, `/insights` with caching, tomorrow's focus, weekly Insights screen, streaks | L |
| 8 | Personal memory [P10] | Memory updates, typical portions, corrections, usual-meal templates, memory context sent to the AI | M |
| 9 | Move more [P12] | `/walk/routes`, RouteCard (Embed preview, Maps link, warnings), burn options, workout templates | M |
| 10 | Health integration [P11] | Provider interface, Google Health OAuth, sync, deduplication. Optional iOS Shortcut webhook. | M |
| 11 | Hardening [P13, P14] | Security-rule tests, API tests, Playwright end-to-end including offline, accessibility pass, performance budget, App Check, log scrubbing, export and delete | M |
| 12 | Deploy and demo [P15] | Production deploy, seeding the demo account with clearly labelled synthetic history, rehearsing the PRD §54 demo, README and docs | S |

**If time runs short, cut in this order:**
1. The webhook.
2. Google Health (you have no wearable to demo it with anyway).
3. Automatic usual-meal detection (keep a manual "Save as usual" button).
4. Weekly charts (keep the stats).

The PRD §55 "wow" flow needs only milestones 0–7 and 9.

## 15. Testing

- **Unit tests (Vitest), with the most coverage in `@crumb/core`, where correctness lives:** targets, units, matching, nutrition, σ and confidence levels, energy, MET values, rules, insight statistics and data labels, loop geometry, offline parser.
- **AI output contract tests:** recorded Gemini fixtures covering valid, partial and hostile responses (huge numbers, injected totals, extra fields, prompt-injection text in food names). Every one must pass validation or be rejected cleanly.
- **API tests:** Hono's `app.request()`, with `MOCK_EXTERNALS=1` so the AI, Maps and Health providers return fixtures. The Firestore emulator backs the caps and token storage.
- **Firestore rule tests:** `@firebase/rules-unit-testing` checking owner-only access, read-only integrations, and denied private data.
- **End-to-end (Playwright, Pixel-size viewport):**
  1. Onboarding.
  2. Type "I had milk, two bananas, three rotis, paneer sabzi and dal".
  3. Confirm.
  4. Check totals equal `core` sums.
  5. Add 6,200 steps; the energy card updates.
  6. The protein-gap recommendation appears.
  7. Walk planner (mocked).
  8. Go offline, quick-add, reconnect, and check it synced.
- **`pnpm ai:eval`** (run by hand, not in CI): about 40 text descriptions and about 10 photos against the real model. It reports item recall and precision and grams error. Target: 90%+ item recall on text.
- **CI (GitHub Actions):** typecheck, lint, unit, API and rule tests (with Java for the emulator), build.

## 16. Deployment and cost guardrails

- **Web:** `pnpm --filter web build && firebase deploy --only hosting,firestore`.
  - `firebase.json` rewrites `/api/**` to `run: {serviceId: crumb-api, region: asia-south1}`.
  - Hashed assets are cached as immutable; `sw.js` and `index.html` are never cached.
- **API:** tsup bundles api and core into one file. A slim `node:22-slim` root `Dockerfile` runs it. Deploy with:
  `gcloud run deploy crumb-api --source . --region asia-south1 --service-account crumb-api@… --allow-unauthenticated --min-instances 0 --max-instances 3 --memory 512Mi --timeout 60 --set-secrets …`
  - `--allow-unauthenticated` is needed so Hosting can reach the service. Security comes from Firebase ID token checks inside the app.
  - Set `--min-instances 1` only on demo day to avoid cold starts; it is paid from credits.
- **Service account roles:** `aiplatform.user`, `datastore.user`, `secretmanager.secretAccessor`.
- **Maps keys:** a server key restricted to the Routes API, and a browser key restricted to the Embed API plus our referrers.
- **Guardrails:**
  - Budget alerts at $1 and $5.
  - Per-user and global AI caps, max 3 instances.
  - Model IDs and quotas reviewed on day 0.
  - The Hosting-to-Cloud-Run rewrite has a 60-second limit, so AI calls time out at 20 seconds.

## 17. Verification

1. Locally, `pnpm typecheck && pnpm lint && pnpm test` passes (core, API and rule tests).
2. `pnpm dev` runs the emulators and API with `MOCK_EXTERNALS=1`. The Playwright end-to-end suite from §15 passes.
3. A real AI run: `pnpm ai:eval` against Vertex AI meets the recall target. Photos are reviewed by hand.
4. On the deployed app:
   - Install the PWA on Android and iOS.
   - Lighthouse scores 90+.
   - Run the full PRD §54 demo flow on the live URL.
   - Cloud Run logs contain no meal text or coordinates.
   - The billing report shows $0 for infrastructure.

## 18. Risks to re-check during setup

- Gemini model IDs and free quotas change often. Confirm them in Model Garden and AI Studio on day 0; they live in environment variables.
- The INDB redistribution license is unconfirmed. If it isn't clear, hand-curate about 100 Indian staples with citations.
- The Firestore location cannot be changed later. `asia-south1` is suggested for Indian users; use `nam5` or `us-central1` otherwise.
- Google Health's restricted scopes limit the app to 100 test users. With no wearable, demoing it needs a borrowed Fitbit or Pixel Watch.
- The free tiers could be abused. The caps, the max instance count, App Check and the budget alert cover this.

## 19. Build notes (what changed while building)

Honest differences between this plan and what was built, and why.

| Plan | Built | Why |
|---|---|---|
| Initial JS ≤ 250 KB gzipped | **~135 KB** gzipped for the first screen (React + router 97 KB, app + Firebase Auth 38 KB) plus a static splash in `index.html` that paints before any JavaScript. Firestore, the data layer and the signed-in screens (~225 KB) are one lazy chunk, fetched once the welcome screen is up or the moment a sign-in button is touched; Insights, Profile and the food table are separate chunks; the service worker registers after `load` and precaches everything for repeat visits. Lighthouse (mobile, simulated slow 4G, production build): **Performance 97, Accessibility 100, Best Practices 100, SEO 100**; LCP 2.3 s, TBT 0 ms, CLS 0. | The first version shipped everything up front (~375 KB, Performance 84, LCP 3.6 s); splitting at the sign-in boundary fixed it without giving up Firestore's offline cache. |
| Text logged offline is saved as `pending_ai` and analysed later | The **on-device parser** ("basic mode") estimates immediately, offline or when the AI is unavailable, through the same pipeline as Gemini's output. | Instant feedback beats a queue; the person can still edit everything. |
| TanStack Query, date-fns, Hono typed client | Not used: Firestore listeners are the data layer, `fetch` + shared Zod schemas validate API responses, dates use `Intl`. | Fewer dependencies and a smaller bundle. |
| Gemini schema from `z.toJSONSchema` | `toGeminiSchema()` emits the OpenAPI subset `responseSchema` accepts; responses are still re-validated with Zod and sanitised. | Gemini's structured-output schema is a subset of JSON Schema. |
| Android "share to Crumb" (`share_target`) | Not built; PWA shortcuts open "Log" and "Log a photo" directly. | Receiving shared images needs a custom service-worker POST handler; cut for time. |
| iOS Shortcut steps webhook | Not built (first item in the cut order). | No wearable in scope; Google Health covers device data. |
| App Check | Not enabled; per-user and global caps, max instances and budget alerts are in place. | Recommended before a public launch (see `docs/privacy.md`). |
| Usual-meal templates | Built as planned (3 repeats in 14 days), plus remembered portions snapped to natural servings (whole rotis, half katoris). | Raw averages like "2.4 rotis" read as broken. |
| — | `scripts/seed-demo.ts`: clearly labelled sample history for demos; `pnpm ai:eval`: 42 labelled meals measuring recall, precision and grams error. | Demo realism without fake data presented as real; measurable AI quality. |

Found by CI rather than by plan: newer Chrome returns a Promise from `window.scrollTo()`,
which crashed the shell when an effect returned it — now covered by a regression test.

## Sources (checked Oct 2026)

- Fitbit Web API shutdown and Google Health API:
  - [gadgetsandwearables: Oct 30 deadline](https://gadgetsandwearables.com/2026/09/28/fitbit-api-migration-deadline-october-30/)
  - [Sahha migration guide](https://sahha.ai/blog/fitbit-api-sunset-migration/)
  - [Google Health API setup](https://developers.google.com/health/setup)
  - [Data types](https://developers.google.com/health/data-types)
  - [OpenWearables guide](https://openwearables.io/blog/google-health-api-practical-guide-getting-started)
- Google Fit shutdown: [Sahha](https://sahha.ai/blog/google-fit-api-sunset-migration/), [Android Central](https://androidcentral.com/apps-software/google-has-set-a-deadline-to-shut-down-the-google-fit-api)
- Gemini:
  - [Free-tier guide](https://pecollective.com/tools/gemini-free-tier-guide/)
  - [Sept 2026 limits](https://www.memetik.ai/guides/gemini-api-free-tier-limits)
  - [Gemini 3.6 Flash](https://www.chatbase.co/blog/gemini-3-6-flash)
  - [Rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
  - [Firebase AI Logic pricing](https://firebase.google.com/docs/ai-logic/pricing)
- Maps: [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Embed API billing](https://developers.google.com/maps/documentation/embed/usage-and-billing)
- Cloud:
  - [GCP free tier 2026](https://agentdeals.dev/gcp-free-tier-2026)
  - [Firestore quotas](https://docs.cloud.google.com/firestore/quotas)
  - [Firebase pricing](https://firebase.google.com/pricing)
  - [Cloud Run locations](https://docs.cloud.google.com/run/docs/locations)
  - [Firebase Auth limits](https://firebase.google.com/docs/auth/limits)
  - [GCP free trial](https://docs.cloud.google.com/free)
- Food data: [USDA FDC API guide](https://fdc.nal.usda.gov/api-guide), [INDB paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC11277795)
- Fallback router: [OpenRouteService limits](https://openrouteservice.org/restrictions/)
