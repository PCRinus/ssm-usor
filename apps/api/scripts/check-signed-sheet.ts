import { execFileSync } from 'node:child_process';
import console from 'node:console';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

import type { TrainingDomain } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../src/lib/admin-db';
import type { ApiEnv } from '../src/lib/env';
import { checkToSign } from '../src/lib/signed-attributes';
import {
  applySignature,
  currentSheetPdf,
  ensureSignedSheet,
  placeRecord,
  type SheetSigner,
  signedSheetContext,
  voidRow,
} from '../src/modules/signed-sheets/signed-sheets';

// The signed sheet end to end on the local stack, which CI does not have: the real templates,
// LibreOffice through Gotenberg, the signer container and the documents bucket, with a throwaway
// certificate authority. It records trainings for one seeded employee, signs them, validates the
// result, writes the PDFs to --out, and removes everything it made.
//
//   GOTENBERG_URL=http://localhost:3300 SIGNER_URL=http://localhost:3301 \
//     pnpm --filter @ssm-usor/api signed-sheet:check:local -- --out /tmp/sheets

const { GOTENBERG_URL, SIGNER_URL } = process.env;
const out = process.argv[process.argv.indexOf('--out') + 1];
if (!GOTENBERG_URL || !SIGNER_URL || !process.argv.includes('--out') || !out) {
  console.error('Set GOTENBERG_URL and SIGNER_URL, and pass --out <folder>.');
  process.exit(1);
}

const status = JSON.parse(
  execFileSync('supabase', ['status', '--output', 'json'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
) as { API_URL: string; PUBLISHABLE_KEY: string; SECRET_KEY: string };
const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: status.API_URL,
  SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  GOTENBERG_URL,
  SIGNER_URL,
};
const c = { env, req: { raw: new Request('http://localhost/') } } as unknown as Context<ApiEnv>;
const ctx = signedSheetContext(c);
const db = adminClient(env);

function certificates() {
  const folder = mkdtempSync(join(tmpdir(), 'signed-sheet-'));
  const openssl = (...args: string[]) =>
    execFileSync('openssl', args, { cwd: folder, stdio: ['ignore', 'ignore', 'pipe'] });
  const ec = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes'];
  openssl(
    'req',
    '-x509',
    ...ec,
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-days',
    '30',
    '-subj',
    '/CN=SSM Usor test CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign'
  );
  writeFileSync(
    join(folder, 'leaf.ext'),
    'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,nonRepudiation\n'
  );
  const people = ['Ana Popescu', 'Ion Pop'].map((name, index) => {
    openssl(
      'req',
      ...ec,
      '-keyout',
      `${index}.key`,
      '-out',
      `${index}.csr`,
      '-subj',
      `/CN=${name}`
    );
    openssl(
      'x509',
      '-req',
      '-in',
      `${index}.csr`,
      '-CA',
      'ca.pem',
      '-CAkey',
      'ca.key',
      '-out',
      `${index}.pem`,
      '-days',
      '30',
      '-extfile',
      'leaf.ext'
    );
    return {
      name,
      key: readFileSync(join(folder, `${index}.key`), 'utf8'),
      certificatePem: readFileSync(join(folder, `${index}.pem`), 'utf8'),
    };
  });
  const chain = readFileSync(join(folder, 'ca.pem'), 'utf8');
  rmSync(folder, { recursive: true });
  return { people, chain };
}

async function signerOf(person: { key: string }) {
  const der = Buffer.from(person.key.replace(/-----[^-]+-----|\s/g, ''), 'base64');
  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  return (toSign: ArrayBuffer) =>
    crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, toSign);
}

type SignerOf = SheetSigner & { sign: (toSign: ArrayBuffer) => Promise<ArrayBuffer> };

let chain = '';

// The API's own check of the signer's bytes, run here against real pyHanko output.
const checked = (person: SignerOf) => async (toSign: ArrayBuffer, prepared: ArrayBuffer) => {
  await checkToSign(prepared, toSign, person.certificatePem);
  return person.sign(toSign);
};

const made = {
  trainings: [] as string[],
  employees: new Set<string>(),
  restore: null as { id: string; commute_route: string | null; workplace_id: string | null } | null,
};

