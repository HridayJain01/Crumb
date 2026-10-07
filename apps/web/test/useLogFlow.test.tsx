import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiMealInterpretation, FoodMemory, Profile } from '@crumb/core';

vi.mock('../src/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
  db: {},
}));
vi.mock('../src/data/mutations', () => ({
  saveMeals: vi.fn(() => [{ id: 'entry-1', entry: { totals: { nutrition: { kcal: 512 } } } }]),
  deleteEntry: vi.fn(),
  saveTemplate: vi.fn(),
  templateCandidateFor: vi.fn(async () => null),
  touchTemplate: vi.fn(),
}));

const { api, ApiError } = await import('../src/lib/api');
const { saveMeals } = await import('../src/data/mutations');
const { ToastProvider } = await import('../src/components/ui/Toast');
const { useLogFlow } = await import('../src/features/log/useLogFlow');

const profile: Profile = {
  age: 23,
  sex: 'male',
  heightCm: 175,
  weightKg: 72,
  activityLevel: 'moderate',
  goal: 'gain_muscle',
  diet: 'veg',
  allergies: [],
  units: 'metric',
  timezone: 'Asia/Kolkata',
};

const opts = {
  uid: 'u1',
  profile,
  memory: new Map<string, FoodMemory>(),
  memoryList: [] as FoodMemory[],
  templates: [],
  date: '2026-10-07',
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <ToastProvider>{children}</ToastProvider>
    </MemoryRouter>
  );
}

const aiItem = {
  name: 'roti',
  canonicalName: 'whole wheat flatbread',
  quantity: 2,
  unit: 'piece' as const,
  quantityStated: true,
  estimatedGrams: 80,
  preparation: null,
  oilLevel: 'unknown' as const,
  setting: 'home' as const,
  identification: 'high' as const,
  alternatives: [],
  per100g: null,
  memoryRef: null,
};

function interpretation(over: Partial<AiMealInterpretation> = {}): AiMealInterpretation {
  return {
    status: 'ok',
    imageIssue: null,
    meals: [{ mealType: 'lunch', items: [aiItem] }],
    clarifyingQuestion: null,
    ...over,
  };
}

describe('useLogFlow', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(saveMeals).mockClear();
  });

  it('turns the AI interpretation into estimates calculated by code, not by the model', async () => {
    vi.spyOn(api, 'interpretMeal').mockResolvedValue({
      interpretation: interpretation(),
      model: 'test-model',
      latencyMs: 5,
    });
    const { result } = renderHook(() => useLogFlow(opts), { wrapper });

    await act(() => result.current.analyze({ text: 'two rotis', inputType: 'text' }));

    const { sheet } = result.current;
    expect(sheet.status).toBe('ready');
    expect(sheet.basicMode).toBe(false);
    expect(sheet.model).toBe('test-model');
    const [roti] = sheet.drafts[0]!.items;
    expect(roti).toMatchObject({
      foodId: 'roti',
      grams: 80,
      confidence: 'high',
      source: 'curated_db',
    });
    expect(roti!.range.kcal.low).toBeLessThan(roti!.nutrition.kcal);
    expect(roti!.range.kcal.high).toBeGreaterThan(roti!.nutrition.kcal);
    expect(sheet.originals).toHaveLength(1);
  });

  it('falls back to the on-device parser when the AI is unavailable', async () => {
    vi.spyOn(api, 'interpretMeal').mockRejectedValue(
      new ApiError(503, 'ai_unavailable', 'AI is resting'),
    );
    const { result } = renderHook(() => useLogFlow(opts), { wrapper });

    await act(() =>
      result.current.analyze({ text: 'two rotis and a bowl of dal', inputType: 'text' }),
    );

    const { sheet } = result.current;
    expect(sheet.status).toBe('ready');
    expect(sheet.basicMode).toBe(true);
    expect(sheet.model).toBe('on-device');
    expect(sheet.drafts.flatMap((d) => d.items.map((i) => i.foodId))).toEqual(['roti', 'dal']);
  });

  it('asks for a description when a photo cannot be sent', async () => {
    vi.spyOn(api, 'interpretMeal').mockRejectedValue(new ApiError(0, 'network', 'You’re offline.'));
    const { result } = renderHook(() => useLogFlow(opts), { wrapper });
    const photo = {
      base64: 'abc',
      mimeType: 'image/jpeg' as const,
      thumbDataUrl: 'data:,',
      previewUrl: 'blob:x',
    };

    await act(() => result.current.analyze({ photo, inputType: 'photo' }));

    expect(result.current.sheet.status).toBe('error');
    expect(result.current.sheet.message).toMatch(/Describe the meal/);
  });

  it('routes unclear photos and non-food to their own friendly states', async () => {
    const spy = vi.spyOn(api, 'interpretMeal');
    const { result } = renderHook(() => useLogFlow(opts), { wrapper });

    spy.mockResolvedValueOnce({
      interpretation: interpretation({ status: 'unclear_image', meals: [] }),
      model: 'm',
      latencyMs: 5,
    });
    await act(() => result.current.analyze({ text: 'photo', inputType: 'photo' }));
    expect(result.current.sheet.status).toBe('unclear_image');

    spy.mockResolvedValueOnce({
      interpretation: interpretation({ status: 'not_food', meals: [] }),
      model: 'm',
      latencyMs: 5,
    });
    await act(() => result.current.analyze({ text: 'my keyboard', inputType: 'text' }));
    expect(result.current.sheet.status).toBe('not_food');
  });

  it('saves the confirmed meal with an undo toast and closes the sheet', async () => {
    vi.spyOn(api, 'interpretMeal').mockResolvedValue({
      interpretation: interpretation(),
      model: 'test-model',
      latencyMs: 5,
    });
    const { result } = renderHook(() => useLogFlow(opts), { wrapper });
    await act(() => result.current.analyze({ text: 'two rotis', inputType: 'text' }));

    act(() => result.current.confirm(result.current.sheet.drafts));

    expect(saveMeals).toHaveBeenCalledWith(
      expect.objectContaining({
        uid: 'u1',
        date: '2026-10-07',
        inputType: 'text',
        rawInput: 'two rotis',
        aiModel: 'test-model',
      }),
    );
    expect(result.current.sheet.status).toBe('closed');
    expect(screen.getByText(/Logged · ~510 kcal/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });
});
