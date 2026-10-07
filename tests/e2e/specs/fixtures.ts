import { test as base, expect } from '@playwright/test';

/*
 * Every test records the browser's errors and, when it fails, prints the URL, the visible
 * text and the recent browser log, so a CI failure can be diagnosed from the job log alone.
 */
export const test = base.extend<{ diagnostics: void }>({
  diagnostics: [
    async ({ page }, use, testInfo) => {
      const log: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') log.push(`[${m.type()}] ${m.text()}`);
      });
      page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
      page.on('requestfailed', (r) =>
        log.push(`[requestfailed] ${r.url().slice(0, 160)} ${r.failure()?.errorText ?? ''}`),
      );
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        const text = await page
          .evaluate(() => document.body.innerText.replace(/\s+\n/g, '\n').slice(0, 1200))
          .catch(() => '(page unavailable)');
        console.log(
          [
            `--- diagnostics: ${testInfo.title}`,
            `URL: ${page.url()}`,
            `Visible text:\n${text}`,
            `Browser log (last 30):\n${log.slice(-30).join('\n') || '(none)'}`,
            '---',
          ].join('\n'),
        );
      }
    },
    { auto: true },
  ],
});

export { expect };
