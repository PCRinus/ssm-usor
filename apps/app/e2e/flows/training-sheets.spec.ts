import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createJobPosition,
  createOrganization,
  createWorkplace,
  signIn,
} from './support';

test.afterAll(cleanUp);

// The default headless shell saves a PDF as a download; the full Chromium shows it in the tab.
test.use({ channel: 'chromium' });

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());

test('an employee with a route and a recorded training gets a training sheet as a PDF', async ({
  page,
  context,
}) => {
  const owner = await createAccount('training-sheets', 'Dan MARIN');
  const organizationId = await createOrganization('Fișe E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT FIȘE E2E S.R.L.');
  await createWorkplace(organizationId, clientId, {
    name: 'Sediu Str. Fabricii 3',
    is_registered_office: true,
    county_code: 'CJ',
    locality: 'Cluj-Napoca',
  });
  const positionId = await createJobPosition(organizationId, clientId, 'Sudor');
  const token = await accessTokenOf(owner.email);
  const call = (path: string, init: RequestInit = {}) =>
    fetch(new URL(`/clients/${clientId}${path}`, process.env.E2E_API_URL), {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
    });

  const created = await call('/employees', {
    method: 'POST',
    body: JSON.stringify({
      lastName: 'Fișescu',
      firstName: 'Ion',
      jobTitle: 'Sudor',
      jobPositionId: positionId,
      hiredAt: '2026-01-05',
      commuteRoute: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
      commuteMinutes: 25,
    }),
  });
  expect(created.status).toBe(201);
  const { employee } = await created.json();
  expect(employee.workplace).toMatchObject({ name: 'Sediu Str. Fabricii 3' });

  const recorded = await call('/trainings', {
    method: 'POST',
    body: JSON.stringify({
      domain: 'ssm',
      phase: 'introductory_general',
      heldOn: today,
      durationMinutes: 240,
      material: 'Conform MISSMIG Art. 1 – 325',
      trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      employeeIds: [employee.id],
    }),
  });
  expect(recorded.status).toBe(201);

  const readiness = await call(`/employees/${employee.id}/training-sheets`);
  expect(readiness.status).toBe(200);
  expect(await readiness.json()).toEqual({
    ssm: { ready: true, missing: [], stored: false, sequences: [] },
    psi: { ready: true, missing: [], stored: false, sequences: [] },
  });

  const sheet = await call(`/employees/${employee.id}/training-sheet?domain=ssm`);
  test.skip(sheet.status === 503, 'No PDF converter or no registered sheet template.');
  expect(sheet.status).toBe(200);
  expect(sheet.headers.get('content-type')).toBe('application/pdf');
  expect(sheet.headers.get('content-disposition')).toContain('filename="Fisa-SSM-Fisescu-Ion.pdf"');
  const bytes = new Uint8Array(await sheet.arrayBuffer());
  expect(bytes.length).toBeGreaterThan(1000);
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees/${employee.id}/training/ssm`);
  const preview = page.getByTestId('training-sheet-ssm-preview');
  await expect(preview).toBeEnabled();
  const [tab] = await Promise.all([context.waitForEvent('page'), preview.click()]);
  await expect.poll(() => tab.url()).toMatch(/^blob:/);
  await expect(preview).toBeEnabled();
});
