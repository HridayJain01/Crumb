import { deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  diffCorrections,
  findTemplateCandidate,
  memoryKeyFor,
  stepsNetKcal,
  sumItems,
  updateFoodMemory,
  wasCorrected,
  type Activity,
  type FoodEntry,
  type FoodItem,
  type FoodMemory,
  type InputType,
  type MealDraft,
  type MealTemplate,
  type Profile,
  type TemplateCandidate,
  addDays,
  localHour,
  type Intensity,
  type WorkoutType,
} from '@crumb/core';
import { db } from '../lib/firebase';
import { deviceTimeZone } from '../lib/time';
import { queries, refs } from './hooks';

/*
 * All writes go straight to Firestore (owner-only rules). They land in the local cache
 * immediately, so the UI updates instantly and works offline; we never block on commit.
 */

function settle(p: Promise<unknown>) {
  p.catch((err) => console.warn('Firestore write failed', err));
}

export interface SaveMealsInput {
  uid: string;
  date: string;
  drafts: MealDraft[];
  /** Items exactly as the AI/parser proposed them, for correction tracking. */
  originalItems: FoodItem[];
  inputType: InputType;
  rawInput?: string;
  thumb?: string;
  aiModel?: string;
  memory: ReadonlyMap<string, FoodMemory>;
  templateId?: string;
}

export interface SavedEntry {
  id: string;
  entry: FoodEntry;
}

export function saveMeals(input: SaveMealsInput): SavedEntry[] {
  const now = new Date();
  const iso = now.toISOString();
  const batch = writeBatch(db);
  const memory = new Map(input.memory);
  const saved: SavedEntry[] = [];

  input.drafts.forEach((draft, index) => {
    if (!draft.items.length) return;
    const ref = doc(refs.entries(input.uid));
    const entry: FoodEntry = {
      date: input.date,
      // Keep multi-meal saves in the order they were described.
      loggedAt: new Date(now.getTime() + index).toISOString(),
      mealType: draft.mealType,
      inputType: input.inputType,
      rawInput: input.rawInput?.slice(0, 1000) || undefined,
      thumb: index === 0 ? input.thumb : undefined,
      status: 'confirmed',
      items: draft.items,
      totals: sumItems(draft.items),
      aiModel: input.aiModel,
      templateId: input.templateId,
      createdAt: iso,
      updatedAt: iso,
    };
    batch.set(ref, entry);
    saved.push({ id: ref.id, entry });

    for (const item of draft.items) {
      if (item.needsInput) continue;
      const key = memoryKeyFor(item.name, item.foodId);
      const next = updateFoodMemory(memory.get(key), item, draft.mealType, now, wasCorrected(item));
      memory.set(key, next);
      batch.set(refs.memoryItem(input.uid, key), next);
    }
    // What the user changed on each kept item…
    for (const correction of diffCorrections(ref.id, [], draft.items, now)) {
      batch.set(doc(refs.corrections(input.uid)), correction);
    }
  });

  // …and which proposed items they removed (recorded against the first saved entry).
  const first = saved[0];
  if (first) {
    const kept = input.drafts.flatMap((d) => d.items);
    for (const correction of diffCorrections(first.id, input.originalItems, kept, now)) {
      if (correction.field === 'removed') batch.set(doc(refs.corrections(input.uid)), correction);
    }
  }

  settle(batch.commit());
  return saved;
}

export function deleteEntry(uid: string, id: string) {
  settle(deleteDoc(refs.entry(uid, id)));
}

export function restoreEntry(uid: string, id: string, entry: FoodEntry) {
  settle(setDoc(refs.entry(uid, id), entry));
}

export function updateEntryItems(uid: string, id: string, entry: FoodEntry, items: FoodItem[]) {
  const updated: FoodEntry = {
    ...entry,
    items,
    totals: sumItems(items),
    updatedAt: new Date().toISOString(),
  };
  settle(setDoc(refs.entry(uid, id), updated));
}

/** Today's step total from the phone or watch, typed by the user (one doc per day). */
export function setManualSteps(uid: string, date: string, steps: number, profile: Profile) {
  const iso = new Date().toISOString();
  const kcal = Math.round(stepsNetKcal(steps, profile));
  const activity: Activity = {
    date,
    startedAt: `${date}T00:00:00.000Z`,
    type: 'steps',
    label: 'Steps',
    steps: Math.round(steps),
    kcal,
    range: { low: Math.round(kcal * 0.75), high: Math.round(kcal * 1.25) },
    source: 'manual',
    confidence: 'medium',
    createdAt: iso,
    updatedAt: iso,
  };
  settle(setDoc(refs.activity(uid, `steps-${date}`), activity));
}

export function addWorkout(
  uid: string,
  date: string,
  w: {
    type: WorkoutType;
    label: string;
    intensity: Intensity;
    durationMin: number;
    distanceKm?: number;
    kcal: number;
    low: number;
    high: number;
    met: number;
    confidence: Activity['confidence'];
  },
): string {
  const iso = new Date().toISOString();
  const ref = doc(refs.activities(uid));
  const activity: Activity = {
    date,
    startedAt: iso,
    type: w.type,
    label: w.label,
    durationMin: w.durationMin,
    distanceKm: w.distanceKm,
    kcal: w.kcal,
    range: { low: w.low, high: w.high },
    met: w.met,
    intensity: w.intensity,
    source: 'manual',
    confidence: w.confidence,
    createdAt: iso,
    updatedAt: iso,
  };
  settle(setDoc(ref, activity));
  return ref.id;
}

export function deleteActivity(uid: string, id: string) {
  settle(deleteDoc(refs.activity(uid, id)));
}

/** After a save, checks recent history for a repeated meal worth saving as "Your usual …". */
export async function templateCandidateFor(
  uid: string,
  saved: SavedEntry,
  templates: readonly Pick<MealTemplate, 'signature'>[],
): Promise<TemplateCandidate | null> {
  try {
    const from = addDays(saved.entry.date, -14);
    const snap = await getDocs(queries.entriesBetween(uid, from, saved.entry.date));
    const recent = snap.docs.filter((d) => d.id !== saved.id).map((d) => d.data() as FoodEntry);
    const tz = deviceTimeZone();
    return findTemplateCandidate(saved.entry, recent, templates, (iso) =>
      localHour(new Date(iso), tz),
    );
  } catch {
    return null;
  }
}

export function saveTemplate(uid: string, candidate: TemplateCandidate, label?: string): string {
  const ref = doc(refs.meals(uid));
  const template: MealTemplate = {
    label: label?.trim() || candidate.label,
    signature: candidate.signature,
    mealType: candidate.mealType,
    items: candidate.items,
    count: 3,
    typicalHour: candidate.typicalHour,
    lastUsed: new Date().toISOString(),
    source: 'auto',
  };
  settle(setDoc(ref, template));
  return ref.id;
}

export function touchTemplate(uid: string, id: string, count: number) {
  settle(updateDoc(refs.meal(uid, id), { count: count + 1, lastUsed: new Date().toISOString() }));
}

export function deleteTemplate(uid: string, id: string) {
  settle(deleteDoc(refs.meal(uid, id)));
}
