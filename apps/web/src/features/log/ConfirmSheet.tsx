import { useEffect, useMemo, useState } from 'react';
import { Check, Info, Plus, Sparkles } from 'lucide-react';
import {
  buildManualItem,
  formatRange,
  MEAL_LABEL,
  MEAL_TYPES,
  sumItems,
  type Diet,
  type MealDraft,
} from '@crumb/core';
import { Sheet } from '../../components/ui/Sheet';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/States';
import { ItemRow } from './ItemRow';
import { FoodSearch } from './FoodSearch';
import type { LogSheetState } from './useLogFlow';

function Analyzing({ preview }: { preview?: string }) {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      {preview && (
        <img src={preview} alt="Your meal" className="h-40 w-full rounded-2xl object-cover" />
      )}
      <p className="flex items-center gap-2 text-[15px] font-extrabold text-muted">
        <Sparkles className="size-5 animate-pulse text-primary" aria-hidden />
        Analyzing your meal…
      </p>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

export function ConfirmSheet({
  state,
  diet,
  onConfirm,
  onClose,
  onDescribeInstead,
}: {
  state: LogSheetState;
  diet: Diet;
  onConfirm: (drafts: MealDraft[]) => void;
  onClose: () => void;
  onDescribeInstead: () => void;
}) {
  const [drafts, setDrafts] = useState<MealDraft[]>(state.drafts);
  const [adding, setAdding] = useState<number | null>(null);
  useEffect(() => {
    setDrafts(state.drafts);
  }, [state.drafts]);

  const all = useMemo(() => drafts.flatMap((d) => d.items), [drafts]);
  const totals = useMemo(() => sumItems(all), [all]);
  const blocked = all.some((i) => i.needsInput);
  const open = state.status !== 'closed';

  const title =
    state.status === 'analyzing'
      ? 'One moment…'
      : state.status === 'ready'
        ? 'Does this look right?'
        : 'Hmm, let’s try that again';

  const footer =
    state.status === 'ready' ? (
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-[13px] font-extrabold uppercase tracking-wide text-muted">
            Total
          </span>
          <span className="text-lg font-black tabular">
            ~{formatRange(totals.kcal.low, totals.kcal.high)} kcal
            <span className="text-[14px] font-bold text-muted">
              {' '}
              · {Math.round(totals.nutrition.proteinG)} g protein
            </span>
          </span>
        </div>
        <Button
          size="lg"
          block
          icon={<Check className="size-5" strokeWidth={3} />}
          disabled={!all.length || blocked}
          onClick={() => onConfirm(drafts.filter((d) => d.items.length))}
        >
          {blocked ? 'Tell me what the unknown item is' : 'Looks right'}
        </Button>
        <p className="mt-2 pb-1 text-center text-[11px] font-semibold text-muted">
          Estimates, not medical advice. You can edit anything later.
        </p>
      </div>
    ) : undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={title} footer={footer}>
      {state.status === 'analyzing' && <Analyzing preview={state.photo?.previewUrl} />}

      {state.status === 'ready' && (
        <div className="space-y-5">
          {state.basicMode && (
            <p
              className="flex items-start gap-2 rounded-2xl bg-warning-soft p-3 text-[13px] font-bold text-warning"
              role="status"
            >
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              The AI is taking a break, so I matched this with Crumb’s food list. Please check the
              amounts.
            </p>
          )}
          {state.question && (
            <p className="flex items-start gap-2 rounded-2xl bg-teal-soft p-3 text-[13px] font-bold text-teal">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.question}
            </p>
          )}
          {state.photo && (
            <img
              src={state.photo.previewUrl}
              alt="Your meal"
              className="h-32 w-full rounded-2xl object-cover"
            />
          )}
          {drafts.map((draft, di) => (
            <section key={di} aria-label={MEAL_LABEL[draft.mealType]}>
              <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-1">
                {MEAL_TYPES.map((t) => (
                  <Chip
                    key={t}
                    selected={draft.mealType === t}
                    onClick={() =>
                      setDrafts((ds) => ds.map((d, i) => (i === di ? { ...d, mealType: t } : d)))
                    }
                  >
                    {MEAL_LABEL[t]}
                  </Chip>
                ))}
              </div>
              <ul className="space-y-2">
                {draft.items.map((item, ii) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    diet={diet}
                    onChange={(next) =>
                      setDrafts((ds) =>
                        ds.map((d, i) =>
                          i === di
                            ? { ...d, items: d.items.map((x, j) => (j === ii ? next : x)) }
                            : d,
                        ),
                      )
                    }
                    onRemove={() =>
                      setDrafts((ds) =>
                        ds.map((d, i) =>
                          i === di ? { ...d, items: d.items.filter((_, j) => j !== ii) } : d,
                        ),
                      )
                    }
                  />
                ))}
              </ul>
              {adding === di ? (
                <div className="mt-2">
                  <FoodSearch
                    autoFocus
                    diet={diet}
                    onPick={(food) => {
                      setDrafts((ds) =>
                        ds.map((d, i) =>
                          i === di ? { ...d, items: [...d.items, buildManualItem(food)] } : d,
                        ),
                      );
                      setAdding(null);
                    }}
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(di)}
                  className="mt-2 inline-flex h-10 items-center gap-1.5 rounded-chip px-3 text-[14px] font-extrabold text-primary-ink hover:bg-primary-soft"
                >
                  <Plus className="size-4" /> Add something
                </button>
              )}
            </section>
          ))}
        </div>
      )}

      {state.status === 'not_food' && (
        <EmptyState
          mood="thinking"
          title="I’m not confident about this one"
          body="Tell me what it is in a few words, or search for it."
          action={<Button onClick={onDescribeInstead}>Describe it instead</Button>}
        />
      )}
      {state.status === 'unclear_image' && (
        <EmptyState
          mood="oops"
          title="That photo is a bit tricky"
          body="Try taking it from above, in good light — or just describe the meal."
          action={<Button onClick={onDescribeInstead}>Describe it instead</Button>}
        />
      )}
      {state.status === 'error' && (
        <ErrorState
          body={state.message}
          action={<Button onClick={onDescribeInstead}>Describe it instead</Button>}
        />
      )}
    </Sheet>
  );
}
