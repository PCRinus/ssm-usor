import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createJobPosition,
  createOrganization,
  createWorkplace,
  emailsTo,
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

  await signIn(page, owner.email, `/clients/${clientId}/employees/${employee!.id}/training/ssm`);
  await page.getByTestId('training-record').first().click();
  const dialog = page.getByTestId('training-dialog');
  await dialog.getByTestId('training-phase').selectOption('periodic');
  await expect(dialog.getByTestId('training-trainer-name')).toHaveValue('Maria Popescu');
  await expect(dialog.getByTestId('training-verifier-name')).toHaveValue('Dan MARIN');
  // The verifier is the specialist, a member; the legal representative has no account.
  await expect(dialog.getByTestId('training-verifier-signer')).toHaveValue(owner.id);
  await expect(dialog.getByTestId('training-trainer-signer')).toHaveValue('');
  await dialog.getByTestId('training-trainer-signer').selectOption(owner.id);
  // The certificate names the account, so the slot must print the signer's own name.
  await expect(dialog.getByTestId('training-trainer-signer-mismatch')).toContainText(
    'Rubrica tipărește „Maria Popescu”, dar semnează Dan MARIN.'
  );
  await dialog.getByTestId('training-trainer-signer-use-name').click();
  await expect(dialog.getByTestId('training-trainer-name')).toHaveValue('Dan MARIN');
  await expect(dialog.getByTestId('training-trainer-signer-mismatch')).toBeHidden();
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

  await page.goto(`/clients/${clientId}/portal`);
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

test('a member signs two requests with one code from Semnături', async ({ page }) => {
  test.skip(
    !process.env.GOTENBERG_URL || !process.env.SIGNER_URL || !process.env.SIGNING_CA_KEY,
    'Signing needs GOTENBERG_URL, SIGNER_URL and the SIGNING_* values exported (docs/local-development.md#signing-locally).'
  );
  const owner = await createAccount('signing-session', 'Dan MARIN');
  const organizationId = await createOrganization('Semnare E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT SEMNARE E2E S.R.L.');
  await createWorkplace(organizationId, clientId, {
    name: 'Sediu Str. Fabricii 3',
    is_registered_office: true,
    county_code: 'CJ',
    locality: 'Cluj-Napoca',
  });
  const positionId = await createJobPosition(organizationId, clientId, 'Sudor');
  const token = await accessTokenOf(owner.email);
  const call = async (path: string, body: unknown) => {
    const response = await fetch(new URL(`/clients/${clientId}${path}`, process.env.E2E_API_URL), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    return response.json();
  };
  const { employee } = await call('/employees', {
    lastName: 'Semnatu',
    firstName: 'Ion',
    jobTitle: 'Sudor',
    jobPositionId: positionId,
    hiredAt: '2026-01-05',
    commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
    commuteMinutes: 25,
  });
  await call('/trainings', {
    domain: 'ssm',
    phase: 'periodic',
    heldOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()),
    durationMinutes: 60,
    material: 'IPSSM art. 1–40',
    trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
    employeeIds: [employee.id],
    signers: { trainer: owner.id, verifier: owner.id },
  });

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('nav-signatures').click();
  await expect(page.getByTestId('signature-request')).toHaveCount(2);
  await page.getByTestId('signature-requests-client-select').click();
  await page.getByTestId('signature-requests-sign').click();

  const dialog = page.getByTestId('signing-dialog');
  await expect(dialog.getByTestId('signing-item')).toHaveCount(2);
  await dialog.getByTestId('signing-send').click();
  await expect(dialog.getByTestId('signing-address')).toContainText('***@');
  const [message] = (await emailsTo(owner.email, 'signing-code')).slice(-1);
  const code = message?.url.match(/code=(\d{6})/)?.[1];
  expect(code).toBeDefined();
  await dialog.getByTestId('signing-code').fill(code!);
  await dialog.getByTestId('signing-submit').click();
  await expect(dialog.getByTestId('signing-result-summary')).toHaveText(
    'Ai semnat 2 instruiri. Semnăturile sunt pe fișele angajaților.',
    { timeout: 30_000 }
  );
  await expect(dialog.getByTestId('signing-signed')).toHaveCount(2);
  await dialog.getByTestId('signing-close').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('signature-requests-empty')).toBeVisible();

  await page.goto(`/clients/${clientId}/employees/${employee.id}/training/ssm`);
  const record = page.getByTestId('training-record-item').first();
  await expect(record.locator('[data-testid="signature-slot"][data-slot="trainer"]')).toContainText(
    'Semnat electronic'
  );
  await expect(record.getByTestId('training-record-edit')).toBeDisabled();
  await expect(record.getByTestId('training-record-delete')).toBeDisabled();
});
