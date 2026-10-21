import {
  knowledgeTestCodeOf,
  knowledgeTestTitleOf,
  samePerson,
  type SignatureSlotState,
  testErrorReasons,
  testGradeLabels,
  testSheetFieldNames,
  type TestSheetSignerSlot,
  type TestSheetSummary,
} from '@ssm-usor/contracts';
import { buildTestSheetData, testSheetTypeKey } from '@ssm-usor/document-engine';
import type { Context } from 'hono';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { builtInTemplates, merge } from '../documents/documents';
import { signedOn } from '../signed-sheets/form';
import { type SignedSheetContext, signedSheetContext } from '../signed-sheets/signed-sheets';
import type { MarkedQuestion } from '../tests/rows';

export const testSheetColumns =
  'id, organization_id, client_id, employee_id, test_result_id, storage_path, digest, version, generated_at, certified_at';

export type TestSheetRow = {
  id: string;
  organization_id: string;
  client_id: string;
  employee_id: string;
  test_result_id: string;
  storage_path: string;
  digest: string;
  version: number;
  generated_at: string;
  certified_at: string | null;
};

type ResultRow = {
  id: string;
  organization_id: string;
  client_id: string;
  employee_id: string;
  domain: 'ssm' | 'psi';
  test: 'hiring' | 'annual';
  taken_on: string;
  grade: 'admis';
  examiner_name: string | null;
  examiner_job_title: string | null;
  source: 'portal' | 'paper';
  attempt_id: string | null;
};

const resultColumns =
  'id, organization_id, client_id, employee_id, domain, test, taken_on, grade, examiner_name, examiner_job_title, source, attempt_id';

/** Everything with the secret key: the callers have read the result as the person they serve. */
export type TestSheetDeps = {
  admin: AdminClient;
  sheets: Pick<SignedSheetContext, 'files' | 'pdf' | 'signer' | 'now'>;
};

export const testSheetDeps = (c: Context<ApiEnv>): TestSheetDeps => ({
  admin: adminClient(c.env),
  sheets: signedSheetContext(c),
});

const signerUnavailable = () =>
  new ApiError(
    'service_unavailable',
    'The signing service could not be reached. Nothing was signed; try again in a moment.',
    undefined,
    'signer_unavailable'
  );

const pdfUnavailable = () =>
  new ApiError(
    'service_unavailable',
    'The PDF could not be made; try again in a moment.',
    undefined,
    'pdf_unavailable'
  );

const sheetBusy = () =>
  new ApiError(
    'conflict',
    'The test sheet changed while it was being written. Try again.',
    undefined,
    'sheet_busy'
  );

export const testSheetNotAvailable = () =>
  new ApiError(
    'not_found',
    'This result has no test sheet: a test taken on paper is signed on the printed test.',
    undefined,
    testErrorReasons.testSheetNotAvailable
  );

function need<T>(service: T | null, unavailable: () => ApiError): T {
  if (!service) throw unavailable();
  return service;
}

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Every version is a file of its own, as a signed sheet's: the evidence's digest before a
// signature names a file that still exists.
const storagePathOf = (
  sheet: Pick<TestSheetRow, 'client_id' | 'employee_id' | 'test_result_id'>,
  version: number
) =>
  `test-sheets/${sheet.client_id}/${sheet.employee_id}/${sheet.test_result_id}/v${version}-${crypto.randomUUID().slice(0, 8)}.pdf`;

const examinerValues = (result: Pick<ResultRow, 'examiner_name' | 'examiner_job_title'>) => ({
  [testSheetFieldNames.examinerName]: result.examiner_name?.trim() ?? '',
  [testSheetFieldNames.examinerJobTitle]: result.examiner_job_title?.trim() ?? '',
});

async function readResult(admin: AdminClient, resultId: string) {
  const { data, error } = await admin
    .from('test_results')
    .select(resultColumns)
    .eq('id', resultId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'test sheet result');
  return data as ResultRow | null;
}

