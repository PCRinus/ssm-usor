import { expect, test } from '@playwright/test';

import {
  addressOf,
  cleanUp,
  createAccount,
  createOrganization,
  emailedLink,
  password,
  signIn,
  signOut,
} from './support';

test.afterAll(cleanUp);

test('an owner invites a person, who creates an account, joins, and is then managed', async ({
  page,
  browser,
}) => {
  const owner = await createAccount('owner', 'Olga Owner');
  await createOrganization('Protect SSM E2E', owner.id);
  const invitee = addressOf('invitee');

  // The owner invites from the organization page.
  await signIn(page, owner.email);
  await page.getByTestId('nav-organization').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Protect SSM E2E');
  await expect(page.getByTestId('account-organization')).toHaveText('Protect SSM E2E');
  await page.getByTestId('invite-open').click();
  await page.getByTestId('invite-email').fill(invitee);
  await page.getByTestId('invite-submit').click();
  await expect(page.getByText(`Invitația a fost trimisă la ${invitee}.`)).toBeVisible();
  await expect(page.getByTestId('invitation-row')).toContainText(invitee);

  // Inviting the same address again right away is refused next to the field.
  await page.getByTestId('invite-open').click();
  await page.getByTestId('invite-email').fill(invitee);
  await page.getByTestId('invite-submit').click();
  await expect(page.getByTestId('invite-email-error')).toContainText('în ultimele 10 minute');
  await page.keyboard.press('Escape');

  // The invited person opens the emailed link in a browser of their own.
  const link = await emailedLink(invitee, 'invitation');
  expect(new URL(link).pathname).toBe('/accept-invitation');
  const theirs = await browser.newContext();
  const guest = await theirs.newPage();
  await guest.goto(link);
  await expect(guest.getByTestId('accept-invitation-page')).toContainText('Olga Owner te invită');
  await expect(guest.getByTestId('accept-email')).toHaveValue(invitee);
  await guest.getByTestId('accept-full-name').fill('Ion Invitat');
  await guest.getByTestId('accept-password').fill(password);
  await guest.getByTestId('accept-submit').click();

  // They land in the app, signed in, as a specialist of the organization.
  await expect(guest).toHaveURL(/\/dashboard$/);
  await expect(guest.getByTestId('account-name')).toHaveText('Ion Invitat');
  await guest.getByTestId('nav-organization').click();
  await expect(guest.getByTestId('member-row')).toHaveCount(2);
  await expect(guest.getByTestId('invite-open')).toHaveCount(0);
  await expect(guest.getByTestId('member-actions')).toHaveCount(0);

  // The link works once.
  const again = await (await browser.newContext()).newPage();
  await again.goto(link);
  await expect(
    again.getByRole('heading', { name: 'Invitația a fost deja acceptată' })
  ).toBeVisible();

  // The owner sees the new member, promotes them, then removes them.
  await page.reload();
  const row = page.getByTestId('member-row').filter({ hasText: 'Ion Invitat' });
  await expect(row).toContainText('Specialist');
  await expect(page.getByTestId('invitations-empty')).toBeVisible();
  await row.getByTestId('member-actions').click();
  await page.getByTestId('member-switch-role').click();
  await expect(row).toContainText('Administrator');

  await row.getByTestId('member-actions').click();
  await page.getByTestId('member-remove').click();
  await page.getByTestId('member-remove-confirm').click();
  await expect(page.getByTestId('member-row')).toHaveCount(1);

  // The removed person keeps their account but has no organization any more.
  await guest.reload();
  await expect(guest.getByTestId('organization-none')).toBeVisible();

  await signOut(page);
});

test('a person who already has an account signs in to accept', async ({ page, browser }) => {
  const owner = await createAccount('owner-two', 'Oana Owner');
  await createOrganization('Al Doilea SSM E2E', owner.id);
  const existing = await createAccount('existing', 'Elena Existentă');

  await signIn(page, owner.email);
  await page.getByTestId('nav-organization').click();
  await page.getByTestId('invite-open').click();
  await page.getByTestId('invite-email').fill(existing.email);
  await page.getByTestId('invite-role').selectOption('owner');
  await page.getByTestId('invite-submit').click();
  await expect(page.getByTestId('invitation-row')).toContainText(existing.email);

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(await emailedLink(existing.email, 'invitation'));
  await expect(guest.getByTestId('accept-has-account')).toBeVisible();
  await guest.getByTestId('accept-login').click();

  // Login brings them back to the invitation, where one click accepts.
  await guest.getByTestId('login-email').fill(existing.email);
  await guest.getByTestId('login-password').fill(password);
  await guest.getByTestId('login-submit').click();
  await expect(guest).toHaveURL(/\/accept-invitation\?token=/);
  await guest.getByTestId('accept-join').click();

  await expect(guest).toHaveURL(/\/organization$/);
  await expect(guest.getByRole('heading', { level: 1 })).toHaveText('Al Doilea SSM E2E');
  await expect(guest.getByTestId('invite-open')).toBeVisible();
});