async function record(
  employee: { id: string; client_id: string; organization_id: string },
  domain: TrainingDomain,
  phase: 'introductory_general' | 'workplace' | 'periodic' | 'supplementary',
  heldOn: string,
  source: 'app' | 'paper' = 'app'
) {
  const training = await db
    .from('trainings')
    .insert({
      organization_id: employee.organization_id,
      client_id: employee.client_id,
      domain,
      phase,
      held_on: heldOn,
      duration_minutes: phase === 'periodic' ? 90 : 240,
      material:
        'I.P.S.S.M. Art. 61 – 120; IP Sudură Art. 11 – 20; utilizarea echipamentului individual de protecție la sudarea în spații închise',
      trainer_name: 'Ion POP',
      trainer_job_title: 'Șef atelier',
      verifier_name: domain === 'ssm' ? 'Dan MARIN' : null,
      verifier_job_title: domain === 'ssm' ? 'Inspector SSM' : null,
      supplementary_reason: phase === 'supplementary' ? 'after_accident' : null,
      source,
    })
    .select('id')
    .single();
  if (training.error) throw new Error(training.error.message);
  made.trainings.push(training.data.id);
  const row = await db
    .from('training_records')
    .insert({
      organization_id: employee.organization_id,
      client_id: employee.client_id,
      training_id: training.data.id,
      employee_id: employee.id,
      phase,
      occupation: 'Sudor',
      ...(phase === 'workplace'
        ? { admitted_on: heldOn, admitted_by_name: 'Ion POP', admitted_by_job_title: 'Șef atelier' }
        : {}),
    })
    .select('id')
    .single();
  if (row.error) throw new Error(row.error.message);
  return row.data.id;
}

async function cleanUp() {
  for (const employeeId of made.employees) {
    const sheets = await db
      .from('signed_sheets')
      .select('id, storage_path')
      .eq('employee_id', employeeId);
    const ids = (sheets.data ?? []).map((sheet) => sheet.id);
    const prefix = (sheets.data ?? [])[0]?.storage_path.split('/').slice(0, 3).join('/');
    await db.from('signed_sheet_rows').delete().in('signed_sheet_id', ids);
    await db.from('signed_sheets').delete().in('id', ids);
    if (prefix) {
      for (const folder of ['ssm-1', 'ssm-2', 'psi-1']) {
        const listed = await db.storage.from('documents').list(`${prefix}/${folder}`);
        const paths = (listed.data ?? []).map((file) => `${prefix}/${folder}/${file.name}`);
        if (paths.length > 0) await db.storage.from('documents').remove(paths);
      }
    }
  }
  if (made.trainings.length > 0) await db.from('trainings').delete().in('id', made.trainings);
  if (made.restore) {
    const { id, ...columns } = made.restore;
    await db.from('employees').update(columns).eq('id', id);
  }
}

