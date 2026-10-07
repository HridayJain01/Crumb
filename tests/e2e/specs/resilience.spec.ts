import { expect, test } from './fixtures';
import {
  currentUid,
  describeMeal,
  onboard,
  samplePhoto,
  serverDocs,
  zoneForLocalHour,
} from './helpers';

test.use({ timezoneId: zoneForLocalHour(13) });

test('when the AI is down, logging falls back to basic mode instead of failing', async ({
  page,
}) => {
  await onboard(page);
  await page.route('**/api/meals/interpret', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'ai_unavailable', message: 'AI is resting' } }),
    }),
  );
  await describeMeal(page, 'two rotis and a bowl of dal');
  await expect(page.getByText(/The AI is taking a break/)).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Rotis')).toBeVisible();
  await page.getByRole('button', { name: /Looks right/ }).click();
  await expect(page.getByText(/Logged · ~[\d,]+ kcal/)).toBeVisible();
});

test('a photo becomes an editable plate with confidence labels and a tiny thumbnail', async ({
  page,
}) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Log' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'lunch.jpg',
    mimeType: 'image/jpeg',
    buffer: await samplePhoto(page),
  });
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: /Looks right/ })).toBeVisible();
  await expect(sheet.getByText('Paneer sabzi')).toBeVisible();
  await expect(sheet.getByTitle(/(High|Medium|Low) confidence/).first()).toBeVisible();

  // Edit before saving: one more roti, with the stepper (no keyboard needed).
  const total = sheet.getByText(/kcal · \d+ g protein/);
  const before = await total.innerText();
  await sheet.getByRole('button', { name: /^More/ }).first().click();
  await expect(total).not.toHaveText(before);
  await sheet.getByRole('button', { name: /Looks right/ }).click();

  await expect(page.getByText(/Logged · ~[\d,]+ kcal/)).toBeVisible();
  const uid = await currentUid(page);
  await expect
    .poll(async () => {
      const [entry] = await serverDocs(page, `users/${uid}/entries`);
      const fields = (entry as { fields?: Record<string, { stringValue?: string }> })?.fields;
      return fields?.thumb?.stringValue?.startsWith('data:image/jpeg') ?? false;
    })
    .toBe(true);
});

test('delete everything removes the account and all of its data', async ({ page }) => {
  await onboard(page);
  await describeMeal(page, 'a glass of milk');
  await page.getByRole('button', { name: /Looks right/ }).click();
  const uid = await currentUid(page);
  await expect.poll(async () => (await serverDocs(page, `users/${uid}/entries`)).length).toBe(1);

  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  const confirm = page.getByRole('button', { name: 'Delete my data' });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/Type delete to confirm/).fill('delete');
  await confirm.click();

  await expect(page).toHaveURL(/\/welcome/);
  await expect.poll(async () => (await serverDocs(page, `users/${uid}/entries`)).length).toBe(0);
});

test('guests are warned before signing out loses their journal', async ({ page }) => {
  await onboard(page);
  await page.getByRole('link', { name: 'Profile' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByText('Sign out of the guest account?')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out anyway' }).click();
  await expect(page).toHaveURL(/\/welcome/);
});
