import { expect, test } from '@playwright/test';

import {
  accessTokenOf,
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

const ownText = 'Unde se află trusa de prim ajutor din atelierul de sudură?';

// ADR 024: the seeded TASSM holds ten built-ins, the floor, so a hide waits for an own question.
test('a specialist keeps ten questions in the bank and records a paper pass', async ({ page }) => {
  const owner = await createAccount('knowledge-tests', 'Dan MARIN');
  const organizationId = await createOrganization('Teste E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT TESTE E2E S.R.L.');
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Testatu',
    jobTitle: 'Sudor',
  });
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
  const {
    items: [employee],
  } = await api('/employees?pageSize=100');
  // The introductory general training is what makes the hiring test await the employee.
  await api('/trainings', {
    method: 'POST',
    body: JSON.stringify({
      domain: 'ssm',
      phase: 'introductory_general',
      heldOn: '2024-02-15',
      durationMinutes: 240,
      material: 'Planul instruirii introductiv-generale',
      trainer: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      verifier: { name: 'Dan MARIN', jobTitle: 'Inspector SSM' },
      employeeIds: [employee.id],
    }),
  });

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByTestId('nav-tests').click();
  await expect(page).toHaveURL(/\/tests\/ssm$/);
  const card = page.getByTestId('test-bank-test').filter({ hasText: 'TASSM' });
  const facts = card.getByTestId('test-bank-facts');
  await expect(facts).toHaveText('10 întrebări active · se extrag 10 · prag 70 %');
  const builtIns = card.locator('[data-testid="test-question"][data-built-in="true"]');
  await expect(builtIns).toHaveCount(10);
  const first = builtIns.first();

  await first.getByTestId('test-question-hide').click();
  await expect(card.getByTestId('test-bank-error')).toHaveText(
    'Un test trebuie să păstreze cel puțin zece întrebări active.'
  );
  await expect(first).toHaveAttribute('data-hidden', 'false');

  await card.getByTestId('test-question-add').click();
  const dialog = page.getByTestId('test-question-dialog');
  await expect(dialog.getByTestId('test-question-test')).toHaveValue('Testul la angajare (TASSM)');
  await dialog.getByTestId('test-question-text').fill(ownText);
  const options = dialog.getByTestId('test-question-option-text');
  await options.nth(0).fill('Lângă ușa de evacuare a atelierului');
  await options.nth(1).fill('În biroul contabilității');
  await options.nth(2).fill('Nu există o trusă');
  await dialog.getByTestId('test-question-option-correct').nth(0).click();
  await dialog
    .getByTestId('test-question-explanation')
    .fill('Trusa stă lângă ieșire, ca oricine să o ia fără să treacă prin atelier.');
  await dialog.getByTestId('test-question-submit').click();
  await expect(dialog).toBeHidden();
  await expect(facts).toHaveText('11 întrebări active · se extrag 10 · prag 70 %');
  const own = card.getByTestId('test-question').filter({ hasText: ownText });
  await expect(own.getByTestId('test-question-kind')).toHaveText('Proprie');

  await own.getByTestId('test-question-preview').click();
  const preview = page.getByTestId('test-question-preview-dialog');
  await expect(preview.getByTestId('test-question-preview-text')).toHaveText(ownText);
  await expect(preview.getByTestId('test-question-preview-option')).toHaveCount(3);
  await expect(preview.getByTestId('test-question-preview-explanation')).toContainText(
    'Trusa stă lângă ieșire'
  );
  await preview.getByRole('button', { name: 'Închide' }).click();
  await expect(preview).toBeHidden();

  await first.getByTestId('test-question-hide').click();
  await expect(first).toHaveAttribute('data-hidden', 'true');
  await expect(first.getByTestId('test-question-hidden')).toHaveText('Ascunsă');
  await expect(facts).toHaveText('10 întrebări active · se extrag 10 · prag 70 %');
  await expect(card.getByTestId('test-bank-error')).toBeHidden();

  await page.goto(`/clients/${clientId}/employees/${employee.id}/training/ssm`);
  const tests = page.getByTestId('employee-tests');
  await expect(tests.getByTestId('tests-state')).toHaveText('De susținut');
  await expect(tests.getByTestId('tests-gap')).toBeVisible();
  await tests.getByTestId('tests-record-paper').click();
  const paper = page.getByTestId('test-result-dialog');
  await expect(paper.getByTestId('test-result-test')).toHaveValue('Testul la angajare (TASSM)');
  await expect(paper.getByTestId('test-result-examiner-name')).toHaveValue('Dan MARIN');
  await paper.getByTestId('test-result-examiner-job-title').fill('Inspector SSM');
  await paper.getByTestId('test-result-submit').click();
  await expect(paper).toBeHidden();
  await expect(tests.getByTestId('tests-state')).toHaveText('Promovat');
  await expect(tests.getByTestId('tests-gap')).toBeHidden();
  const result = tests.getByTestId('tests-result');
  await expect(result).toHaveCount(1);
  await expect(result.getByTestId('tests-result-source')).toHaveText('De pe hârtie');
  await expect(result.getByTestId('tests-result-examiner')).toHaveText(
    'Examinator: Dan MARIN, Inspector SSM'
  );

  await page.goto(`/clients/${clientId}/employees`);
  const row = page.getByTestId('employees-row').filter({ hasText: 'Testatu Ion' });
  await expect(row.getByTestId('test-status-ssm')).toHaveText('Promovat');
  await expect(row.getByTestId('test-status-psi')).toHaveText('Fără test');

  await page.getByTestId('employees-test-filter-none').click();
  await expect(page).toHaveURL(/testState=none/);
  await expect(row).toBeVisible();
  await page.getByTestId('employees-test-filter-passed').click();
  await expect(page).toHaveURL(/testState=passed/);
  await expect(page.getByTestId('employees-empty')).toBeVisible();
});
