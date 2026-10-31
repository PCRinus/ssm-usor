import { execFileSync, spawn } from 'node:child_process';
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  type EmployeeTestsResponse,
  signerOverHttp,
  type SignSessionResponse,
} from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { generateSigningCa } from '../src/lib/signing-ca';

// The test sheet of ADR 024 end to end on the local stack, as check-signing.ts does for the
// training records: the real API over HTTP, the templates, LibreOffice through Gotenberg, the
// signer container and the documents bucket, with a throwaway certificate authority. A seeded
// employee is trained, sits the hiring test in the portal and passes; the sheet is drawn up with
// its two requests; the employee signs the sheet and the training record in one session, the
// member changes the examiner and back, then signs the sheet and the record in one session; the
// examiner can no longer change; the stored sheet is validated by the signer. Everything it made
// is removed, which only a superuser on the local database can do for the evidence.
//
//   GOTENBERG_URL=http://localhost:3300 SIGNER_URL=http://localhost:3301 \
//     pnpm --filter @ssm-usor/api test-sheet:check:local [-- --out /tmp/test-sheet]

const { GOTENBERG_URL, SIGNER_URL } = process.env;
const port = Number(process.env.PORT ?? 8798);
const outFolder = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : undefined;
if (!GOTENBERG_URL || !SIGNER_URL) {
  console.error('Set GOTENBERG_URL and SIGNER_URL.');
  process.exit(1);
}

const apiFolder = fileURLToPath(new URL('..', import.meta.url));
const repository = fileURLToPath(new URL('../../../', import.meta.url));
const status = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], {
    cwd: repository,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
) as { API_URL: string; PUBLISHABLE_KEY: string; SECRET_KEY: string };
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(status.API_URL)) {
  throw new Error('The test sheet check only runs against a local Supabase stack.');
}
const projectId = /^project_id = "([^"]+)"/m.exec(
  readFileSync(new URL('supabase/config.toml', `file://${repository}`), 'utf8')
)![1];

const admin = createClient<Database>(status.API_URL, status.SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const api = `http://127.0.0.1:${port}`;

const signer = signerOverHttp(async (route, body) => {
  const response = await fetch(new URL(route, SIGNER_URL), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`signer ${route} answered ${response.status}`);
  return response.json();
});

const run = Math.random().toString(36).slice(2, 8);
const made = {
  accounts: [] as string[],
  trainingId: null as string | null,
  employee: null as {
    id: string;
    client_id: string;
    organization_id: string;
    email: string | null;
    commute_route: string | null;
    workplace_id: string | null;
    last_name: string;
    first_name: string;
  } | null,
  server: null as ReturnType<typeof spawn> | null,
};

function must<R extends { data: unknown; error: { message: string } | null }>(
  result: R,
  what: string
) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data as NonNullable<R['data']>;
}

// Turnstile's dummy token, the only one the local stack's test secret accepts
// (supabase/config.toml).
const captchaToken = 'XXXX.DUMMY.TOKEN.XXXX';

