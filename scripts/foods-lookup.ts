/**
 * Helps curate the bundled food table from USDA FoodData Central (public domain, CC0).
 *
 *   pnpm foods:lookup "paneer"            top matches with per-100 g macros
 *   pnpm foods:lookup "chickpeas boiled" --all   include branded foods
 *
 * Uses FDC_API_KEY if set, otherwise the shared DEMO_KEY (low rate limit). Also shows whether
 * the bundled table already knows the food, and prints a ready-to-edit food(...) entry.
 */
import { parseArgs } from 'node:util';
import { getFoodDb } from '@crumb/core/foods';

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: { all: { type: 'boolean', default: false } },
});
const query = positionals.join(' ').trim();
if (!query) {
  console.error('Usage: pnpm foods:lookup "<food name>" [--all]');
  process.exit(1);
}

interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodNutrients: { nutrientId: number; value: number }[];
}

// FDC nutrient ids: energy (kcal) 1008, or Atwater-specific 2047/2048; protein 1003;
// carbohydrate 1005; total fat 1004.
const nutrient = (f: FdcFood, ...ids: number[]) =>
  ids.map((id) => f.foodNutrients.find((n) => n.nutrientId === id)?.value).find((v) => v != null);

async function main() {
  const known = getFoodDb().match(query);
  console.log(
    known
      ? `Bundled table: "${query}" → ${known.food.id} (${known.food.name}, ${known.method} match)\n`
      : `Bundled table: no match for "${query}"\n`,
  );

  const params = new URLSearchParams({
    query,
    pageSize: '6',
    api_key: process.env.FDC_API_KEY ?? 'DEMO_KEY',
  });
  if (!args.all) params.set('dataType', 'Foundation,SR Legacy,Survey (FNDDS)');
  const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?${params}`);
  if (!res.ok) {
    throw new Error(
      `FoodData Central returned ${res.status} (network blocked, rate-limited DEMO_KEY, or a bad FDC_API_KEY)`,
    );
  }
  const { foods = [] } = (await res.json()) as { foods?: FdcFood[] };
  if (!foods.length) {
    console.log('No FoodData Central results.');
    return;
  }

  for (const f of foods) {
    const kcal = nutrient(f, 1008, 2047, 2048) ?? 0;
    const p = nutrient(f, 1003) ?? 0;
    const c = nutrient(f, 1005) ?? 0;
    const fat = nutrient(f, 1004) ?? 0;
    const atwater = 4 * p + 4 * c + 9 * fat;
    const drift = kcal ? Math.round(((atwater - kcal) / kcal) * 100) : 0;
    console.log(
      `${f.description} [${f.dataType}, fdc ${f.fdcId}]\n` +
        `  per 100 g: ${kcal} kcal · P ${p} · C ${c} · F ${fat}` +
        (Math.abs(drift) > 25 ? `  ⚠ Atwater drift ${drift}% (the table rejects >25%)` : ''),
    );
  }
  const best = foods[0]!;
  const id = query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  console.log(
    `\nDraft entry for packages/core/src/nutrition/foods-data.ts (check units and aliases):\n` +
      `  food('${id}', '${query[0]!.toUpperCase()}${query.slice(1)}', '🍽️', 'snack', 'veg',\n` +
      `    [${nutrient(best, 1008, 2047, 2048) ?? 0}, ${nutrient(best, 1003) ?? 0}, ${nutrient(best, 1005) ?? 0}, ${nutrient(best, 1004) ?? 0}],\n` +
      `    { serving: 100 }, 'serving', ['${query.toLowerCase()}'], { source: 'usda' }),`,
  );
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