export async function storedTestSheet(admin: AdminClient | DataClient, resultId: string) {
  const { data, error } = await admin
    .from('test_sheets')
    .select(testSheetColumns)
    .eq('test_result_id', resultId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'test sheet');
  return data as TestSheetRow | null;
}

async function drawTestSheet(deps: TestSheetDeps, result: ResultRow) {
  const { admin } = deps;
  const [attempt, employee, client] = await Promise.all([
    admin
      .from('test_attempts')
      .select('questions, score, total, passed')
      .eq('id', result.attempt_id!)
      .maybeSingle(),
    admin
      .from('employees')
      .select('last_name, first_name, job_title, job_positions(name)')
      .eq('id', result.employee_id)
      .eq('client_id', result.client_id)
      .maybeSingle(),
    admin.from('clients').select('legal_name').eq('id', result.client_id).maybeSingle(),
  ]);
  if (attempt.error) throw fromDatabaseError(attempt.error, 'test sheet attempt');
  if (employee.error) throw fromDatabaseError(employee.error, 'test sheet employee');
  if (client.error) throw fromDatabaseError(client.error, 'test sheet client');
  if (!attempt.data?.passed || !employee.data || !client.data) {
    throw new ApiError('not_found', 'The passing attempt of this result could not be read.');
  }
  const position = (employee.data.job_positions as { name: string } | null)?.name?.trim();
  const data = buildTestSheetData({
    // Every plan carries the line for now (docs/document-branding.md).
    branding: true,
    client: { legalName: client.data.legal_name },
    employee: {
      lastName: employee.data.last_name,
      firstName: employee.data.first_name,
      position: position || employee.data.job_title,
    },
    test: {
      code: knowledgeTestCodeOf(result.domain, result.test),
      title: knowledgeTestTitleOf(result.domain, result.test),
    },
    takenOn: result.taken_on,
    questions: (attempt.data.questions as MarkedQuestion[]).map((question) => ({
      text: question.text,
      options: question.options.map((option) => ({ text: option.text })),
      chosen: question.chosen,
    })),
    score: attempt.data.score!,
    total: attempt.data.total,
    grade: testGradeLabels[result.grade],
    examiner:
      result.examiner_name && result.examiner_job_title
        ? { name: result.examiner_name, jobTitle: result.examiner_job_title }
        : null,
  });
  const [template] = await builtInTemplates(admin, [testSheetTypeKey]);
  if (!template) {
    console.error(
      `The template ${testSheetTypeKey} is not registered: run pnpm templates:register.`
    );
    throw new ApiError(
      'service_unavailable',
      'The test sheet template is not available yet.',
      undefined,
      'template_missing'
    );
  }
  return merge(await deps.sheets.files.readTemplate(template.storagePath), data, testSheetTypeKey)
    .bytes;
}

/** Null for a paper result: its test is signed on the printed test, and has no test sheet. */
export async function ensureTestSheet(
  deps: TestSheetDeps,
  resultId: string
): Promise<TestSheetRow | null> {
  const { admin, sheets } = deps;
  const existing = await storedTestSheet(admin, resultId);
  if (existing) return existing;
  const result = await readResult(admin, resultId);
  if (!result || result.source !== 'portal' || !result.attempt_id) return null;

  const docx = await drawTestSheet(deps, result);
  const signer = need(sheets.signer, signerUnavailable);
  const pdf = await need(sheets.pdf, pdfUnavailable).convertForm(docx);
  const prepared = await signer.prepareSheet(
    buffer(pdf),
    Object.values(testSheetFieldNames.signatures)
  );
  const filled = new Uint8Array(await signer.fillFields(prepared, examinerValues(result)));
  const path = storagePathOf(
    {
      client_id: result.client_id,
      employee_id: result.employee_id,
      test_result_id: result.id,
    },
    1
  );
  await sheets.files.writeDocument(path, filled, { replace: false });
  const { data, error } = await admin
    .from('test_sheets')
    .insert({
      organization_id: result.organization_id,
      client_id: result.client_id,
      employee_id: result.employee_id,
      test_result_id: result.id,
      storage_path: path,
      digest: await sha256(filled),
    })
    .select(testSheetColumns)
    .single();
  if (error) {
    await sheets.files.removeDocument(path).catch(() => undefined);
    if (error.code === '23505') return storedTestSheet(admin, resultId);
    throw fromDatabaseError(error, 'store test sheet');
  }
  return data as TestSheetRow;
}

