import { useMemo } from 'react';
import type { FoodMemory, MealTemplate, MealTemplateWithId } from '@crumb/core';
import { queries, useLiveQuery } from './hooks';

export function useMemory(uid: string) {
  const { data, loading } = useLiveQuery<FoodMemory>(queries.memory(uid), `memory:${uid}`);
  const map = useMemo(() => new Map(data.map((m) => [m.key, m as FoodMemory])), [data]);
  return { list: data as FoodMemory[], map, loading };
}

export function useTemplates(uid: string) {
  const { data, loading } = useLiveQuery<MealTemplate>(queries.meals(uid), `meals:${uid}`);
  return { templates: data as MealTemplateWithId[], loading };
}
