# Privacy, security and safety

Crumb handles health-adjacent data, so it collects as little as it can, keeps secrets
off the device, and lets people leave with everything.

## What is stored

All personal data lives in Cloud Firestore under the person's own user id. Security rules
(`firestore.rules`, tested in `tests/rules`) allow each signed-in user to read and write
**only their own documents**.

| Where                                        | What                                                                                                      | Notes                                                                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `users/{uid}`                                | Profile (age, sex, height, weight, activity level, goal, diet, allergies, time zone) and computed targets | Age 18+ and body ranges enforced by rules                                 |
| `users/{uid}/entries`                        | Meals: items, estimated nutrition, ranges, the typed text, a ~10 KB thumbnail                             | Thumbnail ≤ 40 KB, text ≤ 1,000 chars, ≤ 30 items (rules)                 |
| `users/{uid}/activities`                     | Steps and workouts                                                                                        | The client may write only `source: manual`; synced data is server-written |
| `users/{uid}/days`                           | Daily summaries (a cache recomputed from entries)                                                         |                                                                           |
| `users/{uid}/memory`, `meals`, `corrections` | Personal portions, usual meals, what the person corrected                                                 | Makes estimates more personal; corrections are append-only                |
| `users/{uid}/integrations`                   | Whether Google Health is connected, last sync time                                                        | Read-only for the client                                                  |
| `private/{uid}/tokens`                       | Google Health refresh token, **AES-256-GCM encrypted**                                                    | No client access at all                                                   |
| `rateLimits/*`                               | Per-user daily counters for AI and route requests                                                         | No client access                                                          |

## What is never stored

- **Photos.** A meal photo is compressed on the phone (≈1024 px JPEG), sent to the API
  once for interpretation and discarded. Only the tiny thumbnail is kept.
- **Location.** The walk planner sends the current position with one request; the API
  uses it to plan the loop and does not store or log it.
- **Logs with content.** Structured server logs drop any field that looks like text,
  images, coordinates, tokens, e-mail addresses or secrets, and refer to users by a
  truncated hash.

## AI processing

- In production the API calls **Gemini on Vertex AI** with the service account's own
  identity (no API key). Vertex AI does not use customer prompts to train models.
- For local development an **AI Studio key** can be used. Free-tier prompts may be used by
  Google to improve its products, so use synthetic examples only (as `pnpm ai:eval` does).
- For a meal, the model receives the text or photo, the local time, the diet and up to 15
  of the person's usual foods. For insight wording it receives a small summary of today
  (calories rounded to 50, protein to 5 g, steps, meals logged), goal and diet, a few common
  food names and the action the rules already chose — never meal history.
- Model output is validated against a schema, clamped and checked (Atwater, limits)
  before use; it can never set totals or targets.

## Secrets and keys

- Server secrets (token encryption key, OAuth state key, Maps server key, OAuth client
  secret) live in **Secret Manager** and reach Cloud Run as environment variables.
- The only values in the web app are the Firebase web config and a Maps Embed key. Both
  are public by design; the Embed key is restricted to the Embed API and the app's domains.
- Every API route verifies a Firebase ID token. Per-user daily caps (60 AI calls, 20 route
  requests) and a global AI cap protect the free tiers and credits; Cloud Run is capped at
  3 instances.

## Google Health (optional)

Read-only activity scope only (`googlehealth.activity_and_fitness.readonly`). The OAuth
`state` is HMAC-signed and bound to the user for 10 minutes. Disconnecting — or deleting the
account — revokes the token with Google and deletes it. While the Google Cloud app is in
"Testing" mode, only listed test users can connect and tokens expire after 7 days.

## People stay in control

- **Guest mode** needs no account; a guest can later "Save with Google" and keep everything.
  Signing out of a guest account asks first, because a guest journal cannot be reopened.
- **Export** downloads all of a person's documents as JSON (Profile → Your data).
- **Delete everything** removes every document under the user, the encrypted tokens, the
  Google Health connection and the sign-in account itself.
- Sample history created by `pnpm seed:demo` is labelled "Sample history" in the app and
  tagged in the data, so it is never mistaken for real health data.

## Safety

- Every estimate is shown as approximate, with a range and a confidence label, and the
  disclaimer appears on the welcome screen, in Profile and in the review sheet:
  _Nutrition, calorie, activity and exercise values are estimates and should not be treated
  as medical advice._
- Targets have floors (never below BMR or 1,200–1,500 kcal), no deficit is offered with a
  BMI under 18.5, and onboarding is 18+ only.
- Recommendations never suggest eating less to "make up" for food. If intake has been under
  800 kcal for three days or more, Crumb shows a supportive note pointing to a professional.
- Insight wording passes a filter that blocks shaming language and medical claims.

## Known limits

- Because the app writes to Firestore directly, a determined user can write odd data into
  **their own** account (size limits apply). Enabling **App Check** and the budget alerts
  from `scripts/setup-gcp.sh` are the recommended guards for a public launch.
- Google Health's scopes are restricted: a public launch needs Google's OAuth verification
  and an annual security assessment. For a hackathon, testing mode with listed users is fine.
