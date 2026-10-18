import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createJobPosition,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

test('a specialist records a training with signers, marks a slot on paper and voids the rest', async ({
  page,
}) => {
  const owner = await createAccount('signatures', 'Dan MARIN');
  const organizationId = await createOrganization('Semnături E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT SEMNĂTURI E2E S.R.L.');
  await createJobPosition(organizationId, clientId, 'Sudor');
  await createEmployee(organizationId, clientId, {
    lastName: 'Instruitu',
    firstName: 'Ion',
    jobTitle: 'Sudor',
  });
  const token = await accessTokenOf(owner.email);
  const listed = await fetch(new URL(`/clients/${clientId}/employees`, process.env.E2E_API_URL), {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(listed.ok).toBe(true);
  const [employee] = ((await listed.json()) as { items: { id: string }[] }).items;

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees/${employee!.id}/training/ssm`);
  await page.getByTestId('training-record').first().click();
  const dialog = page.getByTestId('training-dialog');
  await dialog.getByTestId('training-phase').selectOption('periodic');
  await expect(dialog.getByTestId('training-trainer-name')).toHaveValue('Maria Popescu');
  await expect(dialog.getByTestId('training-verifier-name')).toHaveValue('Dan MARIN');
  // The verifier is the specialist, a member; the legal representative has no account.
  await expect(dialog.getByTestId('training-verifier-signer')).toHaveValue(owner.id);
  await expect(dialog.getByTestId('training-trainer-signer')).toHaveValue('');
  await dialog.getByTestId('training-trainer-signer').selectOption(owner.id);
  await expect(dialog.locator('#training-trainer-signer-hint')).toHaveText(
    'Primește o cerere de semnare pe email sau prin SMS.'
  );
  await dialog.getByTestId('training-duration').fill('60');
  await dialog.getByTestId('training-material').fill('IPSSM art. 1–40');
  await dialog.getByTestId('training-trainer-job-title').fill('Administrator');
  await dialog.getByTestId('training-verifier-job-title').fill('Inspector SSM');
  await dialog.getByTestId('training-save').click();
  await expect(page.getByText('Instruirea a fost înregistrată.')).toBeVisible();
  await expect(dialog).toBeHidden();

  const record = page.getByTestId('training-record-item').first();
  const slotOf = (name: string) =>
    record.locator(`[data-testid="signature-slot"][data-slot="${name}"]`);
  await expect(slotOf('trainee')).toContainText('Fără semnatar');
  await expect(slotOf('trainer')).toContainText('De semnat');
  await expect(slotOf('trainer')).toContainText('Dan MARIN');
  await expect(slotOf('verifier')).toContainText('De semnat');

  await record.getByTestId('record-signatures-paper').click();
  const paper = page.getByTestId('paper-signature-dialog');
  await expect(paper.getByTestId('paper-signature-slot')).toHaveValue('trainee');
  await expect(paper.getByTestId('paper-signature-name')).toHaveValue('Instruitu Ion');
  await paper.getByTestId('paper-signature-submit').click();
  await expect(paper).toBeHidden();
  await expect(slotOf('trainee')).toContainText('Semnat pe hârtie');
  await expect(record.getByTestId('training-record-delete')).toBeDisabled();

  await page.getByTestId('nav-signatures').click();
  await expect(page).toHaveURL(/\/signatures$/);
  const group = page.getByTestId('signature-requests-client');
  await expect(group).toHaveCount(1);
  await expect(group).toContainText('S.C. CLIENT SEMNĂTURI E2E S.R.L.');
  await expect(group.getByTestId('signature-request')).toHaveCount(2);
  await expect(page.getByTestId('signature-requests-sign')).toBeDisabled();

  await page.goto(`/clients/${clientId}/trainings`);
  await expect(page.getByTestId('client-signature-requests')).toContainText(
    '2 semnături în așteptare'
  );

  await page.goto(`/clients/${clientId}/employees/${employee!.id}/training/ssm`);
  await record.getByTestId('record-signatures-void').click();
  const voiding = page.getByTestId('void-signatures-dialog');
  await voiding.getByTestId('void-signatures-reason').fill('Durata greșită');
  await voiding.getByTestId('void-signatures-confirm').click();
  await expect(voiding).toBeHidden();
  await expect(slotOf('trainer')).toContainText('Anulat');
  await expect(slotOf('verifier')).toContainText('Anulat');
  await expect(record.getByTestId('training-record-edit')).toBeEnabled();

  await page.getByTestId('nav-signatures').click();
  await expect(page.getByTestId('signature-requests-empty')).toBeVisible();
});
