import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import {
  addEmployee,
  addressOf,
  addWorkplace,
  api,
  cleanUp,
  createProvider,
  inviteAdministratorByEmail,
  inviteByEmail,
  lastSignInCode,
  lastSigningCode,
} from './support';

// Signing needs Gotenberg, the signer container and the signing authority, which CI's flow job
// does not have: without GOTENBERG_URL, SIGNER_URL and the SIGNING_* values exported
// (docs/local-development.md#signing-locally) the flow checks what the lists show and stops
// before asking for a code.
const signing = Boolean(
  process.env.GOTENBERG_URL && process.env.SIGNER_URL && process.env.SIGNING_CA_KEY
);

const made = { organizationId: '', clientId: '', employeeId: '', emails: [] as string[] };

test.afterAll(async () => {
  if (signing && made.organizationId) await removeSignatures();
  await cleanUp();
});

async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByTestId('sign-in-address').fill(email);
  await page.getByTestId('sign-in-request').click();
  await expect.poll(() => lastSignInCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('sign-in-code').fill(await lastSignInCode(email));
  await page.getByTestId('sign-in-code').press('Enter');
  await page.getByTestId('privacy-notice-accept').click();
  await expect(page.getByTestId('portal-home')).toBeVisible();
}

async function typeSigningCode(page: Page, email: string) {
  await expect(page.getByTestId('signing-address-hint')).toBeVisible();
  await expect(page.getByTestId('signing-address-hint')).not.toHaveText(email);
  await expect.poll(() => lastSigningCode(email).catch(() => null)).not.toBeNull();
  await page.getByTestId('signing-code').fill(await lastSigningCode(email));
  await page.getByTestId('signing-sign').click();
}

test('an employee signs the agreement and a training with one code, and the client administrator countersigns the agreement', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const provider = await createProvider('Prevenție Vest E2E', 'Tipografia Nouă E2E S.R.L.');
  made.organizationId = provider.organizationId;
  made.clientId = provider.clientId;
  const workplaceId = await addWorkplace(provider, 'Atelierul din Lugoj');
  const email = addressOf('semnatar');
  const administratorEmail = addressOf('resurse-umane');
  made.emails = [email, administratorEmail];
  const employeeId = await addEmployee(provider, {
    lastName: 'Pop',
    firstName: 'Ana',
    email,
    jobTitle: 'Tipograf',
    workplaceId,
    commuteRoute: 'Pe jos, pe strada Lungă',
  });
  made.employeeId = employeeId;
  await inviteByEmail(provider, employeeId, email);
  await inviteAdministratorByEmail(provider, 'Elena Dobre', administratorEmail);

  await signIn(page, email);
  await expect(page.getByTestId('home-todo')).toContainText('Nimic de semnat deocamdată');

  await api(
    `/clients/${provider.clientId}/employees/${employeeId}/signing-agreement/state`,
    provider.token,
    { method: 'PUT', body: { state: 'generated' } }
  );
  await api(`/clients/${provider.clientId}/trainings`, provider.token, {
    method: 'POST',
    body: {
      domain: 'ssm',
      phase: 'periodic',
      heldOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date()),
      durationMinutes: 90,
      material: 'Instrucțiuni proprii pentru utilizarea ghilotinei de hârtie.',
      trainer: { name: 'Ana Ionescu', jobTitle: 'Inspector SSM' },
      employeeIds: [employeeId],
      signers: { trainer: provider.userId },
    },
  });

  await page.reload();
  const panel = page.getByTestId('home-todo');
  const items = panel.getByTestId('home-todo-item');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toHaveAttribute('data-kind', 'agreement');
  await expect(items.nth(0)).toContainText('Actul adițional privind semnarea electronică');
  await expect(items.nth(1)).toContainText('Instruire periodică SSM');
  await expect(items.nth(1)).toContainText('semnezi ca instruit');
  await expect(page.getByTestId('home-sign')).toHaveText('Semnează (2)');

  await page.getByTestId('home-sign').click();
  const checks = page.getByTestId('signing-item-check');
  await expect(checks).toHaveCount(2);
  await expect(checks.nth(0)).toBeChecked();
  await expect(checks.nth(1)).toBeChecked();

  if (signing) {
    await page.getByTestId('signing-send').click();
    await typeSigningCode(page, email);
    await expect(page.getByTestId('signing-result-summary')).toHaveAttribute(
      'data-outcome',
      'signed',
      { timeout: 120_000 }
    );
    await expect(page.getByTestId('signing-outcome')).toHaveCount(2);

    await page.getByTestId('signing-trainings').click();
    await expect(page.getByTestId('training-record')).toHaveCount(1);
    await expect(page.getByTestId('training-record-signatures')).toHaveCount(0);
    await expect(page.getByTestId('training-sheet-ssm-stored')).toHaveText(
      'Fișă semnată electronic'
    );

    await page.getByTestId('portal-bar-home').click();
    await expect(page.getByTestId('home-todo')).toContainText('Nimic de semnat deocamdată');
    await page.getByTestId('portal-bar-contul-meu').click();
    await expect(page.getByTestId('account-agreement-state')).toContainText(
      'Așteaptă semnătura angajatorului.'
    );
  } else {
    await page.getByTestId('portal-bar-contul-meu').click();
    await expect(page.getByTestId('account-agreement-state')).toHaveText('Așteaptă semnătura ta.');
  }
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await signIn(page, administratorEmail);
  // The trainer's request, addressed to the specialist, waits whatever the employee did.
  await expect(page.getByTestId('home-client-signatures')).toHaveText(
    signing ? 'O semnătură așteaptă la angajați' : '2 semnături așteaptă la angajați'
  );
  await page.getByTestId('home-client-signatures').click();
  await expect(page.getByTestId('client-pending-employee')).toContainText('Pop Ana');

  if (!signing) {
    await expect(page.getByTestId('agreements-none')).toBeVisible();
    return;
  }
  const row = page.getByTestId('agreement-row');
  await expect(row).toHaveAttribute('data-awaiting', 'true');
  await expect(row).toContainText('Pop Ana');
  await row.getByTestId('agreement-sign').click();
  await expect(page.getByTestId('signing-item-check')).toHaveCount(1);
  await expect(page.getByTestId('signing-item')).toContainText('semnezi ca angajator');
  await page.getByTestId('signing-send').click();
  await typeSigningCode(page, administratorEmail);
  await expect(page.getByTestId('signing-result-summary')).toHaveAttribute(
    'data-outcome',
    'signed',
    { timeout: 120_000 }
  );

  await page.goto('/angajati/semnaturi');
  await expect(page.getByTestId('agreements-none')).toBeVisible();
  await expect(page.getByTestId('agreements')).toContainText(
    'Un act adițional semnat electronic de ambele părți'
  );
});

