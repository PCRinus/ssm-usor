import { expect, test } from '@playwright/test';

import {
  archiveEmployees,
  cleanUp,
  createAccount,
  createClientCompany,
  createOrganization,
  overStartStep,
  signIn,
} from './support';

test.afterAll(cleanUp);

const day = 86_400_000;

test('within the month past the step, the employees list says until when new ones are added', async ({
  page,
}) => {
  const owner = await createAccount('over-step-month', 'Olga Owner');
  const organizationId = await createOrganization('Peste treaptă E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. MULȚI LUCRĂTORI E2E S.R.L.');
  await overStartStep(organizationId, clientId, 251, new Date());
  await signIn(page, owner.email, `/clienti/${clientId}/angajati`);

  const notice = page.getByTestId('employees-over-step');
  await expect(notice).toContainText('Poți adăuga lucrători noi până pe');
  await expect(notice).toContainText('inclusiv');
  await expect(page.getByTestId('employees-add')).toBeEnabled();
});

test('a month past the step, adding is refused with the reason in view, and comes back with the count', async ({
  page,
}) => {
  const owner = await createAccount('over-step-block', 'Olga Owner');
  const organizationId = await createOrganization('Blocat E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. PESTE TREAPTĂ E2E S.R.L.');
  await overStartStep(organizationId, clientId, 251, new Date(Date.now() - 33 * day));
  await signIn(page, owner.email, `/clienti/${clientId}/angajati`);

  const notice = page.getByTestId('employees-over-step');
  await expect(notice).toContainText('Nu mai poți adăuga lucrători noi.');
  await expect(notice.getByRole('link', { name: 'Vezi abonamentul' })).toHaveAttribute(
    'href',
    '/organizatie/abonament'
  );
  await expect(page.getByTestId('employees-add')).toBeDisabled();

  // The API refuses it too, whatever the page shows.
  await page.goto(`/clienti/${clientId}/angajati/nou`);
  await expect(page.getByTestId('employees-over-step')).toBeVisible();
  await page.getByTestId('employee-last-name').fill('Popescu');
  await page.getByTestId('employee-first-name').fill('Ion');
  await page.getByTestId('employee-hired-at').fill('01.03.2024');
  await page.getByTestId('employee-job-position').click();
  await page.getByRole('option', { name: /Operator/ }).click();
  await expect(page.getByTestId('employee-job-title')).toHaveValue('Operator');
  await page.getByTestId('employee-submit').click();
  await expect(page.getByTestId('employee-form-error')).toContainText(
    'Nu mai poți adăuga lucrători noi'
  );

  await archiveEmployees(clientId, 1);
  await page.goto(`/clienti/${clientId}/angajati`);
  await expect(page.getByTestId('employees-table')).toBeVisible();
  await expect(page.getByTestId('employees-over-step')).toHaveCount(0);
  await expect(page.getByTestId('employees-add')).toBeEnabled();
});
