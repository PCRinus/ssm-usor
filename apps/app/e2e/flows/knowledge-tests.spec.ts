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

// ADR 024: the seeded SSM hiring test holds ten built-ins, the floor, so a hide waits for an own
// question.
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
  await expect(page).toHaveURL(/\/teste\/ssm$/);
  const card = page.getByTestId('test-bank-test');
  await expect(page.getByTestId('test-bank-rules')).toHaveText(
    '10 întrebări pe test, extrase la întâmplare · prag de promovare 70 %'
  );
  const counts = card.getByTestId('test-bank-counts');
  await expect(counts).toHaveText('10 întrebări active · minimum 10');
  const builtIns = card.locator('[data-testid="test-question"][data-built-in="true"]');
  await expect(builtIns).toHaveCount(10);
  const first = builtIns.first();
  const firstLinks = first.getByTestId('test-question-citation-link');
  await expect(firstLinks.first()).toHaveAttribute('href', /^https:\/\/legislatie\.just\.ro\//);
  await expect(firstLinks.first()).toHaveAttribute('target', '_blank');

  await first.getByTestId('test-question-hide').click();
  const minimum = page.getByTestId('test-minimum');
  await expect(minimum).toContainText(
    'Testul are minimum 10 întrebări active. Adaugă întâi una proprie, apoi o poți ascunde pe aceasta.'
  );
  await expect(first).toHaveAttribute('data-hidden', 'false');

  await minimum.getByTestId('test-minimum-add').click();
  await expect(minimum).toBeHidden();
  const dialog = page.getByTestId('test-question-dialog');
  await expect(dialog.getByTestId('test-question-test')).toHaveValue('SSM la angajare');
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
  await expect(counts).toHaveText('11 întrebări active');
  const own = card.getByTestId('test-question').filter({ hasText: ownText });
  await expect(own.getByTestId('test-question-kind')).toHaveText('Proprie');

  await own.getByTestId('test-question-preview').click();
  const preview = page.getByTestId('test-question-preview-dialog');
  await expect(preview.getByTestId('test-question-preview-text')).toHaveText(ownText);
  await expect(preview.getByTestId('test-question-preview-option')).toHaveCount(3);
  await expect(preview.getByTestId('test-question-preview-explanation')).toContainText(
    'Trusa stă lângă ieșire'
  );
  await preview.getByTestId('test-question-preview-close').click();
  await expect(preview).toBeHidden();

  await first.getByTestId('test-question-hide').click();
  await expect(first).toHaveAttribute('data-hidden', 'true');
  await expect(first.getByTestId('test-question-hidden')).toContainText('Ascunsă');
  await expect(counts).toHaveText('10 întrebări active · minimum 10 · 1 ascunsă');
  await expect(card.getByTestId('test-bank-error')).toBeHidden();

  await page.getByTestId('test-bank-section').filter({ hasText: 'SU anual' }).click();
  await expect(page).toHaveURL(/\/teste\/su-anual$/);
  await expect(page.getByTestId('test-bank-test')).toHaveAttribute('data-test', 'annual');
  await expect(page.getByTestId('test-bank-counts')).toHaveText('10 întrebări active · minimum 10');

  await page.goto(`/clienti/${clientId}/angajati/${employee.id}/instruire/ssm`);
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

  await page.goto(`/clienti/${clientId}/angajati`);
  const row = page.getByTestId('employees-row').filter({ hasText: 'Testatu Ion' });
  await expect(row.getByTestId('test-status')).toHaveText('SU: fără test');

  await page.getByTestId('employees-filters').click();
  const panel = page.getByTestId('employees-filters-panel');
  await panel.getByTestId('employees-filters-test-none').click();
  await expect(page).toHaveURL(/test=none/);
  await expect(row).toBeVisible();
  await panel.getByTestId('employees-filters-test-none').click();
  await panel.getByTestId('employees-filters-test-passed').click();
  await expect(page).toHaveURL(/test=passed/);
  await expect(page.getByTestId('employees-empty-filtered')).toBeVisible();
});
