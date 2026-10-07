import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fitsDiet, type Diet, type FoodDb, type FoodDef } from '@crumb/core';
import { loadFoodDb } from '../../lib/foods';

/** Instant, offline food search over the bundled table (no AI, no network). */
export function FoodSearch({
  onPick,
  diet = 'any',
  autoFocus,
  initialQuery = '',
  placeholder = 'Search foods — roti, dal, paneer…',
}: {
  onPick: (food: FoodDef) => void;
  diet?: Diet;
  autoFocus?: boolean;
  initialQuery?: string;
  placeholder?: string;
}) {
  const [db, setDb] = useState<FoodDb | null>(null);
  const [q, setQ] = useState(initialQuery);
  useEffect(() => {
    void loadFoodDb().then(setDb);
  }, []);

  const results = useMemo(() => {
    if (!db || !q.trim()) return [];
    const found = db.search(q, 8);
    // Show diet-friendly options first without hiding anything the user searched for.
    return [...found].sort((a, b) => Number(fitsDiet(b, diet)) - Number(fitsDiet(a, diet)));
  }, [db, q, diet]);

  return (
    <div>
      <label className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface px-3 focus-within:border-primary">
        <Search className="size-5 text-muted" aria-hidden />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Search foods"
          className="h-full w-full bg-transparent text-[16px] font-bold outline-none placeholder:text-muted/60"
        />
      </label>
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-card">
          {results.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(f);
                  setQ('');
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-surface-2"
              >
                <span className="text-2xl" aria-hidden>
                  {f.emoji}
                </span>
                <span className="flex-1">
                  <span className="block text-[15px] font-extrabold">{f.name}</span>
                  <span className="block text-[12px] font-semibold text-muted">
                    ~{Math.round(f.per100g.kcal)} kcal · {Math.round(f.per100g.proteinG)} g protein
                    per 100 g
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {db && q.trim() && results.length === 0 && (
        <p className="mt-2 px-1 text-[13px] font-semibold text-muted">
          Not in our list yet — describe it in the text box and the AI will estimate it.
        </p>
      )}
    </div>
  );
}
