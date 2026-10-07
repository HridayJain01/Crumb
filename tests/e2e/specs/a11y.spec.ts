import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { completeOnboarding, describeMeal, zoneForLocalHour } from './helpers';

// Reduced motion lets entrance animations settle, so contrast is measured on the final UI.
test.use({ timezoneId: zoneForLocalHour(17), reducedMotion: 'reduce' });

/** WCAG 2.1 AA checks; serious and critical issues fail the build. */
async function audit(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      screen: name,
      rule: v.id,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  const minor = violations.filter((v) => v.impact === 'minor' || v.impact === 'moderate');
  if (minor.length) {
    test.info().annotations.push({
      type: 'a11y-minor',
      description: `${name}: ${minor.map((v) => v.id).join(', ')}`,
    });
  }
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test('every main screen meets WCAG 2.1 AA (axe)', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Try it first/ })).toBeVisible();
  await audit(page, 'welcome');

  await page.getByRole('button', { name: /Try it first/ }).click();
  await expect(page.getByLabel('Age')).toBeVisible();
  await audit(page, 'onboarding');
  await completeOnboarding(page);
  await describeMeal(page, 'two rotis, aloo sabzi and a bowl of dal');
  await audit(page, 'review sheet');
  await page.getByRole('button', { name: /Looks right/ }).click();
  await expect(page.getByText(/Logged · ~[\d,]+ kcal/)).toBeVisible();
  await audit(page, 'home');

  await page.getByRole('link', { name: 'Log' }).click();
  await expect(page.getByLabel('Describe your meal')).toBeVisible();
  await audit(page, 'log');

  await page.getByRole('link', { name: 'Insights' }).click();
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();
  await audit(page, 'insights');

  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByRole('heading', { name: 'Daily targets' })).toBeVisible();
  await audit(page, 'profile');
});