// Serialized by the version, not a Postgres lock, for the signed sheet's reason: a write spans
// calls to the signer, and PostgREST holds no transaction across requests.
async function rewriteTestSheet(
  deps: TestSheetDeps,
  sheetId: string,
  rewrite: (
    sheet: TestSheetRow,
    bytes: Uint8Array
  ) => Promise<{ bytes: Uint8Array; certify?: string }>
): Promise<{ before: TestSheetRow; after: TestSheetRow }> {
  const { admin, sheets } = deps;
  for (let attempt = 0; attempt < 2; attempt++) {
    const read = await admin
      .from('test_sheets')
      .select(testSheetColumns)
      .eq('id', sheetId)
      .maybeSingle();
    if (read.error) throw fromDatabaseError(read.error, 'test sheet');
    const sheet = read.data as TestSheetRow | null;
    if (!sheet) throw new ApiError('not_found', 'The test sheet does not exist.');
    const bytes = await sheets.files.readDocument(sheet.storage_path);
    if ((await sha256(bytes)) !== sheet.digest) {
      console.error(
        `Test sheet ${sheet.id} does not match its digest at version ${sheet.version}.`
      );
      throw new ApiError('internal_error', 'The stored test sheet could not be verified.');
    }
    const next = await rewrite(sheet, bytes);
    const path = storagePathOf(sheet, sheet.version + 1);
    await sheets.files.writeDocument(path, next.bytes, { replace: false });
    const moved = await admin
      .from('test_sheets')
      .update({
        storage_path: path,
        digest: await sha256(next.bytes),
        version: sheet.version + 1,
        ...(next.certify && !sheet.certified_at ? { certified_at: next.certify } : {}),
      })
      .eq('id', sheet.id)
      .eq('version', sheet.version)
      .select(testSheetColumns)
      .maybeSingle();
    if (moved.error) {
      await sheets.files.removeDocument(path).catch(() => undefined);
      throw fromDatabaseError(moved.error, 'advance test sheet');
    }
    if (moved.data) return { before: sheet, after: moved.data as TestSheetRow };
    await sheets.files.removeDocument(path).catch(() => undefined);
  }
  throw sheetBusy();
}

// Never after the examiner signed: the database refuses the change, and the signature locks the
// fields.
export async function refillExaminer(deps: TestSheetDeps, resultId: string) {
  const sheet = await storedTestSheet(deps.admin, resultId);
  if (!sheet) return null;
  const result = await readResult(deps.admin, resultId);
  if (!result) return null;
  const signer = need(deps.sheets.signer, signerUnavailable);
  const { after } = await rewriteTestSheet(deps, sheet.id, async (_, bytes) => ({
    bytes: new Uint8Array(await signer.fillFields(buffer(bytes), examinerValues(result))),
  }));
  return after;
}

export type TestSheetSigner = {
  certificatePem: string;
  chainPem: string[];
  name: string;
};

const slotReason: Record<TestSheetSignerSlot, string> = {
  trainee: 'persoana testată',
  examiner: 'examinator',
};

/**
 * The examiner's signature fills the examiner's fields from the result first, in the same
 * version, so that what the examiner signs names them whatever a refill after a change left.
 */
