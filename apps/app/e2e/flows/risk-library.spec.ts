import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { workshopEvaluation } from '../../../api/src/modules/documents/risk-evaluations.fixture';
import {
  cleanUp,
  createAccount,
  createClientCompany,
  createJobPosition,
  createOrganization,
  evaluateRisks,
  signIn,
} from './support';

const admin = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.afterAll(cleanUp);

// The risk library (ADR 015): an evaluated post saved as a profile and applied to another
// client's post, which then holds copies the profile no longer reaches.
test("a client's evaluated post becomes a profile that evaluates another client's post", async ({
  page,
}) => {
  const owner = await createAccount('risk-library', 'Radu Riscuri');
  const organizationId = await createOrganization('Riscuri E2E', owner.id);
  const firstClient = await createClientCompany(organizationId, 'S.C. PRIMUL CLIENT E2E S.R.L.');
  const firstPosition = await createJobPosition(organizationId, firstClient, 'Lăcătuș mecanic');
  await evaluateRisks(organizationId, firstClient);
  const second = await admin
    .from('clients')
    .insert({
      organization_id: organizationId,
      legal_name: 'S.C. AL DOILEA CLIENT E2E S.R.L.',
      cui: '22',
      legal_representative_name: 'Ion Ionescu',
    })
    .select('id')
    .single();
  if (second.error) throw second.error;
  const secondPosition = await createJobPosition(organizationId, second.data.id, 'Mecanic');
  const turnerPosition = await createJobPosition(organizationId, second.data.id, 'Strungar');
  const turnerSheet = await admin.from('risk_evaluations').insert({
    organization_id: organizationId,
    client_id: second.data.id,
    kind: 'job_position',
    job_position_id: turnerPosition,
    means_of_production: 'Strungul și sculele clientului.',
    exposure: '4 h / zi',
  });
  if (turnerSheet.error) throw turnerSheet.error;

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByTestId('nav-risks').click();
  await expect(page.getByTestId('risk-library-empty')).toContainText('Salvează în bibliotecă');

  await page.goto(`/clienti/${firstClient}/posturi/${firstPosition}/fisa-de-evaluare`);
  await expect(page.getByTestId('risk-factor-row').first()).toBeVisible();
  const factorCount = await page.getByTestId('risk-factor-row').count();
  expect(factorCount).toBeGreaterThan(0);
  await expect(page.getByTestId('risk-evaluation-save-as-profile')).toHaveCount(0);
  await page.getByTestId('risk-library-nudge-save').click();
  await expect(page.getByTestId('profile-name')).toHaveValue('Lăcătuș mecanic');
  await page.getByTestId('profile-name').fill('Lucrător în atelier');
  await page.getByTestId('profile-name-submit').click();
  await expect(
    page.getByText('Evaluarea „Lucrător în atelier” a fost salvată în bibliotecă.')
  ).toBeVisible();
  await expect(page.getByTestId('risk-library-nudge')).toHaveCount(0);
  await expect(page.getByTestId('risk-factors-origin')).toContainText(
    'în evaluarea Lucrător în atelier din bibliotecă.'
  );

  await page.goto(`/clienti/${second.data.id}/posturi/${secondPosition}/fisa-de-evaluare`);
  await page.getByTestId('risk-evaluation-start').click();
  await expect(page.getByTestId('risk-factors-empty')).toBeVisible();
  await page.setViewportSize({ width: 360, height: 760 });
  await page.getByTestId('risk-factors-apply-profile').click();
  const dialog = page.getByTestId('apply-profile-dialog');
  await dialog
    .getByTestId('apply-profile-option')
    .filter({ hasText: 'Lucrător în atelier' })
    .click();
  await dialog.getByTestId('apply-profile-confirm').click();
  await expect(
    page.getByText(/din „Lucrător în atelier” au fost adăugați în fișă\./)
  ).toBeVisible();
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount);
  await expect(page.getByTestId('risk-factors-origin')).toHaveText(
    `Toți cei ${factorCount} factori sunt în evaluarea Lucrător în atelier din bibliotecă.`
  );
  await expect(page.getByTestId('risk-factor-origin')).toHaveCount(0);
  await expect(page.getByTestId('work-system-means')).toHaveText(
    workshopEvaluation.meansOfProduction
  );
  await expect(page.getByTestId('work-system-environment')).toHaveText(
    workshopEvaluation.workEnvironment
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto('/evaluari-de-risc');
  const row = page.getByTestId('risk-profile-row').filter({ hasText: 'Lucrător în atelier' });
  await expect(row.getByTestId('risk-profile-factors')).toHaveText(String(factorCount));
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await row.getByTestId('risk-profile-open').click();
  await expect(page.getByTestId('risk-profile-page')).toBeVisible();
  const usage = page.getByTestId('risk-profile-usage-client');
  await expect(usage).toHaveCount(2);
  await expect(usage.nth(0)).toContainText('S.C. AL DOILEA CLIENT E2E S.R.L.');
  await expect(usage.nth(1).getByTestId('risk-profile-usage-open')).toHaveText('Lăcătuș mecanic');
  await expect(page.getByTestId('risk-factors-card')).toContainText(
    'Termenele și persoanele care răspund de măsuri, din plan, se copiază în fișă ca valori implicite'
  );
  const workSystem = page.getByTestId('work-system-card');
  await expect(workSystem.getByTestId('work-system-means')).toHaveText(
    workshopEvaluation.meansOfProduction
  );
  await workSystem.getByTestId('work-system-edit').click();
  await page.getByTestId('work-system-workEnvironment').fill('Hală nouă, ventilată mecanic.');
  await page.getByTestId('work-system-exposure-input').fill('6 h / zi');
  await page.getByTestId('work-system-save').click();
  await expect(workSystem.getByTestId('work-system-environment')).toHaveText(
    'Hală nouă, ventilată mecanic.'
  );
  await expect(workSystem.getByTestId('work-system-exposure')).toHaveText('6 h / zi');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByTestId('risk-factor-row').first().getByTestId('risk-factor-actions').click();
  await page.getByTestId('risk-factor-remove').click();
  await page.getByTestId('risk-factor-remove-confirm').click();
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto(`/clienti/${second.data.id}/posturi/${secondPosition}/fisa-de-evaluare`);
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount);
  await expect(page.getByTestId('risk-factor-origin')).toHaveCount(factorCount - 1);
  await expect(page.getByTestId('work-system-environment')).toHaveText(
    workshopEvaluation.workEnvironment
  );

  await page.goto(`/clienti/${second.data.id}/posturi/${turnerPosition}/fisa-de-evaluare`);
  await page.getByTestId('risk-factors-apply-profile').click();
  await page
    .getByTestId('apply-profile-dialog')
    .getByTestId('apply-profile-option')
    .filter({ hasText: 'Lucrător în atelier' })
    .click();
  await page.getByTestId('apply-profile-confirm').click();
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount - 1);
  await expect(page.getByTestId('work-system-means')).toHaveText('Strungul și sculele clientului.');
  await expect(page.getByTestId('work-system-environment')).toHaveText(
    'Hală nouă, ventilată mecanic.'
  );
  await expect(page.getByTestId('work-system-exposure')).toHaveText('4 h / zi');

  const refused = await admin
    .from('evaluation_profiles')
    .delete()
    .eq('organization_id', organizationId)
    .select('id');
  expect(refused.error?.code).toBe('RSK04');

  await page.goto('/evaluari-de-risc');
  const used = page.getByTestId('risk-profile-row').filter({ hasText: 'Lucrător în atelier' });
  await expect(used.getByTestId('risk-profile-clients')).toHaveText('2 clienți');
  await used.getByTestId('risk-profile-actions').click();
  await expect(page.getByTestId('risk-profile-remove')).toHaveCount(0);
  await page.getByTestId('risk-profile-archive').click();
  await expect(page.getByTestId('risk-profile-archive-dialog')).toContainText(
    'fișele clienților care o folosesc nu se schimbă'
  );
  await page.getByTestId('risk-profile-archive-confirm').click();
  await expect(page.getByText('„Lucrător în atelier” a fost arhivată.')).toBeVisible();
  await expect(page.getByTestId('risk-library-empty')).toBeVisible();

  await page.goto(`/clienti/${second.data.id}/posturi/${secondPosition}/fisa-de-evaluare`);
  await page.getByTestId('risk-factors-apply-profile').click();
  await expect(page.getByTestId('apply-profile-none')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.goto('/evaluari-de-risc');
  await page.getByTestId('risk-library-filter-archived').click();
  await expect(page).toHaveURL(/status=archived/);
  const archived = page.getByTestId('risk-profile-row').filter({ hasText: 'Lucrător în atelier' });
  await expect(archived.getByTestId('risk-profile-clients')).toHaveText('2 clienți');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await archived.getByTestId('risk-profile-open').click();
  await expect(page.getByTestId('risk-profile-archived')).toBeVisible();
  await expect(page.getByTestId('risk-profile-usage-client')).toHaveCount(2);
  await expect(page.getByTestId('risk-profile-remove')).toHaveCount(0);
  await page.getByTestId('risk-profile-restore').click();
  await page.getByTestId('risk-profile-archive-confirm').click();
  await expect(page.getByText('„Lucrător în atelier” a fost reactivată.')).toBeVisible();
  await expect(page.getByTestId('risk-profile-archived')).toHaveCount(0);
  await expect(page.getByTestId('risk-profile-archive')).toBeVisible();
});
