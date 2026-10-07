import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  approxKcal,
  buildItemFromMemory,
  buildMealDrafts,
  cloneTemplateItems,
  mealTypeForHour,
  memoryHints,
  parseMealText,
  type AiMealInterpretation,
  type FoodItem,
  type FoodMemory,
  type InputType,
  type MealDraft,
  type MealTemplateWithId,
  type MealType,
  type Profile,
} from '@crumb/core';
import { api, ApiError } from '../../lib/api';
import { loadFoodDb } from '../../lib/foods';
import type { PreparedPhoto } from '../../lib/image';
import { deviceTimeZone, hourNow, localTimeString, todayKey } from '../../lib/time';
import {
  deleteEntry,
  saveMeals,
  saveTemplate,
  templateCandidateFor,
  touchTemplate,
  type SavedEntry,
} from '../../data/mutations';
import { useToast } from '../../components/ui/Toast';

export type SheetStatus = 'closed' | 'analyzing' | 'ready' | 'not_food' | 'unclear_image' | 'error';

export interface LogSheetState {
  status: SheetStatus;
  drafts: MealDraft[];
  originals: FoodItem[];
  inputType: InputType;
  rawInput?: string;
  photo?: PreparedPhoto;
  model?: string;
  basicMode: boolean;
  question?: string | null;
  message?: string;
}

const CLOSED: LogSheetState = {
  status: 'closed',
  drafts: [],
  originals: [],
  inputType: 'text',
  basicMode: false,
};

