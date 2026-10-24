import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createClientCompany,
  createEmployee,
  createOrganization,
  signIn,
} from './support';

test.afterAll(cleanUp);

test("an owner sees what to do and how the clients' trainings stand, and opens a count", async ({
  page,
}) => {
  const owner = await createAccount('dashboard', 'Elena Dashboard');
  const organizationId = await createOrganization('Dashboard E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. TABLOU E2E S.R.L.');
  await createEmployee(organizationId, clientId, {
    lastName: 'Popescu',
    firstName: 'Ion',
    jobTitle: 'Sudor',
  });

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
  await expect(page.getByTestId('dashboard-greeting')).toContainText(
    ', Elena. Ai 1 lucru de făcut'
  );

  const todo = page.getByRole('region', { name: 'Ce ai de făcut' });
  await expect(todo).toBeVisible();
  await expect(todo.getByTestId('dashboard-todo-missing-data')).toContainText(
    '1 client cu date lipsă'
  );

  const ssm = page.getByTestId('dashboard-trainings-ssm');
  await expect(ssm.getByRole('img')).toHaveAttribute(
    'aria-label',
    'Instruiri SSM, 1 angajat: 0 depășite, 0 scadente, 1 neinstruiți, 0 la zi'
  );
  await expect(page.getByTestId('dashboard-trainings-ssm-overdue-count')).toHaveText('0');
  await expect(page.getByTestId('dashboard-portfolio-clients')).toHaveText('1 client activ');

  await ssm.getByTestId('dashboard-trainings-ssm-chip-untrained').click();
  await expect(page).toHaveURL(/\/employees\?trainingState=untrained&domain=ssm$/);
  await expect(page.getByTestId('organization-employees-row')).toHaveCount(1);
});