try {
  const { people, chain: authority } = certificates();
  chain = authority;
  const [trainee, trainer] = (await Promise.all(
    people.map(async (person) => ({
      certificatePem: person.certificatePem,
      chainPem: [chain],
      name: person.name,
      jobTitle: 'Sudor',
      sign: await signerOf(person),
    }))
  )) as [SignerOf, SignerOf];
  const employees = await db
    .from('employees')
    .select('id, client_id, organization_id, commute_route, workplace_id')
    .is('archived_at', null)
    .limit(50);
  if (employees.error) throw new Error(employees.error.message);
  let employee: (typeof employees.data)[number] | undefined;
  for (const candidate of employees.data) {
    const records = await db
      .from('training_records')
      .select('id')
      .eq('employee_id', candidate.id)
      .limit(1);
    if (records.data?.length === 0) {
      employee = candidate;
      break;
    }
  }
  if (!employee) throw new Error('No seeded employee without trainings.');
  const workplaceOf = await db
    .from('client_workplaces')
    .select('id')
    .eq('client_id', employee.client_id)
    .is('archived_at', null)
    .limit(1);
  made.restore = {
    id: employee.id,
    commute_route: employee.commute_route,
    workplace_id: employee.workplace_id,
  };
  const filled = await db
    .from('employees')
    .update({
      commute_route: 'Str. Lungă – Str. Fabricii, cu autobuzul 33',
      workplace_id: workplaceOf.data?.[0]?.id ?? null,
    })
    .eq('id', employee.id);
  if (filled.error) throw new Error(filled.error.message);
  made.employees.add(employee.id);
  console.log(`employee ${employee.id}`);

  const paperPeriodic = await record(employee, 'ssm', 'periodic', '2025-04-02', 'paper');
  const introductory = await record(employee, 'ssm', 'introductory_general', '2026-01-05');
  const workplace = await record(employee, 'ssm', 'workplace', '2026-01-06');
  const periodic = await record(employee, 'ssm', 'periodic', '2026-04-03');
  const supplementary = await record(employee, 'ssm', 'supplementary', '2026-05-18');

  const sheet = await ensureSignedSheet(ctx, employee.id, 'ssm');
  console.log(`sheet ${sheet.sequence} v${sheet.version} rows used ${sheet.rowsUsed}`);
  for (const id of [introductory, workplace, periodic, supplementary]) {
    const placed = await placeRecord(ctx, id);
    console.log(`placed ${placed.rowKey} -> v${placed.sheet.version}`);
  }
  for (const [id, slot, person] of [
    [periodic, 'trainee', trainee],
    [periodic, 'trainer', trainer],
    [introductory, 'trainee', trainee],
    [workplace, 'admitter', trainer],
    [supplementary, 'trainee', trainee],
  ] as const) {
    const result = await applySignature(ctx, id, slot, person, checked(person));
    console.log(
      `signed ${slot} -> v${result.version} ${result.digestBefore.slice(0, 8)} -> ${result.digestAfter.slice(0, 8)}`
    );
  }
  // Without evidence rows here, the row is struck as void_training_signatures strikes it.
  await db
    .from('signed_sheet_rows')
    .update({ voided_at: new Date().toISOString() })
    .eq('training_record_id', periodic)
    .is('voided_at', null);
  await voidRow(ctx, periodic);
  const corrected = await placeRecord(ctx, periodic);
  console.log(`voided p row, corrected record on ${corrected.rowKey}`);
  await applySignature(ctx, periodic, 'trainee', trainee, checked(trainee));

  const single = (await currentSheetPdf(ctx, employee.id, 'ssm'))!.pdf;
  writeFileSync(join(out, 'ssm-1.pdf'), single);
  const validations = await ctx.signer!.validate(new Uint8Array(single).buffer, [chain]);
  for (const each of validations) {
    console.log(
      `  ${each.field}: ${each.signerName}, intact ${each.intact}, trusted ${each.trusted}, permitted ${each.modificationsPermitted}, certified ${each.certified}`
    );
  }
  const failed = validations.filter(
    (each) => !each.intact || !each.modificationsPermitted || !each.trusted
  );
  console.log(
    `paper row p1 printed: ${(await db.from('signed_sheet_rows').select('row_key').eq('training_record_id', paperPeriodic)).data?.[0]?.row_key}`
  );

  await db.from('signed_sheets').update({ rows_used: 17 }).eq('id', sheet.id);
  const next = await record(employee, 'ssm', 'periodic', '2026-10-03');
  const continued = await placeRecord(ctx, next);
  console.log(`continuation: ${continued.rowKey} on sheet ${continued.sheet.sequence}`);
  const merged = (await currentSheetPdf(ctx, employee.id, 'ssm'))!;
  writeFileSync(join(out, 'ssm-copie.pdf'), merged.pdf);
  console.log(`merged copy: copy ${merged.copy}`);
  const second = (await currentSheetPdf(ctx, employee.id, 'ssm', { sequence: 2 }))!;
  writeFileSync(join(out, 'ssm-2.pdf'), second.pdf);

  const fire = await record(employee, 'psi', 'periodic', '2026-04-10');
  await placeRecord(ctx, fire);
  await applySignature(ctx, fire, 'trainee', trainee, checked(trainee));
  await applySignature(ctx, fire, 'trainer', trainer, checked(trainer));
  const firePdf = (await currentSheetPdf(ctx, employee.id, 'psi'))!.pdf;
  writeFileSync(join(out, 'psi-1.pdf'), firePdf);
  const fireValidations = await ctx.signer!.validate(new Uint8Array(firePdf).buffer, [chain]);
  console.log(
    `psi: ${fireValidations.map((each) => `${each.field} ${each.intact && each.modificationsPermitted && each.trusted}`).join(', ')}`
  );

  if (
    failed.length > 0 ||
    !merged.copy ||
    fireValidations.some((each) => !each.intact || !each.modificationsPermitted || !each.trusted)
  ) {
    process.exitCode = 1;
    console.error('Some signatures did not validate.');
  } else {
    console.log('Every signature validates and chains to the authority.');
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await cleanUp();
}