export function useLogFlow(opts: {
  uid: string;
  profile: Profile;
  memory: ReadonlyMap<string, FoodMemory>;
  memoryList: readonly FoodMemory[];
  templates: readonly MealTemplateWithId[];
  date?: string;
}) {
  const [sheet, setSheet] = useState<LogSheetState>(CLOSED);
  const toast = useToast();
  const navigate = useNavigate();

  const close = useCallback(() => setSheet(CLOSED), []);

  const toDrafts = useCallback(
    async (interp: AiMealInterpretation, inputType: InputType, mealTypeHint?: MealType) => {
      const db = await loadFoodDb();
      return buildMealDrafts(interp, {
        db,
        inputType,
        memory: opts.memory,
        templates: opts.templates,
        hour: hourNow(opts.profile.timezone),
        mealTypeHint,
      });
    },
    [opts.memory, opts.templates, opts.profile.timezone],
  );

  /** Text, voice or photo → interpretation → deterministic estimates → confirmation sheet. */
  const analyze = useCallback(
    async (input: {
      text?: string;
      photo?: PreparedPhoto;
      inputType: InputType;
      mealTypeHint?: MealType;
    }) => {
      const text = input.text?.trim() || undefined;
      setSheet({
        ...CLOSED,
        status: 'analyzing',
        inputType: input.inputType,
        rawInput: text,
        photo: input.photo,
      });
      let interpretation: AiMealInterpretation;
      let model: string | undefined;
      let basicMode = false;
      try {
        const res = await api.interpretMeal({
          text,
          imageBase64: input.photo?.base64,
          imageMimeType: input.photo?.mimeType,
          localTime: localTimeString(),
          timezone: opts.profile.timezone || deviceTimeZone(),
          mealTypeHint: input.mealTypeHint,
          diet: opts.profile.diet,
          memoryHints: memoryHints(opts.memoryList, opts.templates),
        });
        interpretation = res.interpretation;
        model = res.model;
      } catch (err) {
        const fallback = err instanceof ApiError && err.aiFallback;
        if (text && (fallback || !(err instanceof ApiError))) {
          // Basic mode: the same pipeline, fed by the on-device parser (PRD §51–52).
          interpretation = parseMealText(text, await loadFoodDb(), {
            defaultMealType: input.mealTypeHint,
          });
          basicMode = true;
          model = 'on-device';
        } else {
          setSheet((s) => ({
            ...s,
            status: 'error',
            message:
              err instanceof ApiError && err.code === 'network'
                ? 'Photos need a connection. Describe the meal in a sentence instead?'
                : err instanceof ApiError
                  ? err.message
                  : 'Couldn’t analyze that. Describe it in a sentence instead?',
          }));
          return;
        }
      }
      if (interpretation.status === 'unclear_image') {
        setSheet((s) => ({ ...s, status: 'unclear_image' }));
        return;
      }
      const drafts = await toDrafts(interpretation, input.inputType, input.mealTypeHint);
      if (interpretation.status === 'not_food' || drafts.every((d) => d.items.length === 0)) {
        setSheet((s) => ({ ...s, status: 'not_food' }));
        return;
      }
      setSheet((s) => ({
        ...s,
        status: 'ready',
        drafts,
        originals: drafts.flatMap((d) => d.items),
        model,
        basicMode,
        question: interpretation.clarifyingQuestion,
      }));
    },
    [opts.profile, opts.memoryList, opts.templates, toDrafts],
  );

  /** Manual entry: open the sheet with items the user picked themselves. */
  const startManual = useCallback(
    (items: FoodItem[]) => {
      const mealType = mealTypeForHour(hourNow(opts.profile.timezone));
      setSheet({
        ...CLOSED,
        status: 'ready',
        inputType: 'manual',
        drafts: [{ mealType, items }],
        originals: [],
      });
    },
    [opts.profile.timezone],
  );

  const offerTemplate = useCallback(
    async (saved: SavedEntry) => {
      const candidate = await templateCandidateFor(opts.uid, saved, opts.templates);
      if (!candidate) return;
      toast({
        message: `You’ve had this ${candidate.mealType} a few times. Save it for one-tap logging?`,
        tone: 'info',
        action: {
          label: 'Save',
          onClick: () => {
            saveTemplate(opts.uid, candidate);
            toast({ message: `Saved as “${candidate.label}”.` });
          },
        },
        durationMs: 9000,
      });
    },
    [opts.uid, opts.templates, toast],
  );

  const announce = useCallback(
    (saved: SavedEntry[], verb = 'Logged') => {
      const kcal = saved.reduce((s, e) => s + e.entry.totals.nutrition.kcal, 0);
      toast({
        message: `${verb} · ${approxKcal(kcal)} kcal`,
        action: {
          label: 'Undo',
          onClick: () => saved.forEach((e) => deleteEntry(opts.uid, e.id)),
        },
      });
    },
    [opts.uid, toast],
  );

  const confirm = useCallback(
    (drafts: MealDraft[]) => {
      const saved = saveMeals({
        uid: opts.uid,
        date: opts.date ?? todayKey(opts.profile.timezone),
        drafts,
        originalItems: sheet.originals,
        inputType: sheet.inputType,
        rawInput: sheet.rawInput,
        thumb: sheet.photo?.thumbDataUrl,
        aiModel: sheet.model,
        memory: opts.memory,
      });
      setSheet(CLOSED);
      announce(saved);
      navigate('/');
      const first = saved[0];
      if (first) void offerTemplate(first);
    },
    [
      opts.uid,
      opts.date,
      opts.profile.timezone,
      opts.memory,
      sheet,
      announce,
      navigate,
      offerTemplate,
    ],
  );

  /** One tap: usual meal or frequent food, saved immediately with undo (no AI call). */
  const quickAdd = useCallback(
    async (kind: 'template' | 'food', id: string) => {
      const mealType = mealTypeForHour(hourNow(opts.profile.timezone));
      let items: FoodItem[];
      let templateId: string | undefined;
      if (kind === 'template') {
        const t = opts.templates.find((x) => x.id === id);
        if (!t) return;
        items = cloneTemplateItems(t);
        templateId = t.id;
        touchTemplate(opts.uid, t.id, t.count);
      } else {
        const m = opts.memory.get(id);
        if (!m) return;
        items = [buildItemFromMemory(m, await loadFoodDb())];
      }
      const saved = saveMeals({
        uid: opts.uid,
        date: opts.date ?? todayKey(opts.profile.timezone),
        drafts: [{ mealType, items }],
        originalItems: [],
        inputType: 'quick',
        memory: opts.memory,
        templateId,
      });
      announce(saved, 'Added');
    },
    [opts.uid, opts.date, opts.profile.timezone, opts.templates, opts.memory, announce],
  );

  return { sheet, setSheet, analyze, startManual, confirm, quickAdd, close };
}
