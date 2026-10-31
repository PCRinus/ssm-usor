import { execFileSync, spawn } from 'node:child_process';
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { signerOverHttp, type SignSessionResponse } from '@ssm-usor/contracts';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/database.types';
import { generateSigningCa } from '../src/lib/signing-ca';

// The act of signing end to end on the local stack, which CI does not have: the real API over
// HTTP (scripts/e2e-server.ts, whose mailbox keeps the codes), the templates, LibreOffice through
// Gotenberg, the signer container and the documents bucket, with a throwaway certificate
// authority. A member signs a training's trainer and verifier slots, the employee their agreement
// and their trainee slot from the portal, the client administrator the agreement for the
// employer; then the stored sheet and agreement are validated by the signer. Everything it made
// is removed, the evidence too, which only a superuser on the local database can delete.
//
//   GOTENBERG_URL=http://localhost:3300 SIGNER_URL=http://localhost:3301 \
//     pnpm --filter @ssm-usor/api signing:check:local [-- --out /tmp/signing]
//
// With --out, the signed sheet and agreement are written to that folder before the clean-up.

const { GOTENBERG_URL, SIGNER_URL } = process.env;
const port = Number(process.env.PORT ?? 8797);
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
  throw new Error('The signing check only runs against a local Supabase stack.');
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

async function call<T>(token: string, method: string, path: string, body?: unknown) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'signing-check',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
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
  ).json()) as {
    kind: string;
    url: string;
  }[];
  const code = sent
    .filter((each) => each.kind === 'signing-code')
    .at(-1)
    ?.url.slice('code='.length);
  if (!code) throw new Error(`No signing code sent to ${email}.`);
  return code;
}