export async function applyTestSheetSignature(
  deps: TestSheetDeps,
  sheetId: string,
  slot: TestSheetSignerSlot,
  signer: TestSheetSigner,
  sign: (toSign: ArrayBuffer, prepared: ArrayBuffer) => Promise<ArrayBuffer>
) {
  const service = need(deps.sheets.signer, signerUnavailable);
  let signedAt = deps.sheets.now();
  const { before, after } = await rewriteTestSheet(deps, sheetId, async (sheet, stored) => {
    let bytes = stored;
    if (slot === 'examiner') {
      const result = await readResult(deps.admin, sheet.test_result_id);
      if (!result) throw new ApiError('not_found', 'The test result does not exist.');
      bytes = new Uint8Array(await service.fillFields(buffer(bytes), examinerValues(result)));
    }
    signedAt = deps.sheets.now();
    const begun = await service.beginSignature(buffer(bytes), {
      field: testSheetFieldNames.signatures[slot],
      certificatePem: signer.certificatePem,
      chainPem: signer.chainPem,
      reason: `Fișa de test: ${slotReason[slot]}`,
      signedAt: signedAt.toISOString(),
      certify: sheet.certified_at === null,
      lockFields:
        slot === 'examiner'
          ? [testSheetFieldNames.examinerName, testSheetFieldNames.examinerJobTitle]
          : [],
      appearanceLines: [signer.name, 'semnat electronic', signedOn(signedAt)],
    });
    const signature = await sign(begun.toSign, begun.prepared);
    return {
      bytes: new Uint8Array(
        await service.finishSignature(begun.prepared, begun.sessionToken, signature)
      ),
      certify: signedAt.toISOString(),
    };
  });
  return {
    digestBefore: before.digest,
    digestAfter: after.digest,
    version: after.version,
    signedAt,
  };
}

type Candidate = { accountId: string; name: string; member: boolean };

// The members first: the examiner proposed is the specialist or the technician who gives the
// introductory trainings, a member; a participant of the client only when no member matches.
async function examinerCandidates(admin: AdminClient, result: ResultRow): Promise<Candidate[]> {
  const [members, participants] = await Promise.all([
    admin
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', result.organization_id),
    admin
      .from('client_participants')
      .select(
        'user_id, full_name, employees!client_participants_employee_of_client(last_name, first_name)'
      )
      .eq('client_id', result.client_id)
      .is('revoked_at', null)
      .not('user_id', 'is', null)
      .order('created_at')
      .limit(1000),
  ]);
  if (members.error) throw fromDatabaseError(members.error, 'examiner members');
  if (participants.error) throw fromDatabaseError(participants.error, 'examiner participants');
  const memberIds = members.data.map((row) => row.user_id);
  const profiles =
    memberIds.length === 0
      ? { data: [], error: null }
      : await admin.from('profiles').select('user_id, full_name').in('user_id', memberIds);
  if (profiles.error) throw fromDatabaseError(profiles.error, 'examiner profiles');
  return [
    ...profiles.data.map((row) => ({
      accountId: row.user_id,
      name: row.full_name ?? '',
      member: true,
    })),
    ...(
      participants.data as unknown as {
        user_id: string;
        full_name: string | null;
        employees: { last_name: string; first_name: string } | null;
      }[]
    ).map((row) => ({
      accountId: row.user_id,
      name: row.employees
        ? `${row.employees.last_name} ${row.employees.first_name}`
        : (row.full_name ?? ''),
      member: false,
    })),
  ];
}

/** The account the result's examiner is, by name as `signers.ts` matches a slot's; null for paper. */
export async function examinerAccountOf(admin: AdminClient, result: ResultRow) {
  if (!result.examiner_name) return null;
  const candidates = await examinerCandidates(admin, result);
  const matching = candidates.filter((candidate) =>
    samePerson(candidate.name, result.examiner_name!)
  );
  return (matching.find((candidate) => candidate.member) ?? matching[0])?.accountId ?? null;
}

