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

// These run the production build, where the React Compiler is on, so a validation message
// that never appears is caught here.

test('an owner fills in the company details, and they are still there after a reload', async ({
  page,
}) => {
  const owner = await createAccount('company-owner', 'Olga Firma');
  await createOrganization('Date firma E2E', owner.id);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/organization');
  await expect(page).toHaveURL(/\/organization\/team$/);
  await page.getByRole('link', { name: 'Date firmă' }).click();

  await page.getByTestId('company-cui').fill('1590083');
  await page.getByTestId('company-legalName').fill('S.C. DATE FIRMA E2E S.R.L.');
  await page.getByTestId('company-iban').fill('RO48 AAAA 1B31 0075 9384 0000');
  await page.getByTestId('company-details-save').click();
  await expect(page.getByTestId('company-cui-error')).toContainText('CUI invalid');
  await expect(page.getByTestId('company-iban-error')).toContainText('IBAN invalid');

  await page.getByTestId('company-cui').fill('RO 1590082');
  await page.getByTestId('company-legalRepresentativeName').fill('Olga Firma');
  await page.getByTestId('company-legalRepresentativeRole').fill('Administrator');
  await page.getByTestId('company-iban').fill('ro49aaaa1b31007593840000');
  await page.getByTestId('company-bankName').fill('Banca Transilvania');
  await page.getByTestId('company-vatPayer').click();
  await page.getByTestId('company-details-save').click();
  await expect(page.getByText('Datele firmei au fost salvate.')).toBeVisible();

  await page.reload();
  // Stored as digits; the RO prefix is not part of the code.
  await expect(page.getByTestId('company-cui')).toHaveValue('1590082');
  await expect(page.getByTestId('company-legalName')).toHaveValue('S.C. DATE FIRMA E2E S.R.L.');
  await expect(page.getByTestId('company-legalRepresentativeRole')).toHaveValue('Administrator');
  // Stored bare and in upper case, shown in groups of four.
  await expect(page.getByTestId('company-iban')).toHaveValue('RO49 AAAA 1B31 0075 9384 0000');
  await expect(page.getByTestId('company-vatPayer')).toBeChecked();
  await expect(page.getByTestId('company-details-save')).toBeDisabled();
});

