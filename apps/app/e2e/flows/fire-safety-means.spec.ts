import { expect, test } from '@playwright/test';

import {
  cleanUp,
  createAccount,
  createClientCompany,
  createOrganization,
  createWorkplace,
  signIn,
  updateClient,
} from './support';

test.afterAll(cleanUp);

test("a specialist records a client's fire-safety training, smoking rule, workplace data, means and other periodic checks, and the owner the technician's authorization", async ({
  page,
}) => {
  const owner = await createAccount('fire-means-owner', 'Petra Stingător');
  const organizationId = await createOrganization('Mijloace PSI E2E', owner.id);
  const clientId = await createClientCompany(organizationId, 'CLIENT MIJLOACE PSI E2E SRL');
  await updateClient(clientId, {
    training_first_month: 2,
    training_day_from: 2,
    training_day_to: 7,
  });
  await createWorkplace(organizationId, clientId, {
    name: 'Gelaterie Timișoara',
    is_registered_office: true,
    county_code: 'TM',
    locality: 'Timișoara',
    address_line: 'Str. Goethe 2',
  });
  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto(`/clients/${clientId}/training`);
  const card = page.getByTestId('fire-safety-card');
  await expect(card.getByTestId('fire-schedule-facts')).toContainText('Necompletat');
  await card.getByTestId('fire-safety-edit').click();
  await expect(card.getByTestId('fire-safety-starting')).toBeVisible();
  await expect(card.getByTestId('fire-training-hours')).toHaveValue('2');
  await expect(card.getByTestId('fire-first-month')).toHaveValue('2');
  await card.getByTestId('fire-worker-interval').selectOption('1');
  await expect(card.getByTestId('fire-smoking-place-input')).toHaveCount(0);
  await card.getByTestId('fire-smoking-select').selectOption('designated_places');
  await card
    .getByTestId('fire-smoking-place-input')
    .fill('În curtea interioară, lângă poarta de acces auto');
  await card.getByTestId('fire-waste-input').fill('deșeuri de carton și hârtie');
  await card.getByTestId('fire-waste-input').press('Enter');
  await card.getByTestId('fire-waste-input').fill('uleiuri uzate');
  await card.getByTestId('fire-waste-contractor-input').fill('Salubris SA');
  await card.getByTestId('fire-safety-save').click();
  await expect(page.getByText('Instruirea PSI a fost salvată.')).toBeVisible();
  await expect(card.getByTestId('fire-schedule-session')).toHaveText(
    'Fiecare instruire durează 2 ore și are loc între zilele 2 și 7 ale lunii.'
  );
  await expect(card.getByTestId('fire-schedule-execution')).toContainText(
    'Ianuarie, Februarie, Martie'
  );
  await expect(card.getByTestId('fire-waste-kinds')).toContainText('uleiuri uzate');
  await expect(card.getByTestId('fire-smoking-place')).toHaveText(
    'În curtea interioară, lângă poarta de acces auto'
  );

  await page.getByTestId('client-section').filter({ hasText: 'Mijloace PSI' }).click();
  const means = page.getByTestId('fire-means-card');
  await expect(means).toHaveCount(1);
  await expect(means.getByTestId('fire-equipment-empty')).toBeVisible();
  await expect(means.getByTestId('fire-equipment-hint')).toHaveCount(0);
  await means.getByTestId('fire-equipment-add').click();
  const equipment = page.getByTestId('fire-equipment-dialog');
  await equipment.getByTestId('fire-equipment-agent').selectOption('powder');
  await equipment.getByTestId('fire-equipment-capacity').fill('6');
  await expect(equipment.getByTestId('extinguisher-code')).toHaveText('P6');
  await equipment.getByTestId('fire-equipment-location').fill('Lângă casa de marcat');
  await equipment.getByTestId('fire-equipment-next-service').fill('01.04.2027');
  await equipment.getByTestId('fire-equipment-save').click();
  await expect(page.getByText('Echipamentul a fost adăugat.')).toBeVisible();
  await expect(means.getByTestId('fire-equipment-row')).toContainText('Lângă casa de marcat');
  await expect(means.getByTestId('extinguisher-code')).toHaveText('P6');

  await means.getByTestId('fire-installation-add').click();
  const installation = page.getByTestId('fire-installation-dialog');
  await installation.getByTestId('fire-installation-kind').selectOption('detection_alarm');
  await installation.getByTestId('fire-installation-description').fill('Centrală la intrare');
  await installation.getByTestId('fire-installation-save').click();
  await expect(page.getByText('Instalația a fost adăugată.')).toBeVisible();
  await expect(means.getByTestId('fire-installation-row')).toContainText('Centrală la intrare');

  await expect(means.getByTestId('fire-maintenance-empty')).toBeVisible();
  await means.getByTestId('fire-maintenance-add').click();
  const maintenance = page.getByTestId('fire-maintenance-dialog');
  await maintenance.getByTestId('fire-maintenance-subject').fill('Coșul de fum al centralei');
  await maintenance.getByTestId('fire-maintenance-interval').fill('anual');
  await maintenance.getByTestId('fire-maintenance-checked-by').fill('Firmă autorizată de coșerit');
  await maintenance.getByTestId('fire-maintenance-save').click();
  await expect(page.getByText('Verificarea a fost adăugată.')).toBeVisible();
  await expect(means.getByTestId('fire-maintenance-row')).toContainText(
    'Coșul de fum al centraleianual'
  );

  const substances = page.getByTestId('fire-substances-card');
  await expect(substances.getByTestId('fire-substances-state')).toHaveText('Nedecis');
  await substances.getByTestId('fire-substances-choice-listed').click();
  await expect(
    page.getByText('Am notat că clientul utilizează substanțe periculoase.')
  ).toBeVisible();
  await substances.getByTestId('fire-substance-add').click();
  const substance = page.getByTestId('fire-substance-dialog');
  await substance.getByTestId('fire-substance-name').fill('Propan');
  await substance.getByTestId('fire-substance-classification').fill('Flam. Gas 1, H220');
  await substance.getByTestId('fire-substance-quantity').fill('2 butelii de 11 kg');
  await substance.getByTestId('fire-substance-storage').fill('Cușca metalică din curte');
  await substance.getByTestId('fire-substance-save').click();
  await expect(page.getByText('Substanța a fost adăugată.')).toBeVisible();
  await expect(substances.getByTestId('fire-substance-row')).toContainText('Propan');
  await expect(substances.getByTestId('fire-substances-state')).toHaveText('1 substanță');

  await page.getByTestId('client-section').filter({ hasText: 'Detalii' }).click();
  const row = page.getByTestId('workplace-row');
  await expect(row.getByTestId('workplace-fire-incomplete')).toBeVisible();
  await row.click();
  const workplace = page.getByTestId('workplace-dialog');
  await workplace.getByTestId('workplace-activity').fill('Gelaterie');
  await workplace.getByTestId('workplace-floor-area').fill('450');
  await workplace.getByTestId('workplace-norm').selectOption('commercial_200');
  await workplace.getByTestId('workplace-assembly-point').fill('Parcarea din fața magazinului');
  await workplace.getByTestId('workplace-combustible-materials').fill('Ambalaje de carton');
  await workplace.getByTestId('workplace-ignition-sources').fill('De natură electrică');
  await workplace.getByTestId('workplace-fire-risk-equipment').fill('Vitrine frigorifice');
  await workplace.getByTestId('workplace-save').click();
  await expect(page.getByText('Punctul de lucru a fost salvat.')).toBeVisible();
  await expect(row.getByTestId('workplace-fire-incomplete')).toHaveCount(0);

  await page.getByTestId('client-section').filter({ hasText: 'Mijloace PSI' }).click();
  await expect(means).toContainText('Gelaterie · Str. Goethe 2, Timișoara, Timiș');
  await expect(means.getByTestId('fire-equipment-hint')).toHaveText(
    '1 stingător · minim orientativ 3 (anexa 6)'
  );

  await page.getByTestId('client-section').filter({ hasText: 'Detalii' }).click();
  await row.click();
  await workplace.getByTestId('workplace-kind').selectOption('mobile_site');
  await expect(workplace.getByTestId('workplace-floor-area')).toHaveCount(0);
  await expect(workplace.getByTestId('workplace-norm')).toHaveCount(0);
  await workplace.getByTestId('workplace-save').click();
  await expect(workplace).toHaveCount(0);
  await expect(row.getByTestId('workplace-fire-incomplete')).toHaveCount(0);
  await page.getByTestId('client-section').filter({ hasText: 'Mijloace PSI' }).click();
  await expect(means.getByTestId('fire-equipment-hint')).toHaveText(
    '1 stingător · fără normă din anexa 6'
  );

  await page.reload();
  await expect(means.getByTestId('fire-equipment-row')).toHaveCount(1);
  await expect(means.getByTestId('fire-installation-row')).toHaveCount(1);
  await expect(means.getByTestId('fire-maintenance-row')).toHaveCount(1);
  await expect(page.getByTestId('fire-substance-row')).toHaveCount(1);
  await page.goto(`/clients/${clientId}/training`);
  await expect(card.getByTestId('fire-smoking-place')).toHaveText(
    'În curtea interioară, lângă poarta de acces auto'
  );
  await card.getByTestId('fire-safety-edit').click();
  await card.getByTestId('fire-smoking-select').selectOption('forbidden_everywhere');
  await expect(card.getByTestId('fire-smoking-place-input')).toHaveCount(0);
  await card.getByTestId('fire-safety-save').click();
  await expect(page.getByText('Instruirea PSI a fost salvată.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('fire-smoking')).toHaveText('Interzis în toată unitatea');
  await expect(page.getByTestId('fire-smoking-place')).toHaveCount(0);
  await expect(page.getByTestId('fire-waste-contractor')).toHaveText('Salubris SA');
  await card.getByTestId('fire-safety-edit').click();
  await card.getByTestId('fire-smoking-select').selectOption('designated_places');
  await expect(card.getByTestId('fire-smoking-place-input')).toHaveValue('');
  await card.getByRole('button', { name: 'Renunță' }).click();

  await page.goto('/organization/authorizations');
  await page.getByTestId('authorizations-fireSafetyTechnicianName').fill('Radu Stan');
  await page.getByTestId('authorizations-fireSafetyTechnicianCertificate').fill('CT 123/2024');
  await page
    .getByTestId('authorizations-fireSafetyAuthorization')
    .fill('nr. 12 din 15.09.2026, ISU Timiș');
  await page.getByTestId('authorizations-save').click();
  await expect(page.getByText('Abilitările au fost salvate.')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('authorizations-fireSafetyAuthorization')).toHaveValue(
    'nr. 12 din 15.09.2026, ISU Timiș'
  );
  await expect(page.getByTestId('authorizations-fireSafetyTechnicianName')).toHaveValue(
    'Radu Stan'
  );
});
