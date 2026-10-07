import { setDoc } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { InsightContext, InsightResponse } from '@crumb/core';
import { api } from '../../lib/api';
import { refs, useLiveDoc } from '../../data/hooks';

interface CachedInsight extends InsightResponse {
  stateHash: string;
  calls: number;
  date: string;
}

const MAX_AI_CALLS_PER_DAY = 6;

/** Coarse fingerprint so small changes don't trigger new AI wording (saves quota). */
export function insightHash(ctx: InsightContext): string {
  const t = ctx.today;
  return [
    Math.round(t.kcal / 100),
    Math.round(t.proteinG / 5),
    Math.round(t.steps / 1000),
    t.mealsLogged,
    ctx.chosenAction.kind,
    Math.floor(ctx.localHour / 4),
  ].join('|');
}

/**
 * Daily insight wording: cached in Firestore per day, refreshed only when the coarse state
 * changes, at most 6 AI calls/day. Falls back to the deterministic template immediately.
 */
export function useInsight(
  uid: string,
  date: string,
  context: InsightContext,
  fallback: InsightResponse,
) {
  const cached = useLiveDoc<CachedInsight | null>(refs.insight(uid, date), null);
  const hash = useMemo(() => insightHash(context), [context]);
  const [inflight, setInflight] = useState(false);
  const lastRequested = useRef<string | null>(null);

  useEffect(() => {
    if (cached.loading || inflight) return;
    const c = cached.data;
    if (c?.stateHash === hash) return;
    if ((c?.calls ?? 0) >= MAX_AI_CALLS_PER_DAY || !navigator.onLine) return;
    if (lastRequested.current === hash) return;
    lastRequested.current = hash;
    setInflight(true);
    api
      .insight({ kind: 'daily', context })
      .then((res) =>
        setDoc(refs.insight(uid, date), {
          ...res,
          stateHash: hash,
          calls: (c?.calls ?? 0) + 1,
          date,
        } satisfies CachedInsight),
      )
      .catch(() => undefined)
      .finally(() => setInflight(false));
  }, [cached.loading, cached.data, hash, inflight, context, uid, date]);

  const current = cached.data?.stateHash === hash ? cached.data : null;
  return { insight: current ?? fallback, loading: inflight && !current };
}
