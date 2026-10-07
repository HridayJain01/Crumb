import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as qLimit,
  type DocumentData,
  type Query,
  type DocumentReference,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '../lib/db';

/*
 * Tiny realtime hooks over Firestore. With the persistent cache these resolve instantly
 * from local data and keep working offline; no extra state library needed.
 */

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export function useLiveDoc<T>(ref: DocumentReference<DocumentData> | null, fallback: T): Live<T> {
  const [state, setState] = useState<Live<T>>({
    data: fallback,
    loading: Boolean(ref),
    error: null,
  });
  const path = ref?.path ?? null;
  useEffect(() => {
    if (!ref) {
      setState({ data: fallback, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      ref,
      (snap) =>
        setState({
          data: snap.exists() ? (snap.data() as T) : fallback,
          loading: false,
          error: null,
        }),
      (error) => setState({ data: fallback, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return state;
}

export function useLiveQuery<T>(
  q: Query<DocumentData> | null,
  key: string,
): Live<(T & { id: string })[]> {
  const [state, setState] = useState<Live<(T & { id: string })[]>>({
    data: [],
    loading: Boolean(q),
    error: null,
  });
  useEffect(() => {
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => ({ ...(d.data() as T), id: d.id })),
          loading: false,
          error: null,
        }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export const refs = {
  user: (uid: string) => doc(db, 'users', uid),
  entries: (uid: string) => collection(db, 'users', uid, 'entries'),
  entry: (uid: string, id: string) => doc(db, 'users', uid, 'entries', id),
  activities: (uid: string) => collection(db, 'users', uid, 'activities'),
  activity: (uid: string, id: string) => doc(db, 'users', uid, 'activities', id),
  days: (uid: string) => collection(db, 'users', uid, 'days'),
  day: (uid: string, date: string) => doc(db, 'users', uid, 'days', date),
  memory: (uid: string) => collection(db, 'users', uid, 'memory'),
  memoryItem: (uid: string, key: string) => doc(db, 'users', uid, 'memory', key),
  meals: (uid: string) => collection(db, 'users', uid, 'meals'),
  meal: (uid: string, id: string) => doc(db, 'users', uid, 'meals', id),
  corrections: (uid: string) => collection(db, 'users', uid, 'corrections'),
  insight: (uid: string, key: string) => doc(db, 'users', uid, 'insights', key),
  integration: (uid: string, provider: string) => doc(db, 'users', uid, 'integrations', provider),
};

export const queries = {
  entriesOn: (uid: string, date: string) =>
    query(refs.entries(uid), where('date', '==', date), orderBy('loggedAt', 'asc')),
  entriesBetween: (uid: string, from: string, to: string) =>
    query(
      refs.entries(uid),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'asc'),
    ),
  activitiesOn: (uid: string, date: string) =>
    query(refs.activities(uid), where('date', '==', date), orderBy('startedAt', 'asc')),
  daysBetween: (uid: string, from: string, to: string) =>
    query(
      refs.days(uid),
      where('date', '>=', from),
      where('date', '<=', to),
      orderBy('date', 'asc'),
    ),
  memory: (uid: string) => query(refs.memory(uid), orderBy('count', 'desc'), qLimit(60)),
  meals: (uid: string) => query(refs.meals(uid), orderBy('count', 'desc'), qLimit(20)),
};
