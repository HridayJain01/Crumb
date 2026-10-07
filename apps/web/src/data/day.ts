import { setDoc } from 'firebase/firestore';
import { useEffect, useMemo } from 'react';
import {
  summarizeDay,
  summaryIsStale,
  type ActivityWithId,
  type DailySummary,
  type FoodEntryWithId,
  type Profile,
} from '@crumb/core';
import { queries, refs, useLiveDoc, useLiveQuery } from './hooks';

/*
 * One day's data. The stored `days/{date}` summary is a cache that the client keeps
 * correct: whenever entries/activities change (here, on another device, or via a
 * server-side sync), it is recomputed with the shared engine and rewritten if stale.
 */
export function useDay(uid: string, date: string, profile: Profile) {
  const entries = useLiveQuery<FoodEntryWithId>(
    queries.entriesOn(uid, date),
    `entries:${uid}:${date}`,
  );
  const activities = useLiveQuery<ActivityWithId>(
    queries.activitiesOn(uid, date),
    `acts:${uid}:${date}`,
  );
  const stored = useLiveDoc<DailySummary | undefined>(refs.day(uid, date), undefined);

  const summary = useMemo(
    () =>
      summarizeDay({
        date,
        entries: entries.data,
        activities: activities.data,
        profile,
      }),
    [date, entries.data, activities.data, profile],
  );

  const loading = entries.loading || activities.loading;
  useEffect(() => {
    if (loading || stored.loading) return;
    const empty = entries.data.length === 0 && activities.data.length === 0;
    if (empty && !stored.data) return;
    if (summaryIsStale(stored.data, summary)) {
      void setDoc(refs.day(uid, date), summary).catch(() => undefined);
    }
  }, [
    loading,
    stored.loading,
    stored.data,
    summary,
    uid,
    date,
    entries.data.length,
    activities.data.length,
  ]);

  return {
    loading,
    entries: entries.data,
    activities: activities.data,
    summary,
  };
}

/** Day summaries for a date range (insights, streaks, recent averages). */
export function useDays(uid: string, from: string, to: string) {
  return useLiveQuery<DailySummary>(
    queries.daysBetween(uid, from, to),
    `days:${uid}:${from}:${to}`,
  );
}
