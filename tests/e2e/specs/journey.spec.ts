import { expect, test } from './fixtures';
import { currentUid, describeMeal, onboard, serverDocs, zoneForLocalHour } from './helpers';

// 5 pm local: afternoon rules apply and the day is still "in progress".
test.use({ timezoneId: zoneForLocalHour(17) });

const DEMO_MEAL = 'I had milk, two bananas, three rotis, paneer sabzi and dal';

test('the PRD demo: log, move, get a nudge, plan a walk, keep going offline', async ({
  page,
  context,
}) => {
  await test.step('onboard as a guest in about 30 seconds', async () => {
    await onboard(page);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  });

  let sheetProtein = 0;
  let sheetRange = '';
  await test.step('one sentence becomes a reviewed, itemised meal', async () => {
    await describeMeal(page, DEMO_MEAL);
    const sheet = page.getByRole('dialog');
    for (const food of [/milk/i, /banana/i, /roti/i, /paneer/i, /dal/i]) {
      await expect(sheet.getByText(food).first()).toBeVisible();
    }
    const total = await sheet.getByText(/kcal · \d+ g protein/).innerText();
    const match = /~([\d,–]+) kcal · (\d+) g protein/.exec(total);
    expect(match).not.toBeNull();
    sheetRange = match![1]!;
    sheetProtein = Number(match![2]);
    await page.getByRole('button', { name: /Looks right/ }).click();
    await expect(page.getByText(/Logged · ~[\d,]+ kcal/)).toBeVisible();
  });

  await test.step('home totals are the same deterministic sums as the review sheet', async () => {
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText(`Range ~${sheetRange} kcal`)).toBeVisible();
    await expect(page.getByText(`${sheetProtein} / ~130 g`, { exact: true })).toBeVisible();
  });

  await test.step('adding steps updates the energy picture', async () => {
    const energy = page.getByRole('button', { name: /Energy picture/ });
    const burnBefore = Number(
      /~([\d,]+) estimated burn/.exec(await energy.innerText())![1]!.replace(/,/g, ''),
    );
    await page.getByRole('button', { name: /Steps today/ }).click();
    await page.getByRole('textbox', { name: 'Steps today' }).fill('6200');
    await page.getByRole('button', { name: 'Save steps' }).click();
    await expect(page.getByText('6,200', { exact: true })).toBeVisible();
    await expect
      .poll(async () =>
        Number(/~([\d,]+) estimated burn/.exec(await energy.innerText())![1]!.replace(/,/g, '')),
      )
      .toBeGreaterThan(burnBefore);
    await expect(energy).toContainText('In progress');
  });

  await test.step('a protein-gap nudge suggests diet-appropriate foods', async () => {
    await expect(page.getByText(/About \d+ g protein to go/)).toBeVisible();
  });

  await test.step('the walk planner maps a loop with safety notes', async () => {
    await page.getByRole('link', { name: 'Insights' }).click();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: /Find routes near me/ }).click();
    const maps = page.getByRole('link', { name: /Open in Google Maps/ }).first();
    await expect(maps).toHaveAttribute('href', /google\.com\/maps\/dir\/.*travelmode=walking/);
    await expect(
      page.getByText('Check the route and local conditions before walking.'),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  });

  await test.step('repeated foods become one-tap quick adds', async () => {
    for (let i = 0; i < 2; i++) {
      await describeMeal(page, '2 idlis and sambar');
      await page.getByRole('button', { name: /Looks right/ }).click();
      await expect(page).toHaveURL(/\/$/);
    }
    await page.getByRole('link', { name: 'Log' }).click();
    await expect(page.getByRole('button', { name: /Idli/ })).toBeVisible();
  });

  const uid = await currentUid(page);

  await test.step('offline: quick add and basic-mode logging still work', async () => {
    await context.setOffline(true);
    await page.getByRole('button', { name: /Idli/ }).click();
    await expect(page.getByText(/Added · ~[\d,]+ kcal/)).toBeVisible();

    await page.getByLabel('Describe your meal').fill('2 idlis and sambar');
    await page.getByRole('button', { name: 'Analyze' }).click();
    await expect(page.getByText(/The AI is taking a break/)).toBeVisible();
    await page.getByRole('button', { name: /Looks right/ }).click();

    // Third time in two weeks: offer to save it as a usual meal.
    await expect(page.getByText(/You’ve had this snack a few times/)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved as “Your usual snack”.')).toBeVisible();
  });

  await test.step('back online, everything syncs to the server', async () => {
    await context.setOffline(false);
    await expect
      .poll(async () => (await serverDocs(page, `users/${uid}/entries`)).length, {
        timeout: 20_000,
      })
      .toBe(5);
    await expect
      .poll(async () => (await serverDocs(page, `users/${uid}/meals`)).length, { timeout: 20_000 })
      .toBe(1);
  });

  await test.step('the usual meal logs in one tap', async () => {
    await page.getByRole('link', { name: 'Log' }).click();
    await page.getByRole('button', { name: /Your usual snack/ }).click();
    await expect(page.getByText(/Added · ~[\d,]+ kcal/)).toBeVisible();
    await expect
      .poll(async () => (await serverDocs(page, `users/${uid}/entries`)).length, {
        timeout: 20_000,
      })
      .toBe(6);
  });
});
