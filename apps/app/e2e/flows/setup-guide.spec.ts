import { expect, type Page, test } from '@playwright/test';

import {
  addSpecialist,
  cleanUp,
  completeProviderDetails,
  createAccount,
  createClientCompany,
  createOrganization,
  nameFireSafetyTechnician,
  openSetupGuide,
  setProfessionalTitle,
  signIn,
} from './support';

test.afterAll(cleanUp);

const guide = (page: Page) => page.getByTestId('setup-guide');
const step = (page: Page, id: string) => page.getByTestId(`setup-step-${id}`);

test('a new organization’s owner follows the guide to the first client, closes it and brings it back small', async ({
  page,
}) => {
  const owner = await createAccount('setup-owner', 'Ioana Popescu');
  const organizationId = await createOrganization('Expert SSM Banat SRL', owner.id);
  await completeProviderDetails(organizationId);
  await nameFireSafetyTechnician(organizationId);
  await setProfessionalTitle(owner.id, 'Inspector de protecție');
  await openSetupGuide(owner.id);

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(guide(page)).toHaveAttribute('data-view', 'expanded');
  await expect(page.getByRole('region', { name: 'Ghid de configurare' })).toBeVisible();
  await expect(guide(page).getByTestId('setup-guide-count')).toHaveText('4 din 15');
  await expect(step(page, 'client')).toHaveAttribute('data-state', 'next');
  await expect(step(page, 'workplaces-positions')).toHaveAttribute('data-state', 'locked');

  await step(page, 'client').getByTestId('setup-step-action-0').click();
  await expect(page).toHaveURL(/\/clients\/new$/);
  await page.getByTestId('client-cui').fill('1590082');
  await page.getByTestId('client-legal-name').fill('Alfa Construct SRL');
  await page.getByTestId('client-submit').click();
  await expect(page).toHaveURL(/\/clients$/);

  await expect(guide(page).getByTestId('setup-guide-count')).toHaveText('5 din 15');
  await expect(step(page, 'client')).toHaveAttribute('data-state', 'done');
  await expect(step(page, 'workplaces-positions')).toHaveAttribute('data-state', 'next');

  const closed = page.waitForResponse(
    (response) => response.url().endsWith('/me/setup') && response.request().method() === 'PUT'
  );
  await guide(page).getByTestId('setup-guide-close').click();
  expect((await closed).status()).toBe(200);
  await expect(guide(page)).toBeHidden();
  const pill = page.getByRole('button', { name: 'Ghid de configurare, 5 din 15 pași făcuți' });
  await expect(pill).toBeVisible();

  await page.reload();
  await expect(pill).toBeVisible();
  await expect(guide(page)).toBeHidden();

  await pill.click();
  await expect(guide(page)).toHaveAttribute('data-view', 'collapsed');
  await expect(guide(page).getByTestId('setup-guide-next')).toHaveText(
    'Adaugă puncte de lucru și posturi'
  );
  await expect(pill).toBeHidden();
});

test('a specialist joining a firm with a client sees the firm’s steps as the owner’s and their own open', async ({
  page,
}) => {
  const owner = await createAccount('setup-firm-owner', 'Ioana Popescu');
  const organizationId = await createOrganization('Expert SSM Banat SRL', owner.id);
  await completeProviderDetails(organizationId);
  await createClientCompany(organizationId, 'Alfa Construct SRL');
  const specialist = await createAccount('setup-specialist', 'Andrei Ionescu');
  await addSpecialist(organizationId, specialist.id);
  await openSetupGuide(specialist.id);

  await signIn(page, specialist.email);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(guide(page)).toHaveAttribute('data-view', 'expanded');
  await expect(guide(page).getByTestId('setup-guide-count')).toHaveText('2 din 15');

  await expect(step(page, 'company')).toHaveAttribute('data-state', 'done');
  await expect(step(page, 'company')).toContainText('Făcut de Ioana Popescu');
  await expect(step(page, 'authorizations')).toHaveAttribute('data-state', 'owner-only');
  await expect(step(page, 'authorizations')).toContainText(
    'Doar administratorul poate completa · Ioana Popescu'
  );
  await expect(step(page, 'authorizations').getByRole('link')).toHaveCount(0);
  await expect(step(page, 'professional-title')).toHaveAttribute('data-state', 'next');
  await expect(step(page, 'professional-title').getByTestId('setup-step-action-0')).toHaveAttribute(
    'href',
    '/profile?focus=professional-title'
  );

  const clientGroup = guide(page).getByTestId('setup-guide-group-client');
  await expect(clientGroup).toContainText('Primul tău client');
  await clientGroup.getByTestId('setup-guide-group-toggle').click();
  await expect(step(page, 'client')).toHaveAttribute('data-state', 'open');
  await expect(step(page, 'client')).toHaveText('Adaugă un client');
  await expect(step(page, 'workplaces-positions')).toHaveAttribute('data-state', 'open');
});
