import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createOrganization,
  createReleaseUnreadOnlyFor,
  signIn,
} from './support';

test.afterAll(cleanUp);

// A local stack seeded with invented releases shows one of those in the dialog, a bare one
// the release made here, so the dialog is checked for opening and closing, not for its text.
test('an unread release opens the dialog once per session and is marked read from the list', async ({
  page,
}) => {
  const member = await createAccount('updates', 'Ana Actualizări');
  await createOrganization('Actualizări E2E', member.id);
  const headline = 'Versiune de test E2E';
  await createReleaseUnreadOnlyFor(member.id, headline);

  await signIn(page, member.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  const dialog = page.getByTestId('update-dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('nav-actualizari-badge')).toBeVisible();

  await dialog.getByRole('button', { name: 'Închide' }).click();
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect(page.getByTestId('nav-actualizari-badge')).toBeVisible();
  await expect(dialog).toBeHidden();

  await page.getByTestId('nav-actualizari').click();
  await expect(page).toHaveURL(/\/actualizari$/);
  const card = page.getByTestId('release-card').filter({ hasText: headline });
  await expect(card.getByText('Necitită')).toBeVisible();
  await page.getByTestId('updates-acknowledge-all').click();
  await expect(page.getByText('Necitită')).toHaveCount(0);
  await expect(page.getByTestId('nav-actualizari-badge')).toBeHidden();

  await card.click();
  await expect(page.getByRole('heading', { level: 1, name: headline })).toBeVisible();
  await expect(page.getByText('O funcție nouă')).toBeVisible();
});
