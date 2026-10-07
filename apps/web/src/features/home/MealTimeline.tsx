import { useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import {
  formatQuantity,
  formatRange,
  MEAL_LABEL,
  type Diet,
  type FoodEntryWithId,
  type MealDraft,
} from '@crumb/core';
import { ConfidenceBadge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { deleteEntry, restoreEntry, updateEntryItems } from '../../data/mutations';
import { timeLabel } from '../../lib/time';
import { ConfirmSheet } from '../log/ConfirmSheet';
import type { LogSheetState } from '../log/useLogFlow';

const MEAL_EMOJI = { breakfast: '🌅', lunch: '🍛', snack: '🥤', dinner: '🌙' } as const;

function MealCard({ uid, entry, diet }: { uid: string; entry: FoodEntryWithId; diet: Diet }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LogSheetState | null>(null);
  const toast = useToast();
  const { id, ...data } = entry;
  const t = entry.totals;
  const lowest = entry.items.reduce<'high' | 'medium' | 'low'>(
    (acc, i) =>
      i.confidence === 'low' ? 'low' : i.confidence === 'medium' && acc === 'high' ? 'medium' : acc,
    'high',
  );

  return (
    <li className="rounded-card bg-surface shadow-card animate-fade-up">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {entry.thumb ? (
          <img src={entry.thumb} alt="" className="size-14 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-[28px]"
            aria-hidden
          >
            {entry.items[0]?.emoji ?? MEAL_EMOJI[entry.mealType]}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-[12px] font-extrabold text-muted">
            <span>{timeLabel(entry.loggedAt)}</span>
            <span aria-hidden>·</span>
            <span>
              {MEAL_EMOJI[entry.mealType]} {MEAL_LABEL[entry.mealType]}
            </span>
          </span>
          <span className="block truncate text-[16px] font-extrabold">
            {entry.items.map((i) => i.name).join(' + ')}
          </span>
          <span className="block text-[13px] font-bold text-muted tabular">
            ~{formatRange(t.kcal.low, t.kcal.high)} kcal · {Math.round(t.nutrition.proteinG)} g
            protein
          </span>
        </span>
        <ChevronDown
          className={`size-5 shrink-0 text-muted transition ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-line px-3 pt-2 pb-3">
          <ul className="space-y-2">
            {entry.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-2">
                <span className="text-[14px] font-bold">
                  <span aria-hidden>{i.emoji}</span> {i.name}
                  <span className="block text-[12px] font-semibold text-muted">
                    {formatQuantity(i.quantity, i.unit)} · ~{Math.round(i.grams)} g ·{' '}
                    {i.assumptions[1] ?? i.assumptions[0]}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[13px] font-extrabold tabular">
                  ~{formatRange(i.range.kcal.low, i.range.kcal.high)}
                  <span className="block">
                    <ConfidenceBadge level={i.confidence} compact />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <ConfidenceBadge level={lowest} />
            <button
              type="button"
              onClick={() =>
                setEditing({
                  status: 'ready',
                  drafts: [{ mealType: entry.mealType, items: entry.items }],
                  originals: [],
                  inputType: entry.inputType,
                  basicMode: false,
                })
              }
              className="ml-auto inline-flex h-9 items-center gap-1 rounded-chip px-3 text-[13px] font-extrabold text-primary-ink hover:bg-primary-soft"
            >
              <Pencil className="size-4" aria-hidden /> Edit
            </button>
            <button
              type="button"
              onClick={() => {
                deleteEntry(uid, id);
                toast({
                  message: 'Meal removed',
                  action: { label: 'Undo', onClick: () => restoreEntry(uid, id, data) },
                });
              }}
              className="inline-flex h-9 items-center gap-1 rounded-chip px-3 text-[13px] font-extrabold text-danger hover:bg-danger-soft"
            >
              <Trash2 className="size-4" aria-hidden /> Delete
            </button>
          </div>
        </div>
      )}
      {editing && (
        <ConfirmSheet
          state={editing}
          diet={diet}
          onClose={() => setEditing(null)}
          onDescribeInstead={() => setEditing(null)}
          onConfirm={(drafts: MealDraft[]) => {
            const items = drafts.flatMap((d) => d.items);
            const mealType = drafts[0]?.mealType ?? entry.mealType;
            if (items.length) updateEntryItems(uid, id, { ...data, mealType }, items);
            else deleteEntry(uid, id);
            setEditing(null);
            toast({ message: 'Meal updated' });
          }}
        />
      )}
    </li>
  );
}

export function MealTimeline({
  uid,
  entries,
  diet,
}: {
  uid: string;
  entries: FoodEntryWithId[];
  diet: Diet;
}) {
  return (
    <ol className="space-y-2" aria-label="Meals">
      {entries.map((e) => (
        <MealCard key={e.id} uid={uid} entry={e} diet={diet} />
      ))}
    </ol>
  );
}
