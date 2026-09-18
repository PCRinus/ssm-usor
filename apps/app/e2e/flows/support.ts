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

// An employee of a client, for pickers that list them.
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

// The link in the newest email the API's in-memory mailer holds for an address.
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
