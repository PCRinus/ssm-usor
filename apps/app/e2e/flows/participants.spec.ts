import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  addressOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createOrganization,
  emailsTo,
  signIn,
} from './support';

test.afterAll(cleanUp);

test('a member invites an employee to the portal by email and revokes the invitation', async ({
  page,
}) => {
  const owner = await createAccount('participants', 'Dan MARIN');
  const organizationId = await createOrganization('Participanți E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT PORTAL E2E S.R.L.');
  const email = addressOf('angajat-portal');
  const token = await accessTokenOf(owner.email);
  const created = await fetch(new URL(`/clients/${clientId}/employees`, process.env.E2E_API_URL), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lastName: 'Portalu',
      firstName: 'Ion',
      jobTitle: 'Barista',
      hiredAt: '2024-02-15',
      email,
    }),
  });
  expect(created.status).toBe(201);
  const { employee } = (await created.json()) as { employee: { id: string } };

  await signIn(page, owner.email, `/clienti/${clientId}/angajati/${employee.id}`);
  const card = page.getByTestId('employee-portal-card');
  await expect(card.getByTestId('participant-none')).toContainText(email);

  await card.getByTestId('participant-invite').click();
  const dialog = page.getByTestId('participant-invite-dialog');
  await expect(dialog.getByRole('radio')).toHaveCount(1);
  await expect(dialog.getByRole('radio')).toBeChecked();
  await dialog.getByTestId('participant-invite-submit').click();
  await expect(dialog).toBeHidden();
  await expect(card.getByTestId('participant-invitation-text')).toContainText(
    `Invitat pe ${email} prin email la`
  );
  await expect(card.getByTestId('participant-invitation-resend')).toBeDisabled();
  await expect(card.getByTestId('participant-invitation-hint')).toContainText(
    'Poți retrimite după ora'
  );
  expect(await emailsTo(email, 'participant-invitation')).toHaveLength(1);

  await page.goto(`/clienti/${clientId}/angajati`);
  await page.getByTestId('client-section').filter({ hasText: 'Portal' }).click();
  await expect(page).toHaveURL(new RegExp(`/clienti/${clientId}/portal$`));
  await expect(page.getByTestId('portal-getting-started')).toBeVisible();
  await expect(page.getByTestId('client-signature-requests')).toBeHidden();
  const roster = page.getByTestId('portal-roster');
  const row = roster.getByTestId('portal-roster-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Portalu Ion');
  await expect(row).toContainText(email);
  await expect(row.getByTestId('portal-access-state')).toHaveText('Invitat');
  await expect(roster.getByTestId('portal-roster-count')).toHaveText(
    'Niciunul cu acces, din 1 lucrător'
  );

  await row.getByTestId('portal-access-menu').click();
  await page.getByTestId('portal-access-menu-revoke').click();
  await page.getByTestId('participant-invitation-revoke-dialog-confirm').click();
  await expect(row.getByTestId('portal-access-state')).toHaveText('Acces revocat');
  await expect(row.getByTestId('portal-roster-invite')).toBeVisible();

  await page.goto(`/clienti/${clientId}/angajati/${employee.id}`);
  await expect(card.getByTestId('participant-none')).toBeVisible();
  await expect(card.getByTestId('participant-invite')).toBeVisible();
});
