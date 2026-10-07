import type { FoodDb } from '@crumb/core';

/* The bundled food table is loaded lazily (own chunk, precached by the service worker). */

let promise: Promise<FoodDb> | null = null;

export function loadFoodDb(): Promise<FoodDb> {
  promise ??= import('@crumb/core/foods').then((m) => m.getFoodDb());
  return promise;
}
