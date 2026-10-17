import { expect, test } from '@playwright/test';

import {
  addEmployee,
  addResponsiblePerson,
  addressOf,
  cleanUp,
  createProvider,
  inviteAdministratorByEmail,
  lastSignInCode,
} from './support';

test.afterAll(cleanUp);

test('an invited client administrator signs in and finds the employees, their records and sheets, and the responsible persons', async ({
  page,
}) => {
  const email = addressOf('administrator');
  const provider = await createProvider('Prevenție Vest E2E', 'Brutăria Veche E2E S.R.L.', {
    name: 'Elena Dobre',
    email,
  });
  const managerId = await addEmployee(provider, {
    lastName: 'Stan',
    firstName: 'Radu',
    email: addressOf('stan'),
    jobTitle: 'Brutar',
  });
  await addEmployee(provider, {
    lastName: 'Pop',
    firstName: 'Ana',
    email: addressOf('pop'),
    jobTitle: 'Vânzătoare',
  });
  await addResponsiblePerson(provider, {
    employeeId: managerId,
    fullName: 'Radu Stan',
    jobTitle: 'Șef de tură',
    roles: ['workplace_manager'],
  });
  await inviteAdministratorByEmail(provider, 'Elena Dobre', email);

  await page.goto('/sign-in');
  await page.getByTestId('sign-in-address').fill(email);
  await page.getByTestId('sign-in-request').click();
  await expect.poll(() => lastSignInCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('sign-in-code').fill(await lastSignInCode(email));

  const notice = page.getByTestId('privacy-notice');
  await expect(notice).toContainText('Ai acces la portal pentru Brutăria Veche E2E S.R.L.');
  await expect(page.getByTestId('privacy-notice-administrator')).toContainText(
    'în numele angajatorului'
  );
  await expect(notice.getByRole('checkbox')).toHaveCount(0);
  await page.getByTestId('privacy-notice-accept').click();

  const home = page.getByTestId('portal-home');
  await expect(home.getByRole('heading', { level: 1 })).toHaveText('Brutăria Veche E2E S.R.L.');
  await expect(home).toContainText('Elena Dobre');
  await expect(page.getByTestId('home-employees-count')).toHaveText('2');
  const person = page.getByTestId('responsible-person');
  await expect(person).toHaveCount(1);
  await expect(person).toContainText('Radu Stan');
  await expect(person).toContainText('Șef de tură');
  await expect(person.getByTestId('responsible-person-roles')).toHaveText(
    'Conducător al locului de muncă'
  );

  await page.getByTestId('home-employees').click();
  const rows = page.getByTestId('employee-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Pop Ana');
  await expect(rows.nth(1)).toContainText('Stan Radu');
  for (const row of [rows.nth(0), rows.nth(1)]) {
    await expect(row.getByTestId('employee-state-ssm')).toHaveText('Neinstruit');
    await expect(row.getByTestId('employee-state-psi')).toHaveText('Neinstruit');
  }

  await page.getByTestId('employees-search').fill('stan');
  await expect(rows).toHaveCount(1);
  await rows.first().click();

  const employee = page.getByTestId('employee-page');
  await expect(employee.getByRole('heading', { level: 1 })).toHaveText('Stan Radu');
  await expect(page.getByTestId('training-records-empty')).toHaveText(
    'Nicio instruire înregistrată încă.'
  );
  await expect(page.getByTestId('training-sheet-ssm')).toBeVisible();
  await expect(page.getByTestId('training-sheet-psi')).toBeVisible();
  await expect(page.getByTestId('training-sheet-ssm-missing')).toHaveText(
    'Fișa nu poate fi întocmită încă: lipsește traseul de deplasare; spune-i specialistului.'
  );

  await page.getByTestId('portal-bar-home').click();
  await expect(page.getByTestId('responsible-person')).toContainText('Radu Stan');
});
