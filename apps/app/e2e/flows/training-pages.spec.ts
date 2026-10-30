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
  updateClient,
} from './support';

test.afterAll(cleanUp);

const hiredAt = '2024-02-15';

test('a specialist records trainings held and follows each employee’s state', async ({ page }) => {
  const owner = await createAccount('training-pages', 'Dan MARIN');
  const organizationId = await createOrganization('Pagini instruiri E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. PAGINI INSTRUIRI E2E S.R.L.');
  await updateClient(clientId, { worker_training_interval_months: 3 });
  await createJobPosition(organizationId, clientId, 'Sudor');
  for (const [lastName, firstName, jobTitle] of [
    ['Instruitu', 'Ion', 'Sudor'],
    ['Sudoru', 'Maria', 'Sudor'],
    ['Lăcătușu', 'Vasile', 'Lăcătuș'],
  ] as const) {
    await createEmployee(organizationId, clientId, { lastName, firstName, jobTitle });
  }
  const token = await accessTokenOf(owner.email);
  const api = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(new URL(`/clients/${clientId}${path}`, process.env.E2E_API_URL), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });
    expect(response.ok).toBe(true);
    return response.json();
  };
  const { items: employees } = await api('/employees?pageSize=100');
  const welders = employees
    .filter((employee: { jobTitle: string }) => employee.jobTitle === 'Sudor')
    .map((employee: { id: string }) => employee.id);
  expect(welders).toHaveLength(2);
  // The hiring trainings, so that a periodic one is what decides the welders' state.
  for (const domain of ['ssm', 'psi']) {
    await api('/trainings', {
      method: 'POST',
      body: JSON.stringify({
        domain,
        phase: 'introductory_general',
        heldOn: hiredAt,
        durationMinutes: 240,
        material: 'Planul instruirii introductiv-generale',
        trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
        employeeIds: welders,
      }),
    });
  }

  await signIn(page, owner.email, `/clients/${clientId}/employees`);
  const rows = page.getByTestId('employees-row');
  await expect(rows).toHaveCount(3);
  await page.getByTestId('employees-training-filter-overdue').click();
  await expect(page).toHaveURL(/trainingState=overdue/);
  await expect(rows).toHaveCount(2);
  await page.getByTestId('employees-training-filter-untrained').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Lăcătușu Vasile');

  await page.getByTestId('client-section').filter({ hasText: 'Instruiri ținute' }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/trainings$`));
  const trainings = page.getByTestId('trainings-row');
  await expect(trainings).toHaveCount(2);
  await page.getByTestId('trainings-record').click();
  const dialog = page.getByTestId('training-dialog');
  await expect(dialog.getByTestId('training-phase')).toHaveValue('periodic');
  await dialog.getByTestId('training-position').selectOption({ label: 'Sudor' });
  const attendees = dialog.getByTestId('training-attendee');
  await expect(attendees).toHaveCount(2);
  await expect(attendees.nth(0)).toBeChecked();
  await expect(attendees.nth(1)).toBeChecked();
  await expect(dialog.getByTestId('training-trainer-name')).toHaveValue('Maria Popescu');
  await expect(dialog.getByTestId('training-verifier-name')).toHaveValue('Dan MARIN');
  await expect(dialog.getByTestId('training-no-themes')).toBeVisible();
  await dialog.getByTestId('training-duration').fill('120');
  await dialog.getByTestId('training-material').fill('IPSSM art. 1–40; art. 120–135');
  await dialog.getByTestId('training-trainer-job-title').fill('Administrator');
  await dialog.getByTestId('training-verifier-job-title').fill('Inspector SSM');
  await dialog.getByTestId('training-save').click();
  await expect(page.getByText('Instruirea a fost înregistrată.')).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(trainings).toHaveCount(3);
  await expect(trainings.first()).toContainText('Periodică');
  await expect(trainings.first()).toContainText('2 participanți');
  const participants = trainings.first().getByTestId('trainings-attendee');
  await expect(participants).toHaveText(['Instruitu Ion', 'Sudoru Maria']);
  await participants.first().click();
  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/employees/[^/]+/training/ssm$`));
  await expect(page.getByTestId('training-state')).toHaveText('La zi');

  for (const name of ['Instruitu Ion', 'Sudoru Maria']) {
    await page.goto(`/clients/${clientId}/employees`);
    await page.getByTestId('employees-open').filter({ hasText: name }).click();
    await page.getByTestId('employee-section').filter({ hasText: 'Instruire SSM' }).click();
    await expect(page.getByTestId('training-state')).toHaveText('La zi');
    const records = page.getByTestId('training-record-item');
    await expect(records).toHaveCount(2);
    await expect(records.first()).toHaveAttribute('data-phase', 'periodic');
    await expect(records.first()).toContainText('120 min (2 h)');
  }

  await page.goto(`/clients/${clientId}/employees?trainingState=overdue`);
  await expect(page.getByText('Niciun angajat în această stare a instruirii')).toBeVisible();

  await page.goto(`/clients/${clientId}/employees`);
  await page.getByTestId('employees-open').filter({ hasText: 'Lăcătușu Vasile' }).click();
  await page.getByTestId('employee-section').filter({ hasText: 'Instruire SSM' }).click();
  await expect(page.getByTestId('training-state')).toHaveText('Neinstruit');
  await expect(page.getByTestId('training-due-on')).toHaveText('După instruirea la angajare');
  await expect(page.getByTestId('training-interval')).toContainText('La 3 luni');
  await expect(page.getByTestId('training-interval-source')).toHaveText(
    'din programul de instruire al clientului'
  );
  await page.getByTestId('training-record').first().click();
  await expect(dialog.getByTestId('training-fixed-attendee')).toHaveText('Lăcătușu Vasile');
  await expect(dialog.getByTestId('training-phase')).toHaveValue('introductory_general');
  await dialog.getByTestId('training-source').selectOption('paper');
  await dialog.getByTestId('training-held-on').fill('15.02.2024');
  await expect(dialog.getByTestId('training-duration')).toHaveValue('240');
  await expect(dialog.getByTestId('training-trainer-name')).toHaveValue('Dan MARIN');
  await dialog.getByTestId('training-trainer-job-title').fill('Inspector SSM');
  await dialog.getByTestId('training-verifier-job-title').fill('Inspector SSM');
  await dialog.getByTestId('training-save').click();
  await expect(page.getByText('Instruirea a fost înregistrată.').last()).toBeVisible();
  const paperRecord = page.getByTestId('training-record-item');
  await expect(paperRecord).toHaveCount(1);
  await expect(paperRecord.getByTestId('training-record-paper')).toBeVisible();
  await expect(paperRecord).toContainText('240 min (4 h)');

  await page.goto(`/clients/${clientId}/trainings?domain=ssm`);
  await expect(trainings).toHaveCount(3);
  const paperRow = trainings.filter({ hasText: 'De pe fișa pe hârtie' });
  await expect(paperRow).toHaveCount(1);
  await paperRow.getByTestId('trainings-row-menu').click();
  await page.getByTestId('trainings-edit').click();
  await expect(dialog.getByTestId('training-duration')).toHaveValue('240');
  await expect(dialog.getByTestId('training-shared-notice')).toHaveCount(0);
  await dialog.getByTestId('training-duration').fill('180');
  await dialog.getByTestId('training-save').click();
  await expect(page.getByText('Instruirea a fost modificată.')).toBeVisible();
  await expect(paperRow).toContainText('180 min (3 h)');

  await paperRow.getByTestId('trainings-row-menu').click();
  await page.getByTestId('trainings-delete').click();
  await page.getByTestId('training-delete-confirm').click();
  await expect(page.getByText('Instruirea a fost ștearsă.')).toBeVisible();
  await expect(trainings).toHaveCount(2);
  await expect(paperRow).toHaveCount(0);
});
