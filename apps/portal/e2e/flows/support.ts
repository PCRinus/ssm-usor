import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.E2E_SUPABASE_URL!, process.env.E2E_SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const password = 'Parola-e2e-1';

// Never collides with another run, or with the app's flows sharing the local stack.
const run = `${Date.now().toString(36)}p${process.env.TEST_WORKER_INDEX ?? ''}`;
export const addressOf = (name: string) => `${name}-${run}@e2e.test`;

// Spec files share this module in a worker, so one run makes several providers.
const created = { providers: 0, users: [] as string[], organizations: [] as string[] };

export async function api<T>(
  path: string,
  token: string,
  init: { method: string; body?: unknown }
) {
  const response = await fetch(new URL(path, process.env.E2E_API_URL), {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    throw new Error(`${init.method} ${path}: ${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

export async function createProvider(
  organizationName: string,
  clientName: string,
  contact: { name: string; email: string } | null = null
) {
  created.providers += 1;
  const email = addressOf(`owner${created.providers}`);
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error) throw user.error;
  created.users.push(user.data.user.id);
  const profile = await admin
    .from('profiles')
    .insert({ user_id: user.data.user.id, full_name: 'Ana Ionescu' });
  if (profile.error) throw profile.error;
  const organization = await admin
    .from('organizations')
    .insert({ name: organizationName })
    .select('id')
    .single();
  if (organization.error) throw organization.error;
  created.organizations.push(organization.data.id);
  const membership = await admin
    .from('organization_members')
    .insert({ user_id: user.data.user.id, organization_id: organization.data.id, role: 'owner' });
  if (membership.error) throw membership.error;
  const client = await admin
    .from('clients')
    .insert({
      organization_id: organization.data.id,
      legal_name: clientName,
      cui: '1590082',
      legal_representative_name: 'Maria Popescu',
      legal_representative_role: 'Administrator',
      contact_name: contact?.name ?? null,
      contact_email: contact?.email ?? null,
    })
    .select('id')
    .single();
  if (client.error) throw client.error;

  const session = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const signedIn = await session.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return {
    token: signedIn.data.session.access_token,
    clientId: client.data.id as string,
    organizationId: organization.data.id as string,
    userId: user.data.user.id,
  };
}

export async function addEmployee(
  provider: { token: string; clientId: string },
  employee: {
    lastName: string;
    firstName: string;
    email: string;
    jobTitle: string;
    workplaceId?: string;
    commuteRoute?: string;
  }
) {
  const created = await api<{ employee: { id: string } }>(
    `/clients/${provider.clientId}/employees`,
    provider.token,
    { method: 'POST', body: { ...employee, hiredAt: '2024-02-15' } }
  );
  return created.employee.id;
}

export async function inviteByEmail(
  provider: { token: string; clientId: string },
  employeeId: string,
  email: string
) {
  await api(
    `/clients/${provider.clientId}/employees/${employeeId}/participant-invitations`,
    provider.token,
    { method: 'POST', body: { channel: 'email', address: email } }
  );
}

export async function addResponsiblePerson(
  provider: { token: string; clientId: string },
  person: { employeeId: string; fullName: string; jobTitle: string; roles: string[] }
) {
  await api(`/clients/${provider.clientId}/responsible-persons`, provider.token, {
    method: 'POST',
    body: person,
  });
}

export async function inviteAdministratorByEmail(
  provider: { token: string; clientId: string },
  fullName: string,
  email: string
) {
  await api(`/clients/${provider.clientId}/participant-invitations`, provider.token, {
    method: 'POST',
    body: { fullName, channel: 'email', address: email },
  });
}

export async function addWorkplace(
  provider: { clientId: string; organizationId: string },
  name: string
) {
  const workplace = await admin
    .from('client_workplaces')
    .insert({ organization_id: provider.organizationId, client_id: provider.clientId, name })
    .select('id')
    .single();
  if (workplace.error) throw workplace.error;
  return workplace.data.id as string;
}

export async function lastSigningCode(to: string) {
  const url = new URL('/__e2e/emails', process.env.E2E_API_URL);
  url.searchParams.set('to', to);
  const messages = (await (await fetch(url)).json()) as { kind: string; url: string }[];
  const code = messages
    .filter((message) => message.kind === 'signing-code')
    .at(-1)
    ?.url.match(/code=(\d+)/)?.[1];
  if (!code) throw new Error(`No signing code was sent to ${to}.`);
  return code;
}

export async function lastSignInCode(to: string) {
  const url = new URL('/__e2e/emails', process.env.E2E_API_URL);
  url.searchParams.set('to', to);
  const messages = (await (await fetch(url)).json()) as { kind: string; url: string }[];
  const code = messages
    .filter((message) => message.kind === 'sign-in-code')
    .at(-1)
    ?.url.match(/code=(\d+)/)?.[1];
  if (!code) throw new Error(`No sign-in code was sent to ${to}.`);
  return code;
}

export async function answerKey(organizationId: string, domain: 'ssm' | 'psi', test: string) {
  const questions = await admin
    .from('test_questions')
    .select('text, options')
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq('domain', domain)
    .eq('test', test);
  if (questions.error) throw questions.error;
  return new Map(
    questions.data.map((question) => [
      question.text as string,
      (question.options as { text: string; correct: boolean }[])
        .filter((option) => option.correct)
        .map((option) => option.text),
    ])
  );
}

export async function cleanUp() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const mine = data.users.filter((user) => user.email?.endsWith(`-${run}@e2e.test`));
  for (const id of created.organizations) {
    // A finished test attempt is frozen even for the secret key and restricts its employee,
    // client and organization (ADR 024), so such an organization stays in the local stack.
    const attempts = await admin
      .from('test_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', id);
    if ((attempts.count ?? 0) > 0) continue;
    // Participants and invitations restrict the deletion of their employees and client.
    await admin.from('participant_invitations').delete().eq('organization_id', id);
    await admin.from('client_participants').delete().eq('organization_id', id);
    await admin.from('trainings').delete().eq('organization_id', id);
    await admin.from('client_responsible_persons').delete().eq('organization_id', id);
    await admin.from('employees').delete().eq('organization_id', id);
    await admin.from('client_workplaces').delete().eq('organization_id', id);
    await admin.from('job_positions').delete().eq('organization_id', id);
    await admin.from('clients').delete().eq('organization_id', id);
    const removed = await admin.from('organizations').delete().eq('id', id);
    if (removed.error) throw removed.error;
  }
  for (const id of new Set([...created.users, ...mine.map((user) => user.id)])) {
    await admin.auth.admin.deleteUser(id);
  }
  created.users = [];
  created.organizations = [];
}
