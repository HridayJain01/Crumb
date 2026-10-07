import { expect, type Page } from '@playwright/test';

export const FIRESTORE =
  'http://127.0.0.1:8080/v1/projects/demo-crumb/databases/(default)/documents';

/**
 * An IANA zone where the local time is currently `hour`:xx, so time-of-day rules (meal type,
 * afternoon protein nudges, "day in progress") are deterministic whenever the suite runs.
 * Etc/GMT zones have inverted signs: Etc/GMT-5 is UTC+5.
 */
export function zoneForLocalHour(hour: number): string {
  let offset = hour - new Date().getUTCHours();
  if (offset > 14) offset -= 24;
  if (offset < -12) offset += 24;
  if (offset === 0) return 'Etc/UTC';
  return `Etc/GMT${offset > 0 ? '-' : '+'}${Math.abs(offset)}`;
}

export async function onboard(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Try it first/ }).click();
  await completeOnboarding(page);
}

/** Fills the one-screen onboarding form (the guest is already signed in). */
export async function completeOnboarding(page: Page) {
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel('Age').fill('23');
  await page.getByRole('radio', { name: 'Male', exact: true }).click();
  await page.getByLabel('Height').fill('175');
  await page.getByLabel('Weight').fill('72');
  await page.getByRole('button', { name: /Moderately active/ }).click();
  await page.getByRole('button', { name: /Build muscle/ }).click();
  await page.getByRole('button', { name: 'Start my journal' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Types a meal on the Log screen and waits for the review sheet. */
export async function describeMeal(page: Page, text: string) {
  await page.getByRole('link', { name: 'Log' }).click();
  await page.getByLabel('Describe your meal').fill(text);
  await page.getByRole('button', { name: 'Analyze' }).click();
  await expect(page.getByRole('button', { name: /Looks right/ })).toBeVisible();
}

/** The signed-in Firebase user, read from the SDK's IndexedDB persistence. */
export function currentUid(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const read = open.result
            .transaction('firebaseLocalStorage', 'readonly')
            .objectStore('firebaseLocalStorage')
            .getAll();
          read.onerror = () => reject(read.error);
          read.onsuccess = () => {
            const rows = read.result as { value?: { uid?: string } }[];
            const uid = rows.find((r) => r.value?.uid)?.value?.uid;
            if (uid) resolve(uid);
            else reject(new Error('No signed-in user'));
          };
        };
      }),
  );
}

/** Documents the server actually has (emulator admin access), to prove offline writes synced. */
export async function serverDocs(page: Page, path: string): Promise<Record<string, unknown>[]> {
  const res = await page.request.get(`${FIRESTORE}/${path}?pageSize=100`, {
    headers: { Authorization: 'Bearer owner' },
  });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as { documents?: Record<string, unknown>[] };
  return body.documents ?? [];
}

/** A small JPEG drawn by the browser itself, so photo tests need no fixture files. */
export async function samplePhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f4e2c4';
    ctx.fillRect(0, 0, 320, 240);
    ctx.fillStyle = '#c8873a';
    ctx.beginPath();
    ctx.arc(110, 120, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e0b030';
    ctx.beginPath();
    ctx.arc(230, 120, 45, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL('image/jpeg', 0.85);
  });
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
}