async function account(email: string) {
  const password = `Check-${crypto.randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(`create ${email}: ${created.error.message}`);
  made.accounts.push(created.data.user.id);
  const session = await createClient(status.API_URL, status.PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.signInWithPassword({ email, password, options: { captchaToken } });
  if (session.error) throw new Error(`sign in ${email}: ${session.error.message}`);
  return { id: created.data.user.id, email, token: session.data.session.access_token };
}

async function send(token: string, method: string, path: string, body?: unknown) {
  return fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'test-sheet-check',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call<T>(token: string, method: string, path: string, body?: unknown) {
  const response = await send(token, method, path, body);
  const type = response.headers.get('Content-Type') ?? '';
  const answer = type.includes('json') ? await response.json() : await response.arrayBuffer();
  if (!response.ok) {
    throw new Error(`${method} ${path} answered ${response.status}: ${JSON.stringify(answer)}`);
  }
  return answer as T;
}

async function lastCode(email: string) {
  const sent = (await (
    await fetch(`${api}/__e2e/emails?to=${encodeURIComponent(email)}`)
  ).json()) as { kind: string; url: string }[];
  const code = sent
    .filter((each) => each.kind === 'signing-code')
    .at(-1)
    ?.url.slice('code='.length);
  if (!code) throw new Error(`No signing code sent to ${email}.`);
  return code;
}

async function signAs(who: { token: string; email: string }, base: string, requestIds: string[]) {
  const session = await call<{ sessionId: string; items: unknown[] }>(
    who.token,
    'POST',
    `${base}/signing-sessions`,
    { requestIds }
  );
  const signed = await call<SignSessionResponse>(
    who.token,
    'POST',
    `${base}/signing-sessions/${session.sessionId}/sign`,
    { code: await lastCode(who.email) }
  );
  console.log(`  signed ${JSON.stringify(signed)}`);
  return signed;
}

function startServer() {
  return new Promise<void>((resolve, reject) => {
    const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/e2e-server.ts'], {
      cwd: apiFolder,
      env: {
        ...process.env,
        PORT: String(port),
        SUPABASE_URL: status.API_URL,
        SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
        SUPABASE_SECRET_KEY: status.SECRET_KEY,
        GOTENBERG_URL,
        SIGNER_URL,
        PDF_CONVERSION: '',
        ...secrets,
      },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    made.server = server;
    server.on('exit', (code) => reject(new Error(`The API stopped with ${code}.`)));
    server.stdout!.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('e2e API on port')) resolve();
    });
  });
}

function superuserSql(sql: string) {
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
    { input: sql, stdio: ['pipe', 'ignore', 'inherit'] }
  );
}

async function removeFolder(prefix: string) {
  const listed = await admin.storage.from('documents').list(prefix);
  for (const entry of listed.data ?? []) {
    const path = `${prefix}/${entry.name}`;
    if (entry.id === null) await removeFolder(path);
    else await admin.storage.from('documents').remove([path]);
  }
}

async function cleanUp() {
  made.server?.kill();
  const employee = made.employee;
  const accounts = made.accounts.map((id) => `'${id}'`).join(',') || 'null';
  if (employee) {
    await removeFolder(
      `${employee.organization_id}/test-sheets/${employee.client_id}/${employee.id}`
    );
    await removeFolder(
      `${employee.organization_id}/signed-sheets/${employee.client_id}/${employee.id}`
    );
  }
  const of = employee ? `'${employee.id}'` : 'null';
  // Replica mode skips the triggers that keep the evidence, and with them the cascades, so every
  // table is cleared by hand, children first.
  superuserSql(`
    begin;
    set local session_replication_role = replica;
    delete from public.signing_session_items where session_id in (select id from public.signing_sessions where account_id in (${accounts}));
    delete from public.test_sheet_signatures where test_sheet_id in (select id from public.test_sheets where employee_id = ${of});
    delete from public.training_signatures where training_record_id in (select id from public.training_records where employee_id = ${of});
    delete from public.signature_requests where test_sheet_id in (select id from public.test_sheets where employee_id = ${of})
      or training_record_id in (select id from public.training_records where employee_id = ${of});
    delete from public.test_sheets where employee_id = ${of};
    delete from public.signed_sheet_rows where signed_sheet_id in (select id from public.signed_sheets where employee_id = ${of});
    delete from public.signed_sheets where employee_id = ${of};
    delete from public.test_results where employee_id = ${of};
    delete from public.test_attempt_keys where attempt_id in (select id from public.test_attempts where employee_id = ${of});
    delete from public.test_attempts where employee_id = ${of};
    delete from public.training_records where employee_id = ${of};
    ${made.trainingId ? `delete from public.trainings where id = '${made.trainingId}';` : ''}
    delete from public.signing_sessions where account_id in (${accounts});
    delete from public.signing_identities where account_id in (${accounts});
    delete from public.client_participants where user_id in (${accounts});
    delete from public.organization_members where user_id in (${accounts});
    delete from public.profiles where user_id in (${accounts});
    commit;
  `);
  for (const id of made.accounts) await admin.auth.admin.deleteUser(id);
  if (employee) {
    const { id, email, commute_route, workplace_id } = employee;
    await admin.from('employees').update({ email, commute_route, workplace_id }).eq('id', id);
  }
}

type Requests = {
  items: { id: string; kind: string; label: string; slot: string; testSheet: unknown }[];
};

const secrets = await generateSigningCa();
const trustRoots = [secrets.SIGNING_CA_CERT];

try {
  await startServer();
  console.log(`API on ${api}`);

  const candidates = must(
    await admin
      .from('employees')
      .select(
        'id, client_id, organization_id, email, commute_route, workplace_id, last_name, first_name'
      )
      .is('archived_at', null)
      .limit(100),
    'employees'
  );
  for (const candidate of candidates) {
    const [records, participants, results] = await Promise.all([
      admin.from('training_records').select('id').eq('employee_id', candidate.id).limit(1),
      admin.from('client_participants').select('id').eq('employee_id', candidate.id).limit(1),
      admin.from('test_results').select('id').eq('employee_id', candidate.id).limit(1),
    ]);
    if (
      records.data?.length === 0 &&
      participants.data?.length === 0 &&
      results.data?.length === 0
    ) {
      made.employee = candidate;
      break;
    }
  }
  const employee = made.employee;
  if (!employee) throw new Error('No seeded employee without trainings, tests and participants.');
  const { client_id: clientId, organization_id: organizationId } = employee;
  const workplace = await admin
    .from('client_workplaces')
    .select('id')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .limit(1);
  const employeeEmail = `test-sheet-check-employee-${run}@example.test`;
  must(
    await admin
      .from('employees')
      .update({
        email: employeeEmail,
        commute_route: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
        workplace_id: workplace.data?.[0]?.id ?? null,
      })
      .eq('id', employee.id),
    'employee'
  );
  console.log(`employee ${employee.last_name} ${employee.first_name} of client ${clientId}`);

  const member = await account(`test-sheet-check-member-${run}@example.test`);
  must(
    await admin.from('profiles').insert({ user_id: member.id, full_name: 'Ana VERIFICARE' }),
    'profile'
  );
  must(
    await admin
      .from('organization_members')
      .insert({ user_id: member.id, organization_id: organizationId, role: 'specialist' }),
    'membership'
  );
  const worker = await account(employeeEmail);
  const workerParticipant = must(
    await admin
      .from('client_participants')
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        kind: 'employee',
        employee_id: employee.id,
        user_id: worker.id,
      })
      .select('id')
      .single(),
    'employee participant'
  );
  const portal = `/portal/participants/${workerParticipant.id}`;

  const today = new Date().toISOString().slice(0, 10);
  const { training } = await call<{ training: { id: string; records: { id: string }[] } }>(
    member.token,
    'POST',
    `/clients/${clientId}/trainings`,
    {
      domain: 'ssm',
      phase: 'introductory_general',
      heldOn: today,
      durationMinutes: 480,
      material: 'Legea 319/2006; H.G. 1425/2006; tematica instruirii introductiv-generale',
      trainer: { name: 'Ana VERIFICARE', jobTitle: 'Inspector SSM' },
      employeeIds: [employee.id],
      signers: { trainer: member.id },
    }
  );
  made.trainingId = training.id;
  console.log(`introductory training ${training.id}`);

  const { attempt } = await call<{
    attempt: { id: string; questions: { options: unknown[] }[] };
  }>(worker.token, 'POST', `${portal}/tests/ssm/hiring/attempts`);
  const key = must(
    await admin.from('test_attempt_keys').select('key').eq('attempt_id', attempt.id).single(),
    'attempt key'
  ).key as { correct: number[] }[];
  for (const [index, question] of attempt.questions.entries()) {
    const correct = key[index]!.correct;
    const chosen = index < 2 ? [(correct[0]! + 1) % question.options.length] : correct;
    await call(worker.token, 'PUT', `${portal}/test-attempts/${attempt.id}/answers/${index}`, {
      chosen,
    });
  }
  const outcome = await call<{ score: number; total: number; passed: boolean }>(
    worker.token,
    'POST',
    `${portal}/test-attempts/${attempt.id}/finish`
  );
  console.log(`attempt finished ${outcome.score} of ${outcome.total}, passed ${outcome.passed}`);

  const testsPath = `/clients/${clientId}/employees/${employee.id}/tests`;
  const afterPass = await call<EmployeeTestsResponse>(member.token, 'GET', testsPath);
  const result = afterPass.ssm.results[0]!;
  console.log(`result ${result.id}, sheet ${JSON.stringify(result.sheet)}`);

  console.log('the employee signs the test sheet and the training record in one session:');
  const own = await call<Requests>(worker.token, 'GET', `${portal}/signature-requests`);
  console.log(
    `  listed ${own.items.map((item) => `${item.kind}:${item.slot} ${item.label}`).join('; ')}`
  );
  const workerSigned = await signAs(
    worker,
    portal,
    own.items.map((item) => item.id)
  );

  const resultPath = `${testsPath}/results/${result.id}`;
  await call(member.token, 'PATCH', resultPath, {
    examiner: { name: 'Ion EXAMINATOR', jobTitle: 'Inspector SSM' },
  });
  const changed = await call<EmployeeTestsResponse>(member.token, 'GET', testsPath);
  console.log(
    `after a change to an examiner without an account ${JSON.stringify(changed.ssm.results[0]!.sheet)}`
  );
  await call(member.token, 'PATCH', resultPath, {
    examiner: { name: 'Ana VERIFICARE', jobTitle: 'Inspector SSM' },
  });
  const restored = await call<EmployeeTestsResponse>(member.token, 'GET', testsPath);
  console.log(`after the change back ${JSON.stringify(restored.ssm.results[0]!.sheet)}`);

  console.log('the member signs the test sheet and the training record in one session:');
  const mine = await call<Requests>(member.token, 'GET', '/me/signature-requests');
  console.log(
    `  listed ${mine.items.map((item) => `${item.kind}:${item.slot} ${item.label}`).join('; ')}`
  );
  const memberSigned = await signAs(
    member,
    '/me',
    mine.items.map((item) => item.id)
  );

  const refused = await send(member.token, 'PATCH', resultPath, {
    examiner: { name: 'Ion EXAMINATOR', jobTitle: 'Inspector SSM' },
  });
  const refusedReason = ((await refused.json()) as { reason?: string }).reason;
  console.log(`a change after the examiner signed answers ${refused.status} ${refusedReason}`);

  const settled = await call<EmployeeTestsResponse>(member.token, 'GET', testsPath);
  const portalTests = await call<EmployeeTestsResponse>(worker.token, 'GET', `${portal}/tests`);
  console.log(`settled ${JSON.stringify(settled.ssm.results[0]!.sheet)}`);

  const sheetPdf = await call<ArrayBuffer>(member.token, 'GET', `${resultPath}/sheet`);
  const portalPdf = await call<ArrayBuffer>(
    worker.token,
    'GET',
    `${portal}/tests/results/${result.id}/sheet`
  );
  if (outFolder) {
    mkdirSync(outFolder, { recursive: true });
    writeFileSync(join(outFolder, 'fisa-de-test.pdf'), new Uint8Array(sheetPdf));
  }
  const validation = await signer.validate(sheetPdf, trustRoots);
  for (const each of validation) {
    console.log(
      `  ${each.field}: ${each.signerName}, intact ${each.intact}, trusted ${each.trusted}, permitted ${each.modificationsPermitted}, certified ${each.certified}`
    );
  }
  const stored = must(
    await admin
      .from('test_sheets')
      .select('id, version, certified_at')
      .eq('test_result_id', result.id)
      .single(),
    'test sheet'
  );
  const evidence = must(
    await admin
      .from('test_sheet_signatures')
      .select(
        'slot, method, signer_name, signer_job_title, channel, digest_before, digest_after, signing_session_id'
      )
      .eq('test_sheet_id', stored.id)
      .order('signed_at'),
    'test sheet signatures'
  );
  console.log(`test sheet v${stored.version}, certified ${stored.certified_at}`);
  for (const row of evidence) console.log(`  ${JSON.stringify(row)}`);
  const requests = must(
    await admin
      .from('signature_requests')
      .select('slot, state, void_reason')
      .eq('test_sheet_id', stored.id)
      .order('created_at'),
    'test sheet requests'
  );
  console.log(`requests ${JSON.stringify(requests)}`);

  const failures = [
    !outcome.passed && 'the attempt did not pass',
    !(
      result.sheet.available &&
      result.sheet.signed.trainee === 'pending' &&
      result.sheet.signed.examiner === 'pending'
    ) && 'the pass did not draw the sheet up with both requests',
    !own.items.some((item) => item.kind === 'test_sheet') &&
      'the employee does not see the test sheet among their requests',
    !(workerSigned.signed.length === 2 && workerSigned.failed.length === 0) &&
      'the employee did not sign both items of the mixed session',
    changed.ssm.results[0]!.sheet.signed.examiner !== 'void' &&
      'a change of examiner did not void the examiner request',
    restored.ssm.results[0]!.sheet.signed.examiner !== 'pending' &&
      'the change back did not request the examiner again',
    !(memberSigned.signed.length === 2 && memberSigned.failed.length === 0) &&
      'the member did not sign both items of the mixed session',
    !(refused.status === 409 && refusedReason === 'examiner_signed') &&
      'the examiner changed after signing',
    !(
      settled.ssm.results[0]!.sheet.signed.trainee === 'signed' &&
      settled.ssm.results[0]!.sheet.signed.examiner === 'signed'
    ) && 'the sheet does not show both slots signed',
    portalTests.ssm.results[0]!.sheet.signed.examiner !== 'signed' &&
      'the portal does not show the examiner signed',
    portalPdf.byteLength !== sheetPdf.byteLength && 'the portal reads another file than the app',
    validation.length !== 2 && 'the sheet does not carry two signatures',
    validation.some((each) => !each.intact || !each.modificationsPermitted || !each.trusted) &&
      'a signature does not validate',
    !validation[0]?.certified && 'the first signature does not certify the sheet',
    evidence.length !== 2 && 'the sheet does not have two evidence rows',
  ].filter(Boolean);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(failures.join('\n'));
  } else {
    console.log('The test sheet is drawn up, requested, signed by both and validates.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  try {
    await cleanUp();
    console.log('Cleaned up.');
  } catch (error) {
    console.error('Clean-up failed:', error);
    process.exitCode = 1;
  }
}