// The evidence is written once, so only the local database's superuser, with the triggers off,
// removes it; the files go with the secret key.
async function removeSignatures() {
  const storage = createClient(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ).storage.from('documents');
  for (const prefix of [
    `signed-sheets/${made.clientId}/${made.employeeId}`,
    `signing-agreements/${made.clientId}/${made.employeeId}`,
  ]) {
    await removeFolder(storage, prefix);
  }

  const projectId = /^project_id = "([^"]+)"/m.exec(
    readFileSync(new URL('../../../../supabase/config.toml', import.meta.url), 'utf8')
  )![1];
  const organization = `'${made.organizationId}'`;
  const accounts = `(select id from auth.users where email in (${made.emails.map((email) => `'${email}'`).join(',')}) or id in (select user_id from public.organization_members where organization_id = ${organization}))`;
  execFileSync(
    'docker',
    [
      'exec',
      '-i',
      `supabase_db_${projectId}`,
      'psql',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-q',
    ],
    {
      input: `
        begin;
        set local session_replication_role = replica;
        delete from public.signing_session_items where session_id in (select id from public.signing_sessions where account_id in ${accounts});
        delete from public.agreement_signatures where organization_id = ${organization};
        delete from public.training_signatures where organization_id = ${organization};
        delete from public.signature_requests where organization_id = ${organization};
        delete from public.signed_sheet_rows where signed_sheet_id in (select id from public.signed_sheets where organization_id = ${organization});
        delete from public.signed_sheets where organization_id = ${organization};
        delete from public.employee_signing_agreements where organization_id = ${organization};
        delete from public.signing_sessions where account_id in ${accounts};
        delete from public.signing_identities where account_id in ${accounts};
        commit;
      `,
      stdio: ['pipe', 'ignore', 'inherit'],
    }
  );
}

async function removeFolder(
  storage: ReturnType<ReturnType<typeof createClient>['storage']['from']>,
  prefix: string
) {
  const { data } = await storage.list(prefix);
  for (const entry of data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) await removeFolder(storage, path);
    else await storage.remove([path]);
  }
}