test('an owner fills in the authorizations, and they are still there after a reload', async ({
  page,
}) => {
  const owner = await createAccount('authorizations-owner', 'Olga Abilitare');
  await createOrganization('Abilitari E2E', owner.id);
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/organization/authorizations');

  await page.getByTestId('authorizations-authorizationCertificateNumber').fill('17664');
  await page.getByTestId('authorizations-authorizationCertificateDate').fill('30.09.2022');
  await page.getByTestId('authorizations-save').click();
  await expect(page.getByText('Abilitările au fost salvate.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('authorizations-authorizationCertificateNumber')).toHaveValue(
    '17664'
  );
  await expect(page.getByTestId('authorizations-authorizationCertificateDate')).toHaveValue(
    '30.09.2022'
  );
  await expect(page.getByTestId('authorizations-save')).toBeDisabled();
});

test('a person sets their professional title on the profile page', async ({ page }) => {
  const specialist = await createAccount('titled', 'Tudor Titlu');
  await createOrganization('Titluri E2E', specialist.id);
  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/profile');

  await page.getByTestId('profile-professional-title').fill('E');
  await page.getByTestId('profile-save').click();
  await expect(page.getByTestId('profile-professional-title-error')).toContainText('cel puțin 2');

  await page.getByTestId('profile-professional-title').fill('Evaluator autorizat');
  await page.getByTestId('profile-save').click();
  await expect(page.getByText('Profilul a fost salvat.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('profile-professional-title')).toHaveValue('Evaluator autorizat');
});

test("a specialist sets a client's representative role and training schedule", async ({ page }) => {
  const owner = await createAccount('schedule-owner', 'Sorin Program');
  const organizationId = await createOrganization('Program instruire E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT PROGRAM E2E SRL');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/clients/${clientId}/employees`);
  await page.getByRole('link', { name: 'Date pentru documente' }).click();
  await expect(page.getByTestId('details-representative-name')).toHaveValue('Maria Popescu');

  await page.getByTestId('details-day-from').fill('12');
  await page.getByTestId('details-day-to').fill('7');
  await page.getByTestId('training-program-save').click();
  await expect(page.getByTestId('details-day-to-error')).toContainText('Ultima zi');

  await page.getByTestId('details-representative-name').fill('Maria-Ioana Popescu');
  await page.getByTestId('details-representative-role').fill('Administrator');
  await page.getByTestId('legal-representative-save').click();
  await expect(page.getByText('Reprezentantul legal a fost salvat.')).toBeVisible();

  await page.getByTestId('details-training-duration').click();
  await page.getByRole('option', { name: '1 oră și 30 de minute' }).click();
  await page.getByTestId('details-first-month').click();
  await page.getByRole('option', { name: 'Februarie' }).click();
  await page.getByTestId('details-administrative-interval').click();
  await page.getByRole('option', { name: 'Semestrial (la 6 luni)' }).click();
  await page.getByTestId('details-worker-interval').click();
  await page.getByRole('option', { name: 'Trimestrial (la 3 luni)' }).click();
  // The preview follows the selects while typing, before anything is saved.
  await expect(page.getByText('Lunile: Februarie, Mai, August, Noiembrie')).toBeVisible();
  await page.getByTestId('details-day-from').fill('2');
  await page.getByTestId('training-program-save').click();
  await expect(page.getByText('Programul de instruire a fost salvat.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('details-representative-name')).toHaveValue('Maria-Ioana Popescu');
  await expect(page.getByTestId('details-representative-role')).toHaveValue('Administrator');
  await expect(page.getByTestId('legal-representative-save')).toBeDisabled();
  // A complete program reads as a summary; the form is one click away.
  await expect(page.getByTestId('training-program-execution')).toContainText('la 3 luni');
  await expect(page.getByTestId('training-program-execution')).toContainText(
    'Februarie, Mai, August, Noiembrie'
  );
  await expect(page.getByTestId('training-program-session')).toContainText('1 oră și 30 de minute');
  await page.getByTestId('training-program-edit').click();
  await expect(page.getByTestId('details-worker-interval')).toHaveText('Trimestrial (la 3 luni)');
});

test('a client gets a registered office and a point of work, one of which is then archived', async ({
  page,
}) => {
  const owner = await createAccount('workplaces-owner', 'Petra Punct');
  const organizationId = await createOrganization('Puncte de lucru E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT PUNCTE E2E SRL');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/document-data`);
  await expect(page.getByTestId('workplaces-empty')).toBeVisible();

  await page.getByTestId('workplace-add').click();
  await page.getByTestId('workplace-save').click();
  await expect(page.getByTestId('workplace-name-error')).toContainText('Introdu denumirea');
  await page.getByTestId('workplace-name').fill('Sediu social');
  await page.getByTestId('workplace-registered-office').click();
  await page.getByTestId('workplace-county').click();
  await page.getByTestId('workplace-county-search').fill('bucu');
  await page.getByRole('option', { name: /București/ }).click();
  await page.getByTestId('workplace-locality').click();
  await page.getByTestId('workplace-locality-search').fill('sector 3');
  await page.getByRole('option', { name: /Sectorul 3/ }).click();
  await page.getByTestId('workplace-save').click();
  await expect(page.getByText('Punctul de lucru a fost adăugat.')).toBeVisible();

  // The database allows one registered office per client; the dialog says so and stays open.
  await page.getByTestId('workplace-add').click();
  await page.getByTestId('workplace-name').fill('Magazin Timișoara');
  await page.getByTestId('workplace-registered-office').click();
  await page.getByTestId('workplace-save').click();
  await expect(page.getByTestId('workplace-registered-office-error')).toContainText(
    'are deja un sediu social'
  );
  await page.getByTestId('workplace-registered-office').click();
  await page.getByTestId('workplace-save').click();
  await expect(page.getByTestId('workplace-row')).toHaveCount(2);
  // The registered office comes first whatever the names.
  await expect(page.getByTestId('workplace-row').first()).toContainText('Sediu social');

  await page
    .getByTestId('workplace-row')
    .filter({ hasText: 'Magazin Timișoara' })
    .getByTestId('workplace-actions')
    .click();
  await page.getByTestId('workplace-archive').click();
  await page.getByTestId('workplace-archive-confirm').click();
  await expect(page.getByText('Magazin Timișoara a fost arhivat.')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('workplace-row')).toHaveCount(1);
});

test('an employee is designated once, and the administrator is added by hand', async ({ page }) => {
  const owner = await createAccount('responsible-owner', 'Radu Responsabil');
  const organizationId = await createOrganization('Persoane responsabile E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT PERSOANE E2E SRL');
  await createEmployee(organizationId, clientId, {
    firstName: 'Paolo-Antonio',
    lastName: 'Luca',
    jobTitle: 'Manager magazin',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/document-data`);
  await expect(page.getByTestId('responsible-persons-empty')).toBeVisible();

  const pickEmployee = async () => {
    await page.getByTestId('responsible-add').click();
    await page.getByTestId('responsible-employee').click();
    await page.getByTestId('responsible-employee-search').fill('luca');
    await page.getByRole('option', { name: /Luca/ }).click();
  };

  await pickEmployee();
  await expect(page.getByTestId('responsible-name')).toHaveValue('Paolo-Antonio Luca');
  await expect(page.getByTestId('responsible-job-title')).toHaveValue('Manager magazin');
  await page.getByTestId('responsible-save').click();
  await expect(page.getByTestId('responsible-roles-error')).toContainText('cel puțin o');
  await page.getByTestId('responsible-role-workplace_manager').click();
  await page.getByTestId('responsible-role-first_aid').click();
  await page.getByTestId('responsible-save').click();
  await expect(page.getByText('Persoana a fost adăugată.')).toBeVisible();
  await expect(page.getByTestId('responsible-missing')).toContainText(
    'Echipa de evaluare a riscurilor, Pericol grav și iminent'
  );

  // The database lists an employee once per client; the dialog says where to change them.
  await pickEmployee();
  await page.getByTestId('responsible-role-imminent_danger').click();
  await page.getByTestId('responsible-save').click();
  await expect(page.getByTestId('responsible-employee-error')).toContainText('este deja în listă');
  await page.getByRole('button', { name: 'Renunță' }).click();

  // The administrator is often designated without being an employee.
  await page.getByTestId('responsible-add').click();
  await page.getByTestId('responsible-name').fill('Maria Popescu');
  await page.getByTestId('responsible-job-title').fill('Administrator');
  await page.getByTestId('responsible-role-risk_evaluation_team').click();
  await page.getByTestId('responsible-role-imminent_danger').click();
  await page.getByTestId('responsible-save').click();
  await expect(page.getByTestId('responsible-row')).toHaveCount(2);
  await expect(page.getByTestId('responsible-missing')).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('responsible-row')).toHaveCount(2);
});

test("the workers' representative is an employee other than the legal representative", async ({
  page,
}) => {
  const owner = await createAccount('workers-representative-owner');
  const organizationId = await createOrganization('Reprezentant lucrători E2E', owner.id);
  // Its legal representative is Maria Popescu.
  const clientId = await createClientCompany(organizationId, 'CLIENT REPREZENTANT E2E SRL');
  await createEmployee(organizationId, clientId, {
    firstName: 'Maria',
    lastName: 'POPESCU',
    jobTitle: 'Director general',
  });
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Vasile',
    jobTitle: 'Vânzător',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/document-data`);

  const designate = async (search: string, name: RegExp) => {
    await page.getByTestId('responsible-add').click();
    await page.getByTestId('responsible-employee').click();
    await page.getByTestId('responsible-employee-search').fill(search);
    await page.getByRole('option', { name }).click();
    await page.getByTestId('responsible-role-workers_representative').click();
    await page.getByTestId('responsible-save').click();
  };

  await designate('popescu', /Popescu/i);
  await expect(page.getByTestId('responsible-roles-error')).toContainText(
    'este reprezentantul legal al clientului'
  );
  await page.getByRole('button', { name: 'Renunță' }).click();

  await designate('vasile', /Vasile/);
  await expect(page.getByText('Persoana a fost adăugată.')).toBeVisible();
  await expect(page.getByTestId('responsible-row')).toHaveCount(1);
  await expect(page.getByTestId('responsible-row')).toContainText('Reprezentantul lucrătorilor');
});

test('employee choices scroll with the wheel inside the responsible-person dialog', async ({
  page,
}) => {
  const owner = await createAccount('responsible-scroll-owner');
  const organizationId = await createOrganization('Lista angajați E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT ANGAJAȚI E2E SRL');
  for (let index = 0; index < 16; index++) {
    await createEmployee(organizationId, clientId, {
      firstName: `Angajat ${index + 1}`,
      lastName: 'Test',
      jobTitle: 'Electrician',
    });
  }
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/document-data`);
  await page.getByTestId('responsible-add').click();
  await page.getByTestId('responsible-employee').click();

  const list = page.locator('[data-slot="command-list"]');
  await expect(list).toBeVisible();
  expect(await list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await list.hover();
  await page.mouse.wheel(0, 300);
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test('the county and locality lists scroll with the wheel inside the workplace dialog', async ({
  page,
}) => {
  const owner = await createAccount('workplace-scroll-owner');
  const organizationId = await createOrganization('Liste punct de lucru E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT LISTE E2E SRL');
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/document-data`);
  await page.getByTestId('workplace-add').click();

  const list = page.locator('[data-slot="command-list"]');
  const scrollsWithTheWheel = async () => {
    await expect(list).toBeVisible();
    await list.hover();
    await page.mouse.wheel(0, 300);
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  };

  await page.getByTestId('workplace-county').click();
  await scrollsWithTheWheel();
  await page.getByTestId('workplace-county-search').fill('timi');
  await page.getByRole('option', { name: /Timiș/ }).click();

  await page.getByTestId('workplace-locality').click();
  await scrollsWithTheWheel();
  // What the register lacks is one fixed row under the list, not a row among the matches.
  await page.getByTestId('workplace-locality-search').fill('sat');
  await expect(page.getByRole('option').last()).toHaveText('Folosește „sat”');

  // A label names its field but does not open it.
  await page.keyboard.press('Escape');
  await page.locator('label[for="workplace-locality"]').click();
  await expect(list).toBeHidden();
});
