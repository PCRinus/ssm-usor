import { readFileSync } from 'node:fs';

import { documentText } from '@ssm-usor/document-engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adminClient } from '../../lib/admin-db';
import {
  callsTo,
  clientId,
  env,
  fetchMock,
  mockUpstream,
  organizationId,
  type UpstreamRoute,
} from '../signing/upstream.fixture';
import {
  applyTestSheetSignature,
  ensureTestSheet,
  issueTestSheetRequests,
  refillExaminer,
  type TestSheetDeps,
  testSheetFileName,
  type TestSheetRow,
  testSheetSummaries,
} from './test-sheets';

const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const resultId = '7e7e7e7e-0000-4000-8000-000000000001';
const attemptId = 'a7a7a7a7-0000-4000-8000-000000000001';
const sheetId = '75757575-0000-4000-8000-000000000001';
const traineeAccount = 'dddddddd-0000-4000-8000-000000000001';
const memberAccount = 'aaaaaaaa-0000-4000-8000-000000000001';

const template = new Uint8Array(
  readFileSync(
    new URL('../../../../../packages/document-engine/templates/fisa_test.docx', import.meta.url)
  )
);

const resultRow = (overrides: Record<string, unknown> = {}) => ({
  id: resultId,
  organization_id: organizationId,
  client_id: clientId,
  employee_id: employeeId,
  domain: 'ssm',
  test: 'hiring',
  taken_on: '2026-10-21',
  grade: 'admis',
  examiner_name: 'Ana SPECIALIST',
  examiner_job_title: 'Inspector SSM',
  source: 'portal',
  attempt_id: attemptId,
  ...overrides,
});

const sheetRow = (overrides: Partial<TestSheetRow> = {}): TestSheetRow => ({
  id: sheetId,
  organization_id: organizationId,
  client_id: clientId,
  employee_id: employeeId,
  test_result_id: resultId,
  storage_path: `test-sheets/${clientId}/${employeeId}/${resultId}/v1-aaaaaaaa.pdf`,
  digest: '',
  version: 1,
  generated_at: '2026-10-21T09:00:00+00:00',
  certified_at: null,
  ...overrides,
});

