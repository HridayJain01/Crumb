import { useEffect, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import {
  foodUnitGrams,
  formatQuantity,
  formatRange,
  recomputeItem,
  recomputeItemWithDb,
  UNITS,
  type Diet,
  type FoodDb,
  type FoodItem,
  type Unit,
} from '@crumb/core';
import { ConfidenceBadge } from '../../components/ui/Badge';
import { Stepper } from '../../components/ui/Stepper';
import { loadFoodDb } from '../../lib/foods';
import { FoodSearch } from './FoodSearch';

function unitOptions(item: FoodItem, db: FoodDb | null): Unit[] {
  const food = item.foodId ? db?.byId.get(item.foodId) : undefined;
  const own = food ? UNITS.filter((u) => u === 'g' || foodUnitGrams(food, u) !== undefined) : [];
  const set = new Set<Unit>([item.unit, ...own, 'g']);
  if (!food) ['piece', 'bowl', 'glass', 'plate', 'serving'].forEach((u) => set.add(u as Unit));
  return [...set];
}

/** One editable food: amount stepper, unit, grams, variants, provenance. Edits recompute instantly. */
export function ItemRow({
  item,
  onChange,
  onRemove,
  diet,
}: {
  item: FoodItem;
  onChange: (next: FoodItem) => void;
  onRemove: () => void;
  diet: Diet;
}) {
  const [db, setDb] = useState<FoodDb | null>(null);
  const [open, setOpen] = useState(false);
  const [editingGrams, setEditingGrams] = useState(false);
  const [grams, setGrams] = useState(String(Math.round(item.grams)));
  useEffect(() => {
    void loadFoodDb().then(setDb);
  }, []);
  useEffect(() => {
    setGrams(String(Math.round(item.grams)));
  }, [item.grams]);

  const isWeight = item.unit === 'g' || item.unit === 'ml';
  const kcal = item.nutrition.kcal;
  const range = formatRange(item.range.kcal.low, item.range.kcal.high);

  function pickAlternative(name: string) {
    const match = db?.match(name);
    onChange(match ? recomputeItem(item, { food: match.food }) : { ...item, name });
  }

  return (
    <li className="rounded-2xl bg-surface p-3 shadow-card animate-fade-up">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-[28px] leading-none" aria-hidden>
          {item.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-extrabold leading-tight">{item.name}</p>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${item.name}`}
              className="-mt-1 -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2"
            >
              <X className="size-4" />
            </button>
          </div>
          {item.needsInput ? (
            <p className="mt-0.5 text-[13px] font-bold text-danger">
              Not sure what this is — tell me below.
            </p>
          ) : (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-bold text-muted">
              <span className="text-ink tabular">{range === '0' ? '~0' : `~${range}`} kcal</span>
              <span aria-hidden>·</span>
              <span className="tabular">{Math.round(item.nutrition.proteinG)} g protein</span>
              <ConfidenceBadge level={item.confidence} compact />
            </p>
          )}
        </div>
      </div>

      {item.needsInput ? (
        <div className="mt-3">
          <FoodSearch
            diet={diet}
            initialQuery={item.name}
            placeholder="What is it? e.g. paneer roll"
            onPick={(food) => onChange(recomputeItem(item, { food }))}
          />
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {!isWeight && (
              <Stepper
                label={`${item.name} amount`}
                value={item.quantity}
                onChange={(quantity) => onChange(recomputeItem(item, { quantity }))}
              />
            )}
            <label className="relative inline-flex h-9 items-center rounded-chip bg-surface-2 pl-3 pr-7 text-[14px] font-extrabold">
              <span className="sr-only">Unit</span>
              <select
                value={item.unit}
                onChange={(e) => {
                  const unit = e.target.value as Unit;
                  onChange(
                    db ? recomputeItemWithDb(item, { unit }, db) : recomputeItem(item, { unit }),
                  );
                }}
                className="appearance-none bg-transparent outline-none"
              >
                {unitOptions(item, db).map((u) => (
                  <option key={u} value={u}>
                    {u === 'g'
                      ? 'grams'
                      : u === 'ml'
                        ? 'ml'
                        : formatQuantity(item.quantity, u).replace(/^[\d.]+ /, '')}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-2 size-4 text-muted"
                aria-hidden
              />
            </label>
            {editingGrams ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const g = Number(grams);
                  if (g > 0) onChange(recomputeItem(item, { grams: g }));
                  setEditingGrams(false);
                }}
                className="inline-flex h-9 items-center gap-1 rounded-chip border border-primary bg-surface px-3"
              >
                <input
                  autoFocus
                  inputMode="numeric"
                  value={grams}
                  onChange={(e) => setGrams(e.target.value.replace(/\D/g, ''))}
                  onBlur={(e) => e.currentTarget.form?.requestSubmit()}
                  aria-label="Grams"
                  className="w-14 bg-transparent text-[14px] font-extrabold outline-none tabular"
                />
                <span className="text-[13px] font-bold text-muted">g</span>
              </form>
            ) : (
              !isWeight && (
                <button
                  type="button"
                  onClick={() => setEditingGrams(true)}
                  className="h-9 rounded-chip px-3 text-[13px] font-bold text-muted underline decoration-dotted underline-offset-4 hover:bg-surface-2"
                  aria-label={`About ${Math.round(item.grams)} grams. Tap to enter exact grams.`}
                >
                  ~{Math.round(item.grams)} g
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className="ml-auto h-9 rounded-chip px-2 text-[13px] font-extrabold text-primary-ink hover:bg-primary-soft"
            >
              {open ? 'Hide' : 'Why?'}
            </button>
          </div>

          {item.alternatives && item.alternatives.length > 0 && !item.basis.userChoseFood && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-bold text-muted">Or was it:</span>
              {item.alternatives.map((alt) => (
                <button
                  key={alt}
                  type="button"
                  onClick={() => pickAlternative(alt)}
                  className="rounded-chip border border-line px-2.5 py-1 text-[12px] font-extrabold hover:border-primary"
                >
                  {alt}
                </button>
              ))}
            </div>
          )}

          {open && (
            <ul className="mt-2 space-y-1 rounded-xl bg-surface-2 p-3 text-[13px] font-semibold text-muted">
              {item.assumptions.map((a) => (
                <li key={a}>• {a}</li>
              ))}
              <li className="pt-1 text-[12px]">
                ~{Math.round(kcal)} kcal · P {Math.round(item.nutrition.proteinG)} g · C{' '}
                {Math.round(item.nutrition.carbsG)} g · F {Math.round(item.nutrition.fatG)} g (point
                estimate)
              </li>
            </ul>
          )}
        </>
      )}
    </li>
  );
}
