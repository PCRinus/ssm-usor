import { expect, type Page, test } from '@playwright/test';

import { cleanUp, createAccount, createOrganization, forgetGuides, signIn } from './support';

test.afterAll(cleanUp);

async function newMember(name: string) {
  const member = await createAccount(name, 'Ana Tur');
  await createOrganization(`Tur E2E ${name}`, member.id);
  await forgetGuides(member.id);
  return member;
}

const tooltip = (page: Page) => page.getByTestId('guide-tooltip');

const guideRecorded = (page: Page) =>
  page.waitForResponse(
    (response) =>
      response.url().endsWith('/me/guides/welcome') && response.request().method() === 'PUT'
  );

async function expectStep(page: Page, step: number, title: string) {
  await expect(tooltip(page).getByTestId('guide-progress')).toHaveText(`${step} din 4`);
  await expect(tooltip(page).getByRole('heading', { name: title })).toBeVisible();
}

test('the welcome tour shows once, a skip holds across a reload, and Setări starts it again', async ({
  page,
}) => {
  const member = await newMember('tour');

  await signIn(page, member.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectStep(page, 1, 'Bun venit în SSM Ușor');
  await expect(tooltip(page).getByTestId('guide-back')).toHaveCount(0);

  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 2, 'Clienții tăi');
  await tooltip(page).getByTestId('guide-back').click();
  await expectStep(page, 1, 'Bun venit în SSM Ușor');
  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 2, 'Clienții tăi');

  const recorded = guideRecorded(page);
  await tooltip(page).getByTestId('guide-skip').click();
  await expect(tooltip(page)).toBeHidden();
  expect((await recorded).status()).toBe(200);

  await page.reload();
  await expect(page.getByTestId('dashboard-todo')).toBeVisible();
  await expect(tooltip(page)).toBeHidden();

  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-settings').click();
  await expect(page).toHaveURL(/\/setari$/);
  await expect(page.getByTestId('guide-welcome-status')).toHaveText('Sărit');

  await page.getByTestId('guide-welcome-replay').click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectStep(page, 1, 'Bun venit în SSM Ușor');
  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 2, 'Clienții tăi');
  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 3, 'Ce ai de făcut');
  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 4, 'Setări și noutăți');
  await expect(tooltip(page).getByTestId('guide-next')).toHaveText('Gata');
  const completed = guideRecorded(page);
  await tooltip(page).getByTestId('guide-next').click();
  await expect(tooltip(page)).toBeHidden();
  expect((await completed).status()).toBe(200);

  await page.goto('/setari');
  await expect(page.getByTestId('guide-welcome-status')).toHaveText('Finalizat');
  await page.goto('/dashboard');
  await expect(page.getByTestId('dashboard-todo')).toBeVisible();
  await expect(tooltip(page)).toBeHidden();
});

test('on a phone the tour points at the menu button, and Escape skips it', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const member = await newMember('tour-phone');

  await signIn(page, member.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expectStep(page, 1, 'Bun venit în SSM Ușor');
  await tooltip(page).getByTestId('guide-next').click();
  await expectStep(page, 2, 'Clienții tăi');
  const tip = await tooltip(page).boundingBox();
  expect(tip!.x).toBeGreaterThanOrEqual(0);
  expect(tip!.x + tip!.width).toBeLessThanOrEqual(360);

  const skipped = guideRecorded(page);
  await page.keyboard.press('Escape');
  await expect(tooltip(page)).toBeHidden();
  expect((await skipped).status()).toBe(200);
  await page.reload();
  await expect(page.getByTestId('dashboard-todo')).toBeVisible();
  await expect(tooltip(page)).toBeHidden();
});
