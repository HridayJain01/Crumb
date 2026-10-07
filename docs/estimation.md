# How Crumb estimates

Crumb shows **estimates, not measurements**. Two principles shape every number:

1. **The AI interprets; code calculates.** Gemini identifies foods, splits a meal into
   items and guesses portions. It never returns totals. All nutrition, ranges, targets,
   energy and statistics come from deterministic code in `packages/core`, which runs
   identically in the browser and on the server and is unit-tested (`pnpm test`).
2. **No false precision.** Values are shown rounded (kcal to 5/10/50 depending on size,
   macros to the gram, targets to 50 kcal / 5 g) with a range and a confidence label.

Constants below are the actual values in code; change them there, not here.

---

## 1. Daily targets — `targets/targets.ts`

| Step                                | Formula                                                                                                                                                                                                     |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BMR (Mifflin–St Jeor, 1990)         | `10·kg + 6.25·cm − 5·age + s`, where s = +5 (male), −161 (female), −78 (other, the midpoint)                                                                                                                |
| TDEE                                | BMR × activity factor: sedentary 1.2 · light 1.375 · moderate 1.55 · very active 1.725                                                                                                                      |
| Lose fat                            | TDEE − min(20% of TDEE, 750 kcal), never below max(BMR, 1,500 male / 1,200 female / 1,350 other). **No deficit if BMI < 18.5** (maintenance instead, with a note).                                          |
| Gain muscle                         | TDEE + min(10% of TDEE, 350 kcal)                                                                                                                                                                           |
| Maintain / fitness / general health | TDEE                                                                                                                                                                                                        |
| Protein                             | g per kg of _reference weight_: lose fat 1.6 · gain muscle 1.8 · fitness 1.4 · maintain 1.2 · general health 1.0; capped at 2.2 g/kg. Reference weight = actual weight, or the BMI-25 weight when BMI ≥ 30. |
| Fat                                 | 27% of kcal ÷ 9                                                                                                                                                                                             |
| Carbs                               | remaining kcal ÷ 4; if that falls under 100 g, fat is trimmed (never below 20% of kcal) to restore it                                                                                                       |
| Display                             | kcal rounded to 50, macros to 5 g, always shown with "~"                                                                                                                                                    |

Guards: onboarding requires age 18+ (also enforced by Firestore rules); targets are never
set or changed by the AI.

## 2. Food items — `nutrition/estimate.ts`

### Grams (first rule that applies wins)

