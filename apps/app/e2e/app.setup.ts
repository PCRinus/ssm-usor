import { expect, test } from '@playwright/test';

test('application domain is reachable before browser checks', async ({ page }) => {
  // A successful Worker upload can precede DNS and certificate availability.
  // Probe with Chromium, which is also the client used by the dependent tests.
  await expect(async () => {
    const response = await page.goto('/login', {
      waitUntil: 'domcontentloaded',
      timeout: 10_000,
    });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
  }).toPass({ timeout: 300_000, intervals: [5_000, 10_000] });
});
