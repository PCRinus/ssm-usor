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

// A client's job positions (ADR 006), against the local stack: the positions the database
// made from the employees' titles, and the ones a person adds, renames and removes.
test('a client has the posts its employees fill, and a specialist keeps the list', async ({
  page,
}) => {
  const owner = await createAccount('job-positions', 'Paula Posturi');
  const organizationId = await createOrganization('Posturi E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT POSTURI E2E S.R.L.');
  // Two spellings of one title are one position; nobody chose it.
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Sudoru',
    jobTitle: 'Sudor',
  });
  await createEmployee(organizationId, clientId, {
    firstName: 'Ana',
    lastName: 'Sudoru',
    jobTitle: ' sudor ',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees`);
  await page.getByRole('link', { name: 'Posturi de lucru' }).click();

  const rows = page.getByTestId('job-position-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Sudor');
  await expect(rows.first().getByTestId('job-position-employees')).toHaveText('2 angajați');
  await expect(rows.first().getByTestId('job-position-category-badge')).toHaveText('Execuție');

  // A position nobody fills yet.
  await page.getByTestId('job-position-add').click();
  await page.getByTestId('job-position-name').fill('Contabil');
  await page
    .getByTestId('job-position-category')
    .selectOption({ label: 'Tehnic-administrativ și conducători de locuri de muncă' });
  await page.getByTestId('job-position-zone').fill('Birou');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByText('Postul de lucru a fost adăugat.')).toBeVisible();
  const accountant = rows.filter({ hasText: 'Contabil' });
  await expect(accountant.getByTestId('job-position-category-badge')).toHaveText(
    'Tehnic-administrativ'
  );
  await expect(accountant.getByTestId('job-position-employees')).toHaveText('Niciun angajat');

  // The same name in another case is the same position.
  await page.getByTestId('job-position-add').click();
  await page.getByTestId('job-position-name').fill('SUDOR');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByText(/are deja un post cu această denumire/)).toBeVisible();
  await page.getByRole('button', { name: 'Renunță' }).click();

  await accountant.getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-edit').click();
  await page.getByTestId('job-position-name').fill('Contabil-șef');
  await page.getByTestId('job-position-save').click();
  await expect(rows.filter({ hasText: 'Contabil-șef' })).toHaveCount(1);

  // Empty, it goes; with people in it, the button stays off.
  await rows.filter({ hasText: 'Contabil-șef' }).getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-remove').click();
  await page.getByTestId('job-position-remove-confirm').click();
  await expect(rows).toHaveCount(1);

  await rows.first().getByTestId('job-position-actions').click();
  await page.getByTestId('job-position-remove').click();
  await expect(page.getByTestId('job-position-remove-dialog')).toContainText('2 angajați');
  await expect(page.getByTestId('job-position-remove-confirm')).toBeDisabled();
});

test('a new hire goes into a post from the employee form, and can be moved to another', async ({
  page,
}) => {
  const owner = await createAccount('employee-post', 'Paula Posturi');
  const organizationId = await createOrganization('Angajat și post E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'S.C. CLIENT ANGAJAT E2E S.R.L.');
  await createEmployee(organizationId, clientId, {
    firstName: 'Ion',
    lastName: 'Sudoru',
    jobTitle: 'Sudor',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/clients/${clientId}/employees/new`);

  await page.getByTestId('employee-last-name').fill('Electricu');
  await page.getByTestId('employee-first-name').fill('Dan');
  await page.getByTestId('employee-hired-at').fill('10.01.2024');

  // The way to a post the client lacks is a row of the list, there before anything is typed.
  // It opens the dialog of "Posturi de lucru" with what was typed, where the post gets its
  // category; saved, it is the choice, and the contract title follows it.
  await page.getByTestId('employee-job-position').click();
  await expect(page.getByTestId('employee-job-position-add')).toBeVisible();
  await page.getByTestId('employee-job-position-search').fill('Electrician');
  await page.getByTestId('employee-job-position-add').click();
  await expect(page.getByTestId('job-position-name')).toHaveValue('Electrician');
  await page.getByTestId('job-position-zone').fill('Teren');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByTestId('job-position-dialog')).toHaveCount(0);
  await expect(page.getByTestId('employee-job-position')).toContainText('Electrician');
  await expect(page.getByTestId('employee-job-title')).toHaveValue('Electrician');
  await page.getByTestId('employee-job-title').fill('Electrician întreținere');
  await page.getByTestId('employee-submit').click();

  await expect(page).toHaveURL(new RegExp(`/clients/${clientId}/employees$`));
  const row = page.getByTestId('employees-row').filter({ hasText: 'Electricu' });
  await expect(row).toContainText('Electrician');

  // The post exists now, with one person in it.
  await page.getByRole('link', { name: 'Posturi de lucru' }).click();
  const electrician = page.getByTestId('job-position-row').filter({ hasText: 'Electrician' });
  await expect(electrician.getByTestId('job-position-employees')).toHaveText('Un angajat');

  // On the person's page the two facts stand apart, and the post can change on its own.
  await page.getByRole('link', { name: 'Angajați' }).first().click();
  await row.getByRole('link').first().click();
  await expect(page.getByTestId('employee-job-position')).toHaveText('Electrician');
  await expect(page.getByText('Electrician întreținere')).toBeVisible();
  await page.getByTestId('employee-job-position-change').click();
  await page.getByTestId('employee-position').click();
  await page.getByTestId('employee-position-search').fill('sud');
  await page.getByRole('option', { name: /Sudor/ }).click();
  await page.getByTestId('employee-job-position-save').click();
  await expect(page.getByText('Postul de lucru a fost schimbat.')).toBeVisible();
  await expect(page.getByTestId('employee-job-position')).toHaveText('Sudor');

  // From inside this dialog too, a new post is one row away.
  await page.getByTestId('employee-job-position-change').click();
  await page.getByTestId('employee-position').click();
  await page.getByTestId('employee-position-add').click();
  await page.getByTestId('job-position-name').fill('Șef de echipă');
  await page.getByTestId('job-position-save').click();
  await expect(page.getByTestId('job-position-dialog')).toHaveCount(0);
  await page.getByTestId('employee-job-position-save').click();
  await expect(page.getByTestId('employee-job-position')).toHaveText('Șef de echipă');

  // What was entered about the person can be corrected, from their page or from the list's
  // row menu; the post and the title stay.
  await page.getByTestId('employee-back').click();
  await page
    .getByTestId('employees-row')
    .filter({ hasText: 'Electricu' })
    .getByTestId('employees-row-menu')
    .click();
  await page.getByTestId('employees-edit').click();
  await expect(page.getByTestId('edit-employee-page')).toBeVisible();
  await expect(page.getByTestId('employee-job-title')).toHaveValue('Electrician întreținere');
  await page.getByTestId('employee-last-name').fill('Electricu-Pop');
  await page.getByTestId('employee-phone').fill('0733 111 222');
  await page.getByTestId('employee-submit').click();
  await expect(page.getByText('Datele angajatului au fost salvate.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Electricu-Pop Dan');
  await expect(page.getByText('0733 111 222')).toBeVisible();
  await expect(page.getByTestId('employee-job-position')).toHaveText('Șef de echipă');
  await expect(page.getByText('Electrician întreținere')).toBeVisible();
});