async function traineeAccountOf(admin: AdminClient, sheet: TestSheetRow) {
  const [participants, agreement] = await Promise.all([
    admin
      .from('client_participants')
      .select('user_id, kind')
      .eq('client_id', sheet.client_id)
      .eq('employee_id', sheet.employee_id)
      .is('revoked_at', null)
      .not('user_id', 'is', null)
      .order('created_at')
      .limit(10),
    admin
      .from('employee_signing_agreements')
      .select('state')
      .eq('employee_id', sheet.employee_id)
      .maybeSingle(),
  ]);
  if (participants.error) throw fromDatabaseError(participants.error, 'trainee participant');
  if (agreement.error) throw fromDatabaseError(agreement.error, 'trainee agreement');
  if (agreement.data?.state === 'withdrawn') return null;
  const own =
    participants.data.find((row) => row.kind === 'employee') ?? participants.data[0] ?? null;
  return own?.user_id ?? null;
}

/**
 * A slot nobody can sign electronically is left for a member to mark as signed on paper. No
 * message goes out: the request lists show the requests.
 */
export async function issueTestSheetRequests(
  deps: TestSheetDeps,
  sheet: TestSheetRow,
  issuedBy: string | null
) {
  const { admin } = deps;
  const [live, signatures, result] = await Promise.all([
    admin
      .from('signature_requests')
      .select('slot')
      .eq('test_sheet_id', sheet.id)
      .neq('state', 'void'),
    admin.from('test_sheet_signatures').select('slot').eq('test_sheet_id', sheet.id),
    readResult(admin, sheet.test_result_id),
  ]);
  if (live.error) throw fromDatabaseError(live.error, 'test sheet requests');
  if (signatures.error) throw fromDatabaseError(signatures.error, 'test sheet signatures');
  if (!result) return 0;
  const taken = new Set([...live.data, ...signatures.data].map((row) => row.slot));
  const wanted: [TestSheetSignerSlot, string | null][] = [];
  if (!taken.has('trainee')) wanted.push(['trainee', await traineeAccountOf(admin, sheet)]);
  if (!taken.has('examiner')) wanted.push(['examiner', await examinerAccountOf(admin, result)]);
  let issued = 0;
  for (const [slot, accountId] of wanted) {
    if (!accountId) continue;
    const { error } = await admin.from('signature_requests').insert({
      organization_id: sheet.organization_id,
      client_id: sheet.client_id,
      test_sheet_id: sheet.id,
      slot,
      signer_account_id: accountId,
      issued_by: issuedBy,
    });
    // Another call issued the slot meanwhile.
    if (error?.code === '23505') continue;
    if (error) throw fromDatabaseError(error, 'issue test sheet request');
    issued += 1;
  }
  return issued;
}

/** Best effort: the pass stands either way, and a sheet that failed is drawn up when first read. */
export async function afterTestPass(c: Context<ApiEnv>, resultId: string) {
  try {
    const deps = testSheetDeps(c);
    const sheet = await ensureTestSheet(deps, resultId);
    if (sheet) await issueTestSheetRequests(deps, sheet, null);
  } catch (error) {
    console.error(
      `Test sheet of ${resultId} not drawn up: ${error instanceof ApiError ? (error.reason ?? error.code) : error instanceof Error ? error.name : 'unknown'}`
    );
  }
}

const emptySummary = (available: boolean): TestSheetSummary => ({
  available,
  signed: { trainee: 'unassigned', examiner: 'unassigned' },
});

function slotState(
  slot: TestSheetSignerSlot,
  requests: { slot: string; state: string }[],
  signatures: { slot: string; method: string }[]
): SignatureSlotState {
  const signature = signatures.find((row) => row.slot === slot);
  if (signature) return signature.method === 'paper' ? 'paper' : 'signed';
  const ofSlot = requests.filter((row) => row.slot === slot);
  if (ofSlot.some((row) => row.state === 'pending')) return 'pending';
  if (ofSlot.some((row) => row.state === 'void')) return 'void';
  return 'unassigned';
}