async function signAs(
  who: { token: string; email: string },
  base: string,
  body: { requestIds: string[]; agreementEmployeeIds?: string[] }
) {
  const session = await call<{
    sessionId: string;
    channel: string;
    addressHint: string;
    items: unknown[];
  }>(who.token, 'POST', `${base}/signing-sessions`, body);
  console.log(
    `  session ${session.channel} to ${session.addressHint}, ${session.items.length} items`
  );
  const wrong = await fetch(`${api}${base}/signing-sessions/${session.sessionId}/sign`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: (await lastCode(who.email)) === '000000' ? '111111' : '000000' }),
  });
  console.log(
    `  a wrong code answers ${wrong.status} ${((await wrong.json()) as { reason: string }).reason}`
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

async function cleanUp() {
  made.server?.kill();
  const employee = made.employee;
  const accounts = made.accounts.map((id) => `'${id}'`).join(',') || 'null';
  if (employee) {
    for (const prefix of [
      `signed-sheets/${employee.client_id}/${employee.id}/ssm-1`,
      `signing-agreements/${employee.client_id}/${employee.id}`,
    ]) {
      const listed = await admin.storage.from('documents').list(prefix);
      const paths = (listed.data ?? []).map((file) => `${prefix}/${file.name}`);
      if (paths.length > 0) await admin.storage.from('documents').remove(paths);
    }
  }
  const records = made.trainingId
    ? `(select id from public.training_records where training_id = '${made.trainingId}')`
    : '(select null::uuid)';
  // Replica mode skips the triggers that keep the evidence, and with them the cascades, so every
  // table is cleared by hand, children first.
  superuserSql(`
    begin;
    set local session_replication_role = replica;
    delete from public.signing_session_items where session_id in (select id from public.signing_sessions where account_id in (${accounts}));
    ${employee ? `delete from public.agreement_signatures where employee_id = '${employee.id}';` : ''}
    delete from public.training_signatures where training_record_id in ${records};
    delete from public.signature_requests where training_record_id in ${records};
    ${
      employee
        ? `delete from public.signed_sheet_rows where signed_sheet_id in (select id from public.signed_sheets where employee_id = '${employee.id}');
           delete from public.signed_sheets where employee_id = '${employee.id}';
           delete from public.employee_signing_agreements where employee_id = '${employee.id}';`
        : ''
    }
    delete from public.training_records where training_id in (select ${made.trainingId ? `'${made.trainingId}'::uuid` : 'null::uuid'});
    ${made.trainingId ? `delete from public.trainings where id = '${made.trainingId}';` : ''}
    delete from public.signing_sessions where account_id in (${accounts});
    delete from public.signing_identities where account_id in (${accounts});
    delete from public.participant_invitations where participant_id in (select id from public.client_participants where user_id in (${accounts}));
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
    const [records, participants, client] = await Promise.all([
      admin.from('training_records').select('id').eq('employee_id', candidate.id).limit(1),
      admin.from('client_participants').select('id').eq('employee_id', candidate.id).limit(1),
      admin
        .from('clients')
        .select('legal_representative_name, legal_representative_role')
        .eq('id', candidate.client_id)
        .single(),
    ]);
    const represented =
      !!client.data?.legal_representative_name && !!client.data.legal_representative_role;
    if (records.data?.length === 0 && participants.data?.length === 0 && represented) {
      made.employee = candidate;
      break;
    }
  }
  const employee = made.employee;
  if (!employee) throw new Error('No seeded employee without trainings and participants.');
  const { client_id: clientId, organization_id: organizationId } = employee;
  const workplace = await admin
    .from('client_workplaces')
    .select('id')
    .eq('client_id', clientId)
    .is('archived_at', null)
    .limit(1);
  const employeeEmail = `signing-check-employee-${run}@example.test`;
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

  const member = await account(`signing-check-member-${run}@example.test`);
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
  const administratorEmail = `signing-check-hr-${run}@example.test`;
  const administrator = await account(administratorEmail);
  const administratorParticipant = must(
    await admin
      .from('client_participants')
      .insert({
        organization_id: organizationId,
        client_id: clientId,
        kind: 'client_administrator',
        full_name: 'Elena VERIFICARE',
        user_id: administrator.id,
      })
      .select('id')
      .single(),
    'administrator participant'
  );
  must(
    await admin.from('participant_invitations').insert({
      organization_id: organizationId,
      client_id: clientId,
      kind: 'client_administrator',
      full_name: 'Elena VERIFICARE',
      channel: 'email',
      address: administratorEmail,
      accepted_at: new Date().toISOString(),
      participant_id: administratorParticipant.id,
    }),
    'administrator invitation'
  );

  await call(
    member.token,
    'PUT',
    `/clients/${clientId}/employees/${employee.id}/signing-agreement/state`,
    {
      state: 'generated',
    }
  );
  const today = new Date().toISOString().slice(0, 10);
  const trainingBody = {
    domain: 'ssm',
    phase: 'periodic',
    heldOn: today,
    durationMinutes: 90,
    material: 'I.P.S.S.M. Art. 61 – 120; utilizarea echipamentului individual de protecție',
    trainer: { name: 'Ana VERIFICARE', jobTitle: 'Inspector SSM' },
    verifier: { name: 'Ana VERIFICARE', jobTitle: 'Inspector SSM' },
    employeeIds: [employee.id],
    signers: { trainer: member.id, verifier: member.id },
  };
  const misnamed = await fetch(`${api}/clients/${clientId}/trainings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${member.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...trainingBody, trainer: { name: 'Ion POP', jobTitle: 'Șef' } }),
  });
  const misnamedReason = ((await misnamed.json()) as { reason?: string }).reason;
  console.log(`a signer who is not the trainer named answers ${misnamed.status} ${misnamedReason}`);
  const { training } = await call<{ training: { id: string; records: { id: string }[] } }>(
    member.token,
    'POST',
    `/clients/${clientId}/trainings`,
    trainingBody
  );
  made.trainingId = training.id;
  const recordId = training.records[0]!.id;
  const detail = await call<{ training: { signers: unknown } }>(
    member.token,
    'GET',
    `/clients/${clientId}/trainings/${training.id}`
  );
  console.log(
    `training ${training.id}, signers on the detail ${JSON.stringify(detail.training.signers)}`
  );

  console.log('member signs the trainer and verifier slots in the app:');
  const mine = await call<{ items: { id: string; slot: string; record: { id: string } }[] }>(
    member.token,
    'GET',
    '/me/signature-requests'
  );
  const memberSigned = await signAs(member, '/me', {
    requestIds: mine.items.filter((item) => item.record.id === recordId).map((item) => item.id),
  });

  console.log('employee signs the agreement and the trainee slot in the portal:');
  const own = await call<{ items: { id: string; agreementState: string | null }[] }>(
    worker.token,
    'GET',
    `/portal/participants/${workerParticipant.id}/signature-requests`
  );
  const workerSigned = await signAs(worker, `/portal/participants/${workerParticipant.id}`, {
    requestIds: own.items.map((item) => item.id),
    agreementEmployeeIds: [employee.id],
  });

  console.log('client administrator signs the agreement for the employer:');
  const awaiting = await call<{ items: { employee: { id: string }; awaitingEmployer: boolean }[] }>(
    administrator.token,
    'GET',
    `/portal/participants/${administratorParticipant.id}/employees/signing-agreements`
  );
  console.log(
    `  awaiting the employer: ${awaiting.items.filter((item) => item.awaitingEmployer).length}`
  );
  const employerSigned = await signAs(
    administrator,
    `/portal/participants/${administratorParticipant.id}`,
    { requestIds: [], agreementEmployeeIds: [employee.id] }
  );

  const slots = await call<{ slots: { slot: string; state: string }[]; hasSignatures: boolean }>(
    member.token,
    'GET',
    `/clients/${clientId}/training-records/${recordId}/signatures`
  );
  console.log(
    `slots ${slots.slots.map((slot) => `${slot.slot}=${slot.state}`).join(' ')}, hasSignatures ${slots.hasSignatures}`
  );

  const sheet = must(
    await admin
      .from('signed_sheets')
      .select('storage_path, version, digest')
      .eq('employee_id', employee.id)
      .eq('domain', 'ssm')
      .single(),
    'signed sheet'
  );
  const sheetBytes = must(
    await admin.storage.from('documents').download(sheet.storage_path),
    'sheet file'
  );
  const sheetValidation = await signer.validate(await sheetBytes.arrayBuffer(), trustRoots);
  if (outFolder) {
    mkdirSync(outFolder, { recursive: true });
    writeFileSync(join(outFolder, 'fisa-ssm.pdf'), new Uint8Array(await sheetBytes.arrayBuffer()));
  }
  console.log(`sheet v${sheet.version}:`);
  for (const each of sheetValidation) {
    console.log(
      `  ${each.field}: ${each.signerName}, intact ${each.intact}, trusted ${each.trusted}, permitted ${each.modificationsPermitted}, certified ${each.certified}`
    );
  }

  const agreementPdf = await call<ArrayBuffer>(
    member.token,
    'GET',
    `/clients/${clientId}/employees/${employee.id}/signing-agreement`
  );
  const agreementValidation = await signer.validate(agreementPdf, trustRoots);
  if (outFolder) writeFileSync(join(outFolder, 'act-aditional.pdf'), new Uint8Array(agreementPdf));
  console.log('agreement, as the member downloads it:');
  for (const each of agreementValidation) {
    console.log(
      `  ${each.field}: ${each.signerName}, intact ${each.intact}, trusted ${each.trusted}, permitted ${each.modificationsPermitted}, certified ${each.certified}`
    );
  }
  const state = await call<{ agreement: { state: string } }>(
    member.token,
    'GET',
    `/clients/${clientId}/employees/${employee.id}/signing-agreement/state`
  );
  console.log(`agreement state ${JSON.stringify(state.agreement)}`);

  const evidence = must(
    await admin
      .from('training_signatures')
      .select(
        'slot, method, signer_name, signer_job_title, channel, address, code_sent_at, code_verified_at, signed_at, digest_before, digest_after, certificate_serial, client_ip, user_agent, signing_session_id'
      )
      .eq('training_record_id', recordId)
      .order('signed_at'),
    'training signatures'
  );
  console.log('training_signatures:');
  for (const row of evidence) console.log(`  ${JSON.stringify(row)}`);
  const agreementEvidence = must(
    await admin
      .from('agreement_signatures')
      .select(
        'party, signer_name, channel, address, signed_at, digest_before, digest_after, certificate_serial, signing_session_id'
      )
      .eq('employee_id', employee.id),
    'agreement signatures'
  );
  console.log('agreement_signatures:');
  for (const row of agreementEvidence) console.log(`  ${JSON.stringify(row)}`);

  console.log('member voids the record, corrects the training and everyone signs again:');
  const voided = await call<{
    slots: { slot: string; state: string; voidReason: string | null }[];
  }>(member.token, 'POST', `/clients/${clientId}/training-records/${recordId}/signatures/void`, {
    reason: 'Durata greșită',
  });
  console.log(`  slots ${voided.slots.map((slot) => `${slot.slot}=${slot.state}`).join(' ')}`);
  const struck = must(
    await admin
      .from('signed_sheet_rows')
      .select('row_key, voided_at, void_noted_at')
      .eq('training_record_id', recordId),
    'struck row'
  );
  console.log(`  rows after the void ${JSON.stringify(struck)}`);
  await call(member.token, 'PUT', `/clients/${clientId}/trainings/${training.id}`, {
    ...trainingBody,
    durationMinutes: 120,
  });
  const corrected = must(
    await admin
      .from('signed_sheet_rows')
      .select('row_key, voided_at, filled_digest')
      .eq('training_record_id', recordId)
      .is('voided_at', null),
    'corrected row'
  );
  console.log(`  the corrected record's row after the save ${JSON.stringify(corrected)}`);
  const mineAgain = await call<{ items: { id: string; record: { id: string } }[] }>(
    member.token,
    'GET',
    '/me/signature-requests'
  );
  // One code a minute per account: the first round's codes went out moments ago.
  await new Promise((resolve) => setTimeout(resolve, 61_000));
  const memberResigned = await signAs(member, '/me', {
    requestIds: mineAgain.items
      .filter((item) => item.record.id === recordId)
      .map((item) => item.id),
  });
  const ownAgain = await call<{ items: { id: string }[] }>(
    worker.token,
    'GET',
    `/portal/participants/${workerParticipant.id}/signature-requests`
  );
  const workerResigned = await signAs(worker, `/portal/participants/${workerParticipant.id}`, {
    requestIds: ownAgain.items.map((item) => item.id),
  });
  const finalSheet = must(
    await admin
      .from('signed_sheets')
      .select('storage_path, version')
      .eq('employee_id', employee.id)
      .eq('domain', 'ssm')
      .single(),
    'signed sheet after the correction'
  );
  const finalBytes = must(
    await admin.storage.from('documents').download(finalSheet.storage_path),
    'sheet file after the correction'
  );
  const finalValidation = await signer.validate(await finalBytes.arrayBuffer(), trustRoots);
  console.log(`sheet v${finalSheet.version} after the correction:`);
  for (const each of finalValidation) {
    console.log(
      `  ${each.field}: ${each.signerName}, intact ${each.intact}, trusted ${each.trusted}, permitted ${each.modificationsPermitted}`
    );
  }
  const rowsAfter = must(
    await admin
      .from('signed_sheet_rows')
      .select('row_key, voided_at, void_noted_at')
      .eq('training_record_id', recordId)
      .order('created_at'),
    'rows after the correction'
  );
  console.log(`rows of the record ${JSON.stringify(rowsAfter)}`);

  const failures = [
    !(misnamed.status === 422 && misnamedReason === 'signer_name_mismatch') &&
      'a signer under another name was not refused',
    struck.some((row) => !row.voided_at) && 'the void did not strike the row',
    corrected.length !== 1 && 'the corrected record has no live row of its own',
    memberResigned.signed.length !== 2 && 'the member did not sign the corrected record',
    workerResigned.signed.length !== 1 && 'the employee did not sign the corrected record',
    finalValidation.length !== 6 && 'the sheet does not carry six signatures after the correction',
    finalValidation.some((each) => !each.intact || !each.modificationsPermitted || !each.trusted) &&
      'a signature does not validate after the correction',
    !(
      rowsAfter.length === 2 &&
      rowsAfter[0]!.voided_at &&
      rowsAfter[0]!.void_noted_at &&
      !rowsAfter[1]!.voided_at
    ) && 'the old row is not marked anulat beside a new live one',
    memberSigned.signed.length !== 2 && 'the member did not sign both slots',
    workerSigned.signed.length !== 1 && 'the employee did not sign the trainee slot',
    !workerSigned.agreements[0]?.signed && 'the employee did not sign the agreement',
    !employerSigned.agreements[0]?.signed && 'the administrator did not sign the agreement',
    state.agreement.state !== 'signed_electronically' &&
      'the agreement is not signed electronically',
    sheetValidation.length !== 3 && 'the sheet does not carry three signatures',
    agreementValidation.length !== 2 && 'the agreement does not carry two signatures',
    [...sheetValidation, ...agreementValidation].some(
      (each) => !each.intact || !each.modificationsPermitted || !each.trusted
    ) && 'a signature does not validate',
    evidence.length !== 3 && 'the record does not have three evidence rows',
    agreementEvidence.length !== 2 && 'the agreement does not have two evidence rows',
  ].filter(Boolean);
  if (failures.length > 0) {
    process.exitCode = 1;
    console.error(failures.join('\n'));
  } else {
    console.log('Every signature validates and every evidence row is there.');
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
