import { expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

// Fixtures are written with the local stack's secret key, the way the seed script does it.
const admin = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const password = 'Parola-e2e-1';

// One run never collides with another, or with what a developer has in their local stack.
const run = Date.now().toString(36);
export const addressOf = (name: string) => `${name}-${run}@e2e.test`;

const created = { users: [] as string[], organizations: [] as string[] };

export async function createAccount(name: string, fullName?: string) {
  const email = addressOf(name);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  created.users.push(data.user.id);
  if (fullName) {
    const profile = await admin
      .from('profiles')
      .insert({ user_id: data.user.id, full_name: fullName });
    if (profile.error) throw profile.error;
  }
  return { id: data.user.id, email };
}

export async function createOrganization(name: string, ownerId: string) {
  const organization = await admin.from('organizations').insert({ name }).select('id').single();
  if (organization.error) throw organization.error;
  created.organizations.push(organization.data.id);
  const membership = await admin
    .from('organization_members')
    .insert({ user_id: ownerId, organization_id: organization.data.id, role: 'owner' });
  if (membership.error) throw membership.error;
  return organization.data.id;
}

// A client company of the organization. Removed with it by `cleanUp`.
export async function createClientCompany(organizationId: string, legalName: string) {
  const client = await admin
    .from('clients')
    .insert({
      organization_id: organizationId,
      legal_name: legalName,
      cui: '1590082',
      legal_representative_name: 'Maria Popescu',
    })
    .select('id')
    .single();
  if (client.error) throw client.error;
  return client.data.id as string;
}

// Everything the documents print, so that generating is not held back (ADR 005).
export async function completeDocumentData(
  organizationId: string,
  userId: string,
  clientId: string
) {
  const organization = await admin
    .from('organizations')
    .update({
      legal_name: 'S.C. SERVICIU EXTERN E2E S.R.L.',
      legal_representative_name: 'Ana IONESCU',
      legal_representative_role: 'Administrator',
    })
    .eq('id', organizationId);
  if (organization.error) throw organization.error;
  const profile = await admin
    .from('profiles')
    .update({ professional_title: 'Evaluator de risc SSM' })
    .eq('user_id', userId);
  if (profile.error) throw profile.error;
  const client = await admin
    .from('clients')
    .update({
      legal_representative_role: 'Administrator',
      periodic_training_hours: 2,
      administrative_training_interval_months: 6,
      worker_training_interval_months: 3,
      training_first_month: 2,
      training_day_from: 2,
      training_day_to: 7,
    })
    .eq('id', clientId);
  if (client.error) throw client.error;
  const person = await admin.from('client_responsible_persons').insert({
    organization_id: organizationId,
    client_id: clientId,
    full_name: 'Maria POPESCU',
    job_title: 'Administrator',
    roles: ['workplace_manager', 'first_aid', 'risk_evaluation_team', 'imminent_danger'],
  });
  if (person.error) throw person.error;
}

export async function createEmployee(
  organizationId: string,
  clientId: string,
  name: { firstName: string; lastName: string; jobTitle: string }
) {
  const employee = await admin.from('employees').insert({
    organization_id: organizationId,
    client_id: clientId,
    first_name: name.firstName,
    last_name: name.lastName,
    job_title: name.jobTitle,
    hired_at: '2024-02-15',
  });
  if (employee.error) throw employee.error;
}

// What the recovery email would carry, without sending one.
export async function recoveryTokenHash(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email });
  if (error) throw error;
  return data.properties.hashed_token;
}

export async function emailedLink(to: string, kind: string) {
  const url = new URL('/__e2e/emails', process.env.E2E_API_URL);
  url.searchParams.set('to', to);
  const emails = (await (await fetch(url)).json()) as { kind: string; url: string }[];
  const email = emails.filter((item) => item.kind === kind).at(-1);
  if (!email) throw new Error(`No ${kind} email was sent to ${to}.`);
  return email.url;
}

export async function cleanUp() {
  // Accounts created through the UI are found by this run's address suffix.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const mine = data.users.filter((user) => user.email?.endsWith(`-${run}@e2e.test`));
  for (const id of new Set([...created.users, ...mine.map((user) => user.id)])) {
    await admin.auth.admin.deleteUser(id);
  }
  for (const id of created.organizations) {
    // Generated files first, then the rows that say where they are.
    const revisions = await admin
      .from('document_revisions')
      .select('docx_path')
      .eq('organization_id', id);
    const paths = (revisions.data ?? []).map((revision) => revision.docx_path as string);
    if (paths.length > 0) await admin.storage.from('documents').remove(paths);
    await admin.from('document_revisions').delete().eq('organization_id', id);
    await admin.from('client_documents').delete().eq('organization_id', id);
    await admin.from('document_generations').delete().eq('organization_id', id);
    // Clients restrict the deletion of their organization, and their rows that of the client.
    await admin.from('client_responsible_persons').delete().eq('organization_id', id);
    await admin.from('client_workplaces').delete().eq('organization_id', id);
    await admin.from('employees').delete().eq('organization_id', id);
    await admin.from('clients').delete().eq('organization_id', id);
    await admin.from('organizations').delete().eq('id', id);
  }
}

export async function signIn(page: Page, email: string, withPassword = password) {
  await page.goto('/login');
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(withPassword);
  await page.getByTestId('login-submit').click();
}

export async function signOut(page: Page) {
  await page.getByTestId('account-menu').click();
  await page.getByTestId('account-sign-out').click();
  await expect(page).toHaveURL(/\/login$/);
}