/** Each result's test sheet as the caller's policies show it. */
export async function testSheetSummaries(
  db: DataClient,
  resultIds: string[]
): Promise<Map<string, TestSheetSummary>> {
  const summaries = new Map<string, TestSheetSummary>();
  if (resultIds.length === 0) return summaries;
  const sheets = await db
    .from('test_sheets')
    .select('id, test_result_id')
    .in('test_result_id', resultIds);
  if (sheets.error) throw fromDatabaseError(sheets.error, 'test sheets');
  const sheetIds = sheets.data.map((row) => row.id);
  if (sheetIds.length === 0) return summaries;
  const [requests, signatures] = await Promise.all([
    db
      .from('signature_requests')
      .select('test_sheet_id, slot, state')
      .in('test_sheet_id', sheetIds),
    db
      .from('test_sheet_signatures')
      .select('test_sheet_id, slot, method')
      .in('test_sheet_id', sheetIds),
  ]);
  if (requests.error) throw fromDatabaseError(requests.error, 'test sheet requests');
  if (signatures.error) throw fromDatabaseError(signatures.error, 'test sheet signatures');
  for (const sheet of sheets.data) {
    const ownRequests = requests.data.filter((row) => row.test_sheet_id === sheet.id);
    const ownSignatures = signatures.data.filter((row) => row.test_sheet_id === sheet.id);
    summaries.set(sheet.test_result_id, {
      available: true,
      signed: {
        trainee: slotState('trainee', ownRequests, ownSignatures),
        examiner: slotState('examiner', ownRequests, ownSignatures),
      },
    });
  }
  return summaries;
}

export const summaryOf = (summaries: Map<string, TestSheetSummary>, resultId: string) =>
  summaries.get(resultId) ?? emptySummary(false);

const fileWords = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());

export function testSheetFileName(
  employee: { last_name: string; first_name: string },
  result: { domain: 'ssm' | 'psi'; test: 'hiring' | 'annual'; taken_on: string }
) {
  return (
    [
      'Fisa-de-test',
      knowledgeTestCodeOf(result.domain, result.test),
      ...fileWords(`${employee.last_name} ${employee.first_name}`),
      result.taken_on,
    ].join('-') + '.pdf'
  );
}

async function issueQuietly(deps: TestSheetDeps, sheet: TestSheetRow, resultId: string) {
  try {
    await issueTestSheetRequests(deps, sheet, null);
  } catch (error) {
    console.error(
      `Test sheet requests of ${resultId} not issued: ${error instanceof ApiError ? (error.reason ?? error.code) : 'unknown'}`
    );
  }
}

/**
 * With the secret key, after the caller has read the result: a participant reads no document
 * file, and a test sheet's requests are the API's to issue.
 */
export async function testSheetOf(c: Context<ApiEnv>, resultId: string) {
  const deps = testSheetDeps(c);
  const existing = await storedTestSheet(deps.admin, resultId);
  if (existing) return existing;
  const sheet = await ensureTestSheet(deps, resultId);
  if (!sheet) throw testSheetNotAvailable();
  await issueQuietly(deps, sheet, resultId);
  return sheet;
}

// A stored sheet is asked for its missing requests as well: the pass may have stored it and then
// failed to issue them, and nothing else tries again.
export async function readTestSheet(deps: TestSheetDeps, resultId: string) {
  const sheet = await ensureTestSheet(deps, resultId);
  if (!sheet) throw testSheetNotAvailable();
  await issueQuietly(deps, sheet, resultId);
  return deps.sheets.files.readDocument(sheet.storage_path);
}

export const testSheetPdf = (c: Context<ApiEnv>, resultId: string) =>
  readTestSheet(testSheetDeps(c), resultId);