1. The user typed grams or millilitres → exactly that.
2. A **photo** with an AI gram estimate → the AI's grams, clamped to ⅓×–3× of a reference
   portion (personal memory, else the food's unit weight, else a generic unit weight).
3. **Personal memory** — the food has been confirmed ≥ 3 times → the user's own average
   weight per unit (exponential moving average, α = 0.3).
4. The **food's own unit table** (e.g. roti 40 g/piece, idli 40 g/piece, dal 150 g/katori).
5. The AI's gram estimate for text.
6. A generic unit table (katori ≈ 150 g, glass ≈ 250 ml, …).

Remembered amounts used for quick-adds are snapped to what people serve: whole rotis and
slices, half katoris and glasses, quarters below one, 5 g steps.

### Nutrition source

Bundled table (≈190 foods, Indian home cooking first; USDA FoodData Central where noted)
→ personal memory → the AI's per-100 g values, accepted only if they pass an **Atwater
check** (4·P + 4·C + 9·F within ±25% of kcal, kcal ≤ 900/100 g). Anything else is marked
"tell me what this is".

`nutrition = per100g × grams ÷ 100`. For oil-sensitive dishes the fat is scaled by the
stated oil level: none 0.6 · light 0.8 · moderate/unknown 1.0 · heavy 1.35; restaurant
food with unknown oil 1.2.

### Uncertainty and confidence

Relative uncertainty is the root-sum-square of four independent sources:

```
σ = √(σ_identification² + σ_quantity² + σ_nutrition² + σ_preparation²)
```

| Source         | Values                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identification | AI high 0.05 · medium 0.15 · low 0.30 · user picked it 0.03                                                                                           |
| Quantity       | user grams 0.05 · memory 0.08 · stated count of a food-specific unit 0.10 · stated generic unit 0.15 · AI text estimate 0.20 · AI photo estimate 0.25 |
| Nutrition data | USDA 0.05 · curated 0.10 · memory 0.15 · AI per-100 g 0.30 · none 0.50                                                                                |
| Preparation    | not oil-sensitive 0 · oil known 0.05 · unknown 0.10 · restaurant 0.20                                                                                 |

Range = value × (1 ± σ). **High** confidence when σ ≤ 0.155, **Medium** when σ ≤ 0.335,
otherwise **Low**. Examples: "2 rotis" → High; typed "paneer sabzi" → Medium; a clear
photo → Medium; an unknown food → Low (matches PRD §13).

Meal and day totals are plain sums of item values; their ranges combine item
uncertainties as root-sum-square (independent errors partly cancel).

## 3. Energy — `energy/energy.ts`, `energy/met.ts`

All activity values are **net extra kcal** above resting, so nothing is counted twice.

```
Estimated burn ≈ BMR × 1.2                     (resting + digestion + ~3,000 everyday steps)
               + steps beyond 3,000 × stride × 0.5 kcal/kg/km × kg
               + Σ (MET − 1) × kg × hours      (logged workouts)
With a device's active energy: BMR × 1.1 + device active kcal + workouts it didn't record.
```

- Stride = 0.415 × height (men), 0.413 (women), 0.414 (other). Example: 8,000 steps at
  72 kg and 1.75 m ≈ 130 extra kcal.
- MET values follow the 2024 Adult Compendium of Physical Activities (Herrmann et al.):
  walk 2.8/3.5/4.8 (light/moderate/vigorous) · run 7.0/8.3/10.5 · cycling 4.0/6.8/9.0 ·
  strength 3.0/3.5/6.0 · yoga 2.3/2.5/4.0 · HIIT 5.5/8.0/9.5 · swimming 5.8/7.0/9.8 ·
  dance 4.0/5.0/7.0 · sports 4.5/6.0/8.0.
- Uncertainty: BMR ±10%, steps ±25%, workouts ±30%, device energy ±20%, combined as
  root-sum-square.
- **Balance** = intake − burn. If |balance| is within the combined uncertainty (or 100 kcal)
  it is shown as "roughly balanced"; otherwise "deficit"/"surplus". Before 8 pm the day
  is labelled "in progress" and phrased as "so far".

### Walking loops — `walk/geo.ts`

Distance for a target = target kcal ÷ ((MET − 1) ÷ speed × kg) at easy 3.5 / normal 5 /
brisk 6 km/h, clamped to 0.5–25 km. Two loops are drawn as three waypoints on a circle
through the user's position (radius = distance ÷ (2π × 1.25 detour factor)) in different
directions, then measured with the Routes API (walking) and rescaled once if more than
15% off. Without the Routes API the loop is shown as "estimated". The PRD's example
(~250 kcal ≈ 3.5 km) is running-level energy; walking is ~0.5 kcal/kg/km above resting,
so 250 extra kcal is roughly 6–7 km for a 72 kg adult — Crumb shows the honest number and
offers jog and home-workout alternatives.

## 4. Insights and recommendations — `insights/weekly.ts`, `recommend/rules.ts`

- Weekly averages use **complete days only** (today is still in progress).
- **On target** = share of logged days with kcal within ±10% of target **and** protein
  ≥ 90% of target; shown only from 3 full days.
- Data labels (PRD §33): < 3 logged days "Not enough data yet" · 3–13 "Early look" ·
  14–29 "Early pattern" · 30+ "Stronger trend".
- Recommendations are chosen by rules (at most two shown): protein gap ≥ 15 g after 2 pm
  (with diet- and allergy-aware food ideas), protein early in the day, steps under 70%
  of the recent average after 5 pm, a gentle walk (never eating less) after a big day on a
  fat-loss goal, no strength session in 3 days for muscle gain, and a
  supportive note — never a restriction — if intake has been under 800 kcal for 3+ days.
  Gemini only rewords the chosen action; a filter blocks shaming words and medical claims,
  and template text is used when the AI is unavailable.

## 5. Sources

- Mifflin MD, St Jeor ST et al. _A new predictive equation for resting energy expenditure._
  Am J Clin Nutr 1990;51:241–7.
- Herrmann SD et al. _2024 Adult Compendium of Physical Activities._ J Sport Health Sci
  2024;13(1):6–12.
- USDA FoodData Central (public domain, CC0): https://fdc.nal.usda.gov
- Longvah T et al. _Indian Food Composition Tables (IFCT 2017)_, NIN Hyderabad, and the
  open Indian Nutrient Databank (INDB). The curated Indian entries are typical home-style
  values; cross-check any entry against IFCT/INDB before relying on it, and use
  `pnpm foods:lookup` for USDA values.
- Protein ranges: ISSN position stand on protein and exercise (Jäger et al., 2017).

> Nutrition, calorie, activity and exercise values are estimates and should not be
> treated as medical advice.
