import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

const organizations: string[] = [];

// A profile restricts the deletion of its organization, which `cleanUp` does not know about.
test.afterAll(async () => {
  for (const id of organizations) {
    await admin.from('evaluation_profiles').delete().eq('organization_id', id);
  }
  await cleanUp();
});

// The risk library (ADR 015): an evaluated post saved as a profile and applied to another
// client's post, which then holds copies the profile no longer reaches.
test("a client's evaluated post becomes a profile that evaluates another client's post", async ({
  page,
}) => {
  const owner = await createAccount('risk-library', 'Radu Riscuri');
  const organizationId = await createOrganization('Riscuri E2E', owner.id);
  organizations.push(organizationId);
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

  await signIn(page, owner.email);
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.getByTestId('nav-risks').click();
  await expect(page.getByTestId('risk-library-empty')).toContainText('Salvează ca profil');

  await page.goto(`/clients/${firstClient}/job-positions/${firstPosition}/risk-evaluation`);
  await expect(page.getByTestId('risk-factor-row').first()).toBeVisible();
  const factorCount = await page.getByTestId('risk-factor-row').count();
  expect(factorCount).toBeGreaterThan(0);
  await page.getByTestId('risk-evaluation-save-as-profile').click();
  await expect(page.getByTestId('profile-name')).toHaveValue('Lăcătuș mecanic');
  await page.getByTestId('profile-name').fill('Lucrător în atelier');
  await page.getByTestId('profile-name-submit').click();
  await expect(
    page.getByText('Profilul „Lucrător în atelier” a fost salvat în biblioteca de riscuri.')
  ).toBeVisible();

  await page.goto(`/clients/${second.data.id}/job-positions/${secondPosition}/risk-evaluation`);
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
    page.getByText(/din „Lucrător în atelier” au fost adăugați în evaluare\./)
  ).toBeVisible();
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto('/risks');
  const row = page.getByTestId('risk-profile-row').filter({ hasText: 'Lucrător în atelier' });
  await expect(row.getByTestId('risk-profile-totals')).toContainText(`${factorCount} `);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await row.getByTestId('risk-profile-open').click();
  await expect(page.getByTestId('risk-profile-page')).toBeVisible();
  await page.getByTestId('risk-factor-row').first().getByTestId('risk-factor-actions').click();
  await page.getByTestId('risk-factor-remove').click();
  await page.getByTestId('risk-factor-remove-confirm').click();
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await page.goto(`/clients/${second.data.id}/job-positions/${secondPosition}/risk-evaluation`);
  await expect(page.getByTestId('risk-factor-row')).toHaveCount(factorCount);
});