const questions = Array.from({ length: 10 }, (_, index) => ({
  question_id: `00024001-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  text: `Întrebarea ${index + 1}?`,
  options: [
    { text: 'Da', correct: true },
    { text: 'Nu', correct: false },
  ],
  chosen: index < 2 ? [1] : [0],
  correct: index >= 2,
  explanation: null,
}));

const files = {
  readTemplate: vi.fn<(path: string) => Promise<Uint8Array>>(),
  readDocument: vi.fn<(path: string) => Promise<Uint8Array>>(),
  writeDocument: vi.fn<(path: string, bytes: Uint8Array) => Promise<void>>(),
  removeDocument: vi.fn<(path: string) => Promise<void>>(),
};
const convertForm = vi.fn<(docx: Uint8Array) => Promise<Uint8Array>>();
const signer = {
  prepareSheet: vi.fn<(pdf: ArrayBuffer, fields: string[]) => Promise<ArrayBuffer>>(),
  fillFields: vi.fn<(pdf: ArrayBuffer, values: Record<string, string>) => Promise<ArrayBuffer>>(),
  beginSignature: vi.fn(),
  finishSignature: vi.fn(),
  validate: vi.fn(),
  stampPages: vi.fn(),
};

const deps = (): TestSheetDeps => ({
  admin: adminClient(env),
  sheets: {
    files,
    pdf: { convertForm } as unknown as TestSheetDeps['sheets']['pdf'],
    signer,
    now: () => new Date('2026-10-21T09:30:00Z'),
  },
});

const bytes = (text: string) => new TextEncoder().encode(text);
const buffer = (text: string) => bytes(text).buffer;

async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(text)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const mock of [...Object.values(files), convertForm, ...Object.values(signer)]) {
    mock.mockReset();
  }
  files.readTemplate.mockResolvedValue(template);
  files.writeDocument.mockResolvedValue(undefined);
  files.removeDocument.mockResolvedValue(undefined);
  convertForm.mockResolvedValue(bytes('%PDF converted'));
  signer.prepareSheet.mockResolvedValue(buffer('%PDF prepared'));
  signer.fillFields.mockImplementation(async (pdf) => pdf);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function generationUpstream(overrides: Record<string, UpstreamRoute> = {}) {
  mockUpstream({
    'GET /rest/v1/test_sheets': () => [],
    'POST /rest/v1/test_sheets': ({ body }) => [{ ...sheetRow(), ...(body as object) }],
    '/rest/v1/test_results': () => [resultRow()],
    '/rest/v1/test_attempts': () => [{ questions, score: 8, total: 10, passed: true }],
    '/rest/v1/employees': () => [
      {
        last_name: 'Popescu',
        first_name: 'Ion',
        job_title: 'Sudor',
        job_positions: { name: 'Sudor MIG-MAG' },
      },
    ],
    '/rest/v1/clients': () => [{ legal_name: 'Fabrica Sigma SRL' }],
    '/rest/v1/document_templates': () => [
      {
        type_key: 'test_sheet',
        title: 'Fișa de test',
        document_template_versions: [
          { id: 'v1', version: 1, storage_path: 'built-in/test_sheet/1.docx' },
          { id: 'v2', version: 2, storage_path: 'built-in/test_sheet/2.docx' },
        ],
      },
    ],
    ...overrides,
  });
}

describe('ensureTestSheet', () => {
  it('draws a pass up from its attempt, makes its signature fields, fills its examiner and stores it', async () => {
    generationUpstream();

    const sheet = await ensureTestSheet(deps(), resultId);

    expect(files.readTemplate).toHaveBeenCalledWith('built-in/test_sheet/2.docx');
    const text = documentText(convertForm.mock.calls[0]![0]);
    expect(text).toContain('POPESCU Ion');
    expect(text).toContain('Sudor MIG-MAG');
    expect(text).toContain('Fabrica Sigma SRL');
    expect(text).toContain('Test de verificare a cunoștințelor la angajare (TASSM)');
    expect(text).toContain('21.10.2026');
    expect(text).toContain('8 din 10 răspunsuri corecte');
    expect(text).toContain('☒ b) Nu');
    expect(signer.prepareSheet.mock.calls[0]![1]).toEqual([
      'test_sig_trainee',
      'test_sig_examiner',
    ]);
    expect(signer.fillFields.mock.calls[0]![1]).toEqual({
      test_examiner_name: 'Ana SPECIALIST',
      test_examiner_job_title: 'Inspector SSM',
    });
    const [path, written] = files.writeDocument.mock.calls[0]!;
    expect(path).toMatch(
      new RegExp(`^test-sheets/${clientId}/${employeeId}/${resultId}/v1-[0-9a-f]{8}\\.pdf$`)
    );
    const [insert] = callsTo('/rest/v1/test_sheets', 'POST');
    expect(insert!.secret).toBe(true);
    expect(insert!.body).toEqual({
      organization_id: organizationId,
      client_id: clientId,
      employee_id: employeeId,
      test_result_id: resultId,
      storage_path: path,
      digest: await sha256(new TextDecoder().decode(written)),
    });
    expect(sheet?.storage_path).toBe(path);
  });

  it('draws a paper result nothing', async () => {
    generationUpstream({
      '/rest/v1/test_results': () => [resultRow({ source: 'paper', attempt_id: null })],
    });

    expect(await ensureTestSheet(deps(), resultId)).toBeNull();
    expect(convertForm).not.toHaveBeenCalled();
  });

  it('keeps a stored sheet as it is: the attempt is frozen, so is its sheet', async () => {
    generationUpstream({ 'GET /rest/v1/test_sheets': () => [sheetRow()] });

    expect((await ensureTestSheet(deps(), resultId))?.id).toBe(sheetId);
    expect(files.writeDocument).not.toHaveBeenCalled();
  });

  it('gives way to a sheet another call stored first, removing its own file', async () => {
    let reads = 0;
    generationUpstream({
      'GET /rest/v1/test_sheets': () => (reads++ === 0 ? [] : [sheetRow()]),
      'POST /rest/v1/test_sheets': () =>
        Response.json({ code: '23505', message: 'duplicate' }, { status: 409 }),
    });

    const sheet = await ensureTestSheet(deps(), resultId);

    expect(sheet?.id).toBe(sheetId);
    expect(files.removeDocument).toHaveBeenCalledWith(files.writeDocument.mock.calls[0]![0]);
  });
});

describe('issueTestSheetRequests', () => {
  function requestsUpstream(overrides: Record<string, UpstreamRoute> = {}) {
    mockUpstream({
      'GET /rest/v1/signature_requests': () => [],
      'POST /rest/v1/signature_requests': () => [],
      '/rest/v1/test_sheet_signatures': () => [],
      '/rest/v1/test_results': () => [resultRow()],
      '/rest/v1/client_participants': ({ url }) =>
        url.searchParams.get('employee_id')
          ? [{ user_id: traineeAccount, kind: 'employee' }]
          : [
              {
                user_id: 'eeeeeeee-0000-4000-8000-000000000001',
                full_name: null,
                employees: { last_name: 'Specialist', first_name: 'Ana' },
              },
            ],
      '/rest/v1/employee_signing_agreements': () => [],
      '/rest/v1/organization_members': () => [{ user_id: memberAccount }],
      '/rest/v1/profiles': () => [{ user_id: memberAccount, full_name: 'Ana Specialist' }],
      ...overrides,
    });
  }

  it("asks the employee's participant as the trainee and the member the examiner is, by name", async () => {
    requestsUpstream();

    expect(await issueTestSheetRequests(deps(), sheetRow(), null)).toBe(2);

    const inserts = callsTo('/rest/v1/signature_requests', 'POST');
    expect(inserts.every((call) => call.secret)).toBe(true);
    expect(inserts.map((call) => call.body)).toEqual([
      {
        organization_id: organizationId,
        client_id: clientId,
        test_sheet_id: sheetId,
        slot: 'trainee',
        signer_account_id: traineeAccount,
        issued_by: null,
      },
      {
        organization_id: organizationId,
        client_id: clientId,
        test_sheet_id: sheetId,
        slot: 'examiner',
        signer_account_id: memberAccount,
        issued_by: null,
      },
    ]);
  });

  it('asks a participant of the client when no member is the examiner', async () => {
    requestsUpstream({
      '/rest/v1/profiles': () => [{ user_id: memberAccount, full_name: 'Dan Pop' }],
    });

    await issueTestSheetRequests(deps(), sheetRow(), memberAccount);

    const examiner = callsTo('/rest/v1/signature_requests', 'POST').find(
      (call) => (call.body as { slot: string }).slot === 'examiner'
    );
    expect(examiner!.body).toMatchObject({
      signer_account_id: 'eeeeeeee-0000-4000-8000-000000000001',
      issued_by: memberAccount,
    });
  });

  it('leaves the examiner to paper when nobody with an account is them, and asks no trainee whose agreement is withdrawn', async () => {
    requestsUpstream({
      '/rest/v1/test_results': () => [resultRow({ examiner_name: 'Ion EXTERN' })],
      '/rest/v1/employee_signing_agreements': () => [{ state: 'withdrawn' }],
    });

    expect(await issueTestSheetRequests(deps(), sheetRow(), null)).toBe(0);
    expect(callsTo('/rest/v1/signature_requests', 'POST')).toHaveLength(0);
  });

  it('asks again only the slots without a live request or a signature', async () => {
    requestsUpstream({
      'GET /rest/v1/signature_requests': () => [{ slot: 'examiner' }],
      '/rest/v1/test_sheet_signatures': () => [{ slot: 'trainee' }],
    });

    expect(await issueTestSheetRequests(deps(), sheetRow(), null)).toBe(0);
    const [live] = callsTo('/rest/v1/signature_requests', 'GET');
    expect(live!.url.searchParams.get('state')).toBe('neq.void');
  });

  it('counts a slot another call requested first as requested', async () => {
    requestsUpstream({
      'POST /rest/v1/signature_requests': () =>
        Response.json({ code: '23505', message: 'duplicate' }, { status: 409 }),
    });

    expect(await issueTestSheetRequests(deps(), sheetRow(), null)).toBe(0);
  });
});

describe('the sheet moving on', () => {
  async function storedUpstream(overrides: Record<string, UpstreamRoute> = {}) {
    const stored = sheetRow({ digest: await sha256('%PDF v1') });
    files.readDocument.mockResolvedValue(bytes('%PDF v1'));
    mockUpstream({
      'GET /rest/v1/test_sheets': () => [stored],
      'PATCH /rest/v1/test_sheets': ({ body }) => [{ ...stored, ...(body as object) }],
      '/rest/v1/test_results': () => [
        resultRow({ examiner_name: 'Dan MARIN', examiner_job_title: 'Evaluator' }),
      ],
      ...overrides,
    });
    return stored;
  }

  it("fills the examiner's fields again from the result as the next version", async () => {
    await storedUpstream();
    signer.fillFields.mockResolvedValue(buffer('%PDF v2'));

    const after = await refillExaminer(deps(), resultId);

    expect(signer.fillFields.mock.calls[0]![1]).toEqual({
      test_examiner_name: 'Dan MARIN',
      test_examiner_job_title: 'Evaluator',
    });
    const [move] = callsTo('/rest/v1/test_sheets', 'PATCH');
    expect(move!.url.searchParams.get('version')).toBe('eq.1');
    expect(move!.body).toMatchObject({ version: 2, digest: await sha256('%PDF v2') });
    expect(after?.version).toBe(2);
  });

  it('refuses a stored file that does not match its digest', async () => {
    await storedUpstream();
    files.readDocument.mockResolvedValue(bytes('%PDF altered'));

    await expect(refillExaminer(deps(), resultId)).rejects.toMatchObject({
      code: 'internal_error',
    });
    expect(files.writeDocument).not.toHaveBeenCalled();
  });

  it("certifies with the first signature and locks the examiner's fields with the examiner's", async () => {
    await storedUpstream();
    signer.beginSignature.mockResolvedValue({
      prepared: buffer('%PDF prepared'),
      toSign: buffer('attributes'),
      sessionToken: 't',
    });
    signer.finishSignature.mockResolvedValue(buffer('%PDF signed'));
    const sign = vi.fn(async () => new ArrayBuffer(64));

    const signed = await applyTestSheetSignature(
      deps(),
      sheetId,
      'examiner',
      { certificatePem: 'CERT', chainPem: ['CA'], name: 'Dan MARIN' },
      sign
    );

    expect(signer.fillFields.mock.calls[0]![1]).toEqual({
      test_examiner_name: 'Dan MARIN',
      test_examiner_job_title: 'Evaluator',
    });
    expect(signer.beginSignature.mock.calls[0]![1]).toEqual({
      field: 'test_sig_examiner',
      certificatePem: 'CERT',
      chainPem: ['CA'],
      reason: 'Fișa de test: examinator',
      signedAt: '2026-10-21T09:30:00.000Z',
      certify: true,
      lockFields: ['test_examiner_name', 'test_examiner_job_title'],
      appearanceLines: ['Dan MARIN', 'semnat electronic', '21.10.2026'],
    });
    const [move] = callsTo('/rest/v1/test_sheets', 'PATCH');
    expect(move!.body).toMatchObject({ version: 2, certified_at: '2026-10-21T09:30:00.000Z' });
    expect(signed.digestBefore).toBe(await sha256('%PDF v1'));
    expect(signed.digestAfter).toBe(await sha256('%PDF signed'));
  });

  it("signs the trainee's field on a certified sheet without certifying it again or locking a field", async () => {
    await storedUpstream({
      'GET /rest/v1/test_sheets': async () => [
        sheetRow({ digest: await sha256('%PDF v1'), certified_at: '2026-10-21T09:00:00Z' }),
      ],
    });
    signer.beginSignature.mockResolvedValue({
      prepared: buffer('%PDF prepared'),
      toSign: buffer('attributes'),
      sessionToken: 't',
    });
    signer.finishSignature.mockResolvedValue(buffer('%PDF signed'));

    await applyTestSheetSignature(
      deps(),
      sheetId,
      'trainee',
      { certificatePem: 'CERT', chainPem: ['CA'], name: 'Popescu Ion' },
      async () => new ArrayBuffer(64)
    );

    expect(signer.fillFields).not.toHaveBeenCalled();
    expect(signer.beginSignature.mock.calls[0]![1]).toMatchObject({
      field: 'test_sig_trainee',
      certify: false,
      lockFields: [],
    });
    expect(callsTo('/rest/v1/test_sheets', 'PATCH')[0]!.body).not.toHaveProperty('certified_at');
  });

  it('tries once more on the newer bytes when another write moved the sheet on, then gives up', async () => {
    await storedUpstream({ 'PATCH /rest/v1/test_sheets': () => [] });
    signer.fillFields.mockResolvedValue(buffer('%PDF v2'));

    await expect(refillExaminer(deps(), resultId)).rejects.toMatchObject({ reason: 'sheet_busy' });
    expect(files.writeDocument).toHaveBeenCalledTimes(2);
    expect(files.removeDocument).toHaveBeenCalledTimes(2);
  });
});

describe('testSheetSummaries', () => {
  it("gives each result's slots as the evidence and the requests have them", async () => {
    mockUpstream({
      '/rest/v1/test_sheets': () => [{ id: sheetId, test_result_id: resultId }],
      '/rest/v1/signature_requests': () => [
        { test_sheet_id: sheetId, slot: 'trainee', state: 'signed' },
        { test_sheet_id: sheetId, slot: 'examiner', state: 'void' },
        { test_sheet_id: sheetId, slot: 'examiner', state: 'pending' },
      ],
      '/rest/v1/test_sheet_signatures': () => [
        { test_sheet_id: sheetId, slot: 'trainee', method: 'electronic' },
      ],
    });

    const summaries = await testSheetSummaries(adminClient(env), [resultId, attemptId]);

    expect(summaries.get(resultId)).toEqual({
      available: true,
      signed: { trainee: 'signed', examiner: 'pending' },
    });
    expect(summaries.has(attemptId)).toBe(false);
  });

  it('asks for nothing without results', async () => {
    mockUpstream({});
    expect((await testSheetSummaries(adminClient(env), [])).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('testSheetFileName', () => {
  it('names the test, the employee without diacritics and the day', () => {
    expect(
      testSheetFileName(
        { last_name: 'Mărgineanu', first_name: 'Ștefan' },
        { domain: 'psi', test: 'annual', taken_on: '2026-10-21' }
      )
    ).toBe('Fisa-de-test-TPSU-Margineanu-Stefan-2026-10-21.pdf');
  });
});
