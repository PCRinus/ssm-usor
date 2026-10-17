import { expect, test } from '@playwright/test';

test('portal domain is reachable before browser checks', async ({ page }) => {
  // A successful Worker upload can precede DNS and certificate availability.
  await expect(async () => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 10_000 });
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
  }).toPass({ timeout: 300_000, intervals: [5_000, 10_000] });
});
