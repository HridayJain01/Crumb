import { localHour, toDateKey } from '@crumb/core';

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export function todayKey(tz = deviceTimeZone()): string {
  return toDateKey(new Date(), tz);
}

export function hourNow(tz = deviceTimeZone()): number {
  return localHour(new Date(), tz);
}

/** "2026-10-07T13:20" local wall-clock time for the AI prompt. */
export function localTimeString(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function dayTitle(key: string, today: string): string {
  if (key === today) return 'Today';
  const d = new Date(`${key}T00:00:00Z`);
  const t = new Date(`${today}T00:00:00Z`);
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "Mon" for a YYYY-MM-DD key. */
export function weekdayShort(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short',
    timeZone: 'UTC',
  });
}
