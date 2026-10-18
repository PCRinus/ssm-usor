import { readFileSync } from 'node:fs';

import {
  type MailService,
  signingSessionResponseSchema,
  signSessionResponseSchema,
  type SmsService,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createApp } from '../../app';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { applySignature, placeRecord } from '../signed-sheets/signed-sheets';
import { agreementDigest } from './agreement-signing';
import { addressHint, clientIpOf } from './session-signing';
import {
  callsTo,
  clientId,
  env,
  fetchMock,
  mockUpstream,
  organizationId,
  type UpstreamCall,
  type UpstreamRoute,
  user,
} from './upstream.fixture';

const sheetFiles = {
  readTemplate: vi.fn<(path: string) => Promise<Uint8Array>>(),
  readDocument: vi.fn<(path: string) => Promise<Uint8Array>>(),
  writeDocument: vi.fn<(path: string, bytes: Uint8Array) => Promise<void>>(),
  removeDocument: vi.fn<(path: string) => Promise<void>>(),
};
const sheetPdf = { convertForm: vi.fn<(docx: Uint8Array) => Promise<Uint8Array>>() };
const sheetSigner = {
  prepareSheet: vi.fn<(pdf: ArrayBuffer, fields: string[]) => Promise<ArrayBuffer>>(),
  fillFields: vi.fn<(pdf: ArrayBuffer, values: Record<string, string>) => Promise<ArrayBuffer>>(
    async (pdf) => pdf
  ),
  beginSignature:
    vi.fn<
      (
        pdf: ArrayBuffer,
        options: Record<string, unknown>
      ) => Promise<{ prepared: ArrayBuffer; toSign: ArrayBuffer; sessionToken: string }>
    >(),
  finishSignature: vi.fn<(...args: unknown[]) => Promise<ArrayBuffer>>(),
};

vi.mock('../signed-sheets/signed-sheets', () => ({
  signedSheetContext: () => ({ files: sheetFiles, pdf: sheetPdf, signer: sheetSigner }),
  placeRecord: vi.fn(),
  applySignature: vi.fn(),
}));

vi.mock('../../lib/signed-attributes', () => ({ checkToSign: vi.fn(async () => undefined) }));

const identityFor = vi.fn(async (_accountId: string, name: string) => ({
  certificatePem: `CERT ${name}`,
  certificateSerial: '0a1b',
}));
const signWithIdentity = vi.fn(async () => new ArrayBuffer(64));

vi.mock('./identities', () => ({
  createSigningIdentities: async () => ({ chainPem: ['CA'], identityFor, signWithIdentity }),
}));

const sessionId = '5e5e5e5e-0000-4000-8000-000000000001';
const participantId = '88888888-0000-4000-8000-000000000001';
const employeeId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const recordA = 'e0000000-0000-4000-8000-000000000001';
const recordB = 'e0000000-0000-4000-8000-000000000002';
const requestA = 'f0000000-0000-4000-8000-000000000001';
const requestB = 'f0000000-0000-4000-8000-000000000002';

const sendSigningCodeEmail = vi.fn<MailService['sendSigningCode']>();
const sendSigningCodeSms = vi.fn<SmsService['sendSigningCode']>();
const signingEnv = {
  ...env,
  GOTENBERG_URL: 'http://gotenberg.test',
  SIGNER_URL: 'http://signer.test',
  MAIL: { sendSigningCode: sendSigningCodeEmail } as unknown as MailService,
  SMS: { sendSigningCode: sendSigningCodeSms } as unknown as SmsService,
} as ApiEnv['Bindings'];

const send = (path: string, body: unknown, bindings: ApiEnv['Bindings'] = signingEnv) =>
  createApp().request(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer user-token',
        'User-Agent': 'Firefox',
        'CF-Connecting-IP': '203.0.113.7',
      },
      body: JSON.stringify(body),
    },
    bindings
  );

const participation = (kind: string, employee: string | null) => ({
  participant_id: participantId,
  organization_id: organizationId,
  organization_name: 'Protect SSM',
  client_id: clientId,
  client_name: 'Fabrica Sigma SRL',
  kind,
  employee_id: employee,
  full_name: kind === 'employee' ? 'Popescu Ion' : 'Elena Radu',
  notice_version: '2026-10-17',
  language: null,
});

const portal = (kind: string) => ({
  '/rest/v1/rpc/accept_participant_invitations': () => 0,
  '/rest/v1/rpc/current_participations': () => [
    participation(kind, kind === 'employee' ? employeeId : null),
  ],
});

async function hashOf(code: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${sessionId}:${code}`)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    account_id: user.id,
    place: 'app',
    participant_id: null,
    channel: 'email',
    address: 'ana@example.ro',
    code_hash: await hashOf('123456'),
    code_sent_at: new Date(Date.now() - 60_000).toISOString(),
    expires_at: new Date(Date.now() + 9 * 60_000).toISOString(),
    attempts: 0,
    verified_at: null,
    client_ip: null,
    user_agent: 'Firefox',
    ...overrides,
  };
}

/** The session store as PostgREST answers it: the row, the attempt and the verification. */
function sessions(row: Record<string, unknown> | null) {
  return ({ method, body }: UpstreamCall) => {
    if (method === 'GET') return row ? [row] : [];
    if (method === 'PATCH') {
      const change = body as Record<string, unknown>;
      if ('attempts' in change) return [{ id: sessionId }];
      return [{ ...row, ...change }];
    }
    return [];
  };
}

/** The database function that inserts a session unless a code went out in the last minute. */
const createSessionRpc =
  (retryAfterSeconds = 0) =>
  () =>
    retryAfterSeconds > 0
      ? { retry_after_seconds: retryAfterSeconds, code_sent_at: null, expires_at: null }
      : {
          retry_after_seconds: 0,
          code_sent_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600_000).toISOString(),
        };

const memberAccount = () => ({ ...user, email: 'Ana@Example.ro' });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sendSigningCodeEmail.mockReset().mockResolvedValue({ id: 'm1' });
  sendSigningCodeSms.mockReset().mockResolvedValue({ id: 's1' });
  identityFor.mockClear();
  signWithIdentity.mockClear();
  vi.mocked(placeRecord)
    .mockReset()
    .mockResolvedValue({} as never);
  vi.mocked(applySignature)
    .mockReset()
    .mockResolvedValue({
      digestBefore: 'aa',
      digestAfter: 'bb',
      sheetId: 's1',
      version: 3,
      signedAt: new Date('2026-10-18T09:30:00Z'),
    });
  for (const mock of [
    ...Object.values(sheetFiles),
    ...Object.values(sheetPdf),
    ...Object.values(sheetSigner),
  ]) {
    mock.mockReset();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('addressHint', () => {
  it('keeps the first letter and the domain of an email, and the network and the last two digits of a phone', () => {
    expect(addressHint('email', 'ion.popescu@example.ro')).toBe('i***@example.ro');
    expect(addressHint('sms', '+40722000112')).toBe('+40 7** *** *12');
    expect(addressHint('sms', '+4915112345678')).toBe('+49 *********78');
  });
});

describe('clientIpOf', () => {
  const of = (header: string | undefined) =>
    clientIpOf({ req: { header: () => header } } as unknown as Context<ApiEnv>);

  it('keeps an IPv4 or IPv6 address and drops anything else', () => {
    expect(of('203.0.113.7')).toBe('203.0.113.7');
    expect(of('2001:db8::1')).toBe('2001:db8::1');
    expect(of('203.0.113.7, 10.0.0.1')).toBeNull();
    expect(of('999.1.1.1')).toBeNull();
    expect(of('not an address')).toBeNull();
    expect(of(undefined)).toBeNull();
  });
});

describe('POST /me/signing-sessions', () => {
  function memberUpstream(overrides: Record<string, UpstreamRoute> = {}) {
    mockUpstream({
      '/rest/v1/signature_requests': () => [
        { id: requestA, slot: 'trainer' },
        { id: requestB, slot: 'verifier' },
      ],
      [`/auth/v1/admin/users/${user.id}`]: memberAccount,
      '/rest/v1/rpc/create_signing_session': createSessionRpc(),
      '/rest/v1/signing_sessions': sessions(null),
      '/rest/v1/signing_session_items': () => [],
      ...overrides,
    });
  }

  it("sends one code to the member's email for the requests listed, which the session keeps in order", async () => {
    memberUpstream();

    const response = await send('/me/signing-sessions', { requestIds: [requestB, requestA] });

    expect(response.status).toBe(201);
    const body = signingSessionResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      channel: 'email',
      addressHint: 'a***@example.ro',
      items: [
        { kind: 'request', requestId: requestB },
        { kind: 'request', requestId: requestA },
      ],
    });
    const [lookup] = callsTo('/rest/v1/signature_requests');
    expect(lookup!.secret).toBe(false);
    expect(lookup!.url.searchParams.get('signer_account_id')).toBe(`eq.${user.id}`);
    expect(lookup!.url.searchParams.get('state')).toBe('eq.pending');
    expect(lookup!.url.searchParams.get('organization_id')).toBe(`eq.${organizationId}`);
    expect(lookup!.url.searchParams.get('slot')).toBe('neq.trainee');
    const [session] = callsTo('/rest/v1/rpc/create_signing_session', 'POST');
    expect(session!.secret).toBe(true);
    expect(session!.body).toMatchObject({
      p_id: body.sessionId,
      p_account_id: user.id,
      p_place: 'app',
      p_channel: 'email',
      p_address: 'ana@example.ro',
      p_client_ip: '203.0.113.7',
      p_user_agent: 'Firefox',
      p_interval_seconds: 60,
    });
    expect(session!.body).not.toHaveProperty('p_participant_id');
    const [items] = callsTo('/rest/v1/signing_session_items', 'POST');
    expect(items!.secret).toBe(true);
    expect(items!.body).toEqual([
      {
        session_id: body.sessionId,
        position: 0,
        request_id: requestB,
        agreement_employee_id: null,
        agreement_party: null,
        agreement_digest: null,
      },
      {
        session_id: body.sessionId,
        position: 1,
        request_id: requestA,
        agreement_employee_id: null,
        agreement_party: null,
        agreement_digest: null,
      },
    ]);
    expect(sendSigningCodeEmail).toHaveBeenCalledWith({
      to: 'ana@example.ro',
      code: expect.stringMatching(/^\d{6}$/),
      expiresInMinutes: 10,
    });
  });

  it('answers 404 for a request that is not pending or not addressed to the member, sending nothing', async () => {
    memberUpstream({ '/rest/v1/signature_requests': () => [{ id: requestA, slot: 'trainer' }] });

    const response = await send('/me/signing-sessions', { requestIds: [requestA, requestB] });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      reason: 'signing_item_not_found',
      issues: [{ path: 'requestIds.1' }],
    });
    expect(callsTo('/rest/v1/rpc/create_signing_session', 'POST')).toHaveLength(0);
    expect(sendSigningCodeEmail).not.toHaveBeenCalled();
  });

  it("refuses a trainee's request, or one of another organization the account also signs for", async () => {
    memberUpstream({ '/rest/v1/signature_requests': () => [] });

    expect((await send('/me/signing-sessions', { requestIds: [requestA] })).status).toBe(404);
  });

  it('refuses more than thirty items in one session', async () => {
    memberUpstream();
    const many = Array.from(
      { length: 31 },
      (_, index) => `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`
    );

    const response = await send('/me/signing-sessions', { requestIds: many });

    expect(response.status).toBe(400);
  });

  it('refuses an agreement, which is signed in the portal', async () => {
    memberUpstream();

    const response = await send('/me/signing-sessions', {
      requestIds: [],
      agreementEmployeeIds: [employeeId],
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reason: 'agreement_signed_in_portal' });
  });

  it('refuses an empty session', async () => {
    memberUpstream();

    expect((await send('/me/signing-sessions', { requestIds: [] })).status).toBe(400);
  });

  it('answers 409 with the seconds to wait when a code went out in the last minute', async () => {
    memberUpstream({ '/rest/v1/rpc/create_signing_session': createSessionRpc(40) });

    const response = await send('/me/signing-sessions', { requestIds: [requestA] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'code_rate_limited',
      retryAfterSeconds: 40,
    });
    expect(sendSigningCodeEmail).not.toHaveBeenCalled();
  });

  it('answers 503 and keeps nothing when the code cannot be sent', async () => {
    memberUpstream();
    sendSigningCodeEmail.mockRejectedValue(new Error('Resend refused'));

    const response = await send('/me/signing-sessions', { requestIds: [requestA] });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'signing_code_not_sent' });
    expect(callsTo('/rest/v1/signing_sessions', 'DELETE')).toHaveLength(1);
  });

  it('sends no code when the items cannot be kept', async () => {
    memberUpstream({
      'POST /rest/v1/signing_session_items': () =>
        Response.json({ code: '57014', message: 'timeout' }, { status: 500 }),
    });

    const response = await send('/me/signing-sessions', { requestIds: [requestA] });

    expect(response.status).toBe(503);
    expect(sendSigningCodeEmail).not.toHaveBeenCalled();
    expect(callsTo('/rest/v1/signing_sessions', 'DELETE')).toHaveLength(1);
  });
});

const agreementRow = (overrides: Record<string, unknown> = {}) => ({
  employee_id: employeeId,
  organization_id: organizationId,
  state: 'generated',
  storage_path: null,
  employee_signed_at: null,
  employer_signed_at: null,
  clients: { archived_at: null },
  ...overrides,
});

const templatesUrl = new URL('../../../../../packages/document-engine/templates/', import.meta.url);

/** What drawing the agreement up reads: the employee, the client, the provider and the template. */
const agreementSources = (client: Record<string, unknown> = {}): Record<string, UpstreamRoute> => ({
  '/rest/v1/employees': () => [
    {
      last_name: 'Popescu',
      first_name: 'Ion',
      employee_number: null,
      job_title: 'Sudor',
      contract_number: null,
      hired_at: '2024-03-01',
      birth_date: null,
      birth_place: null,
      home_address: null,
      email: null,
      phone: '+40722000101',
    },
  ],
  '/rest/v1/clients': () => [
    {
      organization_id: organizationId,
      legal_name: 'Fabrica Sigma SRL',
      cui: 'RO123456',
      county_code: 'TM',
      locality: 'Timișoara',
      address_line: 'Str. Fabricii 3',
      legal_representative_name: 'Maria IONESCU',
      legal_representative_role: 'Administrator',
      ...client,
    },
  ],
  '/rest/v1/organizations': () => [{ name: 'Protect', legal_name: 'Protect SSM Consult SRL' }],
  '/rest/v1/document_templates': () => [
    {
      type_key: 'signing_agreement',
      title: 'Act adițional',
      document_template_versions: [
        { id: 'v1', version: 1, storage_path: 'built-in/signing_agreement/v1.docx' },
      ],
    },
  ],
});

const readAgreementTemplate = () =>
  sheetFiles.readTemplate.mockResolvedValue(
    new Uint8Array(readFileSync(new URL('act_aditional_semnare_electronica.docx', templatesUrl)))
  );

const employeeDigest = () =>
  agreementDigest({ env: signingEnv } as Context<ApiEnv>, {
    clientId,
    employeeId,
    party: 'employee',
    storagePath: null,
  });

const participantRow = (kind: string) => ({
  user_id: user.id,
  kind,
  employee_id: kind === 'employee' ? employeeId : null,
  full_name: kind === 'employee' ? null : 'Elena Radu',
  employees:
    kind === 'employee'
      ? {
          last_name: 'Popescu',
          first_name: 'Ion',
          job_title: 'Sudor',
          email: null,
          phone: '+40722000101',
        }
      : null,
  participant_invitations: [
    kind === 'employee'
      ? { channel: 'sms', address: '+40722000101', accepted_at: '2026-10-01T00:00:00Z' }
      : { channel: 'email', address: 'elena@fabrica.ro', accepted_at: '2026-10-01T00:00:00Z' },
  ],
});

describe('POST /portal/participants/{participantId}/signing-sessions', () => {
  const path = `/portal/participants/${participantId}/signing-sessions`;

  function participantUpstream(kind: string, overrides: Record<string, UpstreamRoute> = {}) {
    mockUpstream({
      ...portal(kind),
      ...agreementSources(),
      '/rest/v1/signature_requests': () => [{ id: requestA, slot: 'trainee' }],
      '/rest/v1/employee_signing_agreements': () => [agreementRow()],
      '/rest/v1/client_participants': () => [participantRow(kind)],
      '/rest/v1/rpc/create_signing_session': createSessionRpc(),
      '/rest/v1/signing_sessions': sessions(null),
      '/rest/v1/signing_session_items': () => [],
      ...overrides,
    });
    readAgreementTemplate();
  }

  it("puts the employee's own agreement first and texts the code to an employee without email", async () => {
    participantUpstream('employee');

    const response = await send(path, {
      requestIds: [requestA],
      agreementEmployeeIds: [employeeId],
    });

    expect(response.status).toBe(201);
    const body = signingSessionResponseSchema.parse(await response.json());
    expect(body).toMatchObject({
      channel: 'sms',
      addressHint: '+40 7** *** *01',
      items: [
        { kind: 'agreement', employeeId, party: 'employee' },
        { kind: 'request', requestId: requestA },
      ],
    });
    const [lookup] = callsTo('/rest/v1/signature_requests');
    expect(lookup!.url.searchParams.get('client_id')).toBe(`eq.${clientId}`);
    const [contact] = callsTo('/rest/v1/client_participants');
    expect(contact!.secret).toBe(true);
    expect(sendSigningCodeSms).toHaveBeenCalledWith({
      to: '+40722000101',
      code: expect.stringMatching(/^\d{6}$/),
      expiresInMinutes: 10,
    });
    const [items] = callsTo('/rest/v1/signing_session_items', 'POST');
    expect((items!.body as unknown[])[0]).toMatchObject({
      agreement_employee_id: employeeId,
      agreement_party: 'employee',
      agreement_digest: await employeeDigest(),
      request_id: null,
    });
    const [session] = callsTo('/rest/v1/rpc/create_signing_session', 'POST');
    expect(session!.body).toMatchObject({ p_place: 'portal', p_participant_id: participantId });
  });

  it('refuses an agreement of a client without a legal representative, sending nothing', async () => {
    participantUpstream('employee', agreementSources({ legal_representative_name: null }));

    const response = await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: 'missing_document_data',
      missing: ['client.representativeName'],
    });
    expect(sendSigningCodeSms).not.toHaveBeenCalled();
  });

  it('decides the party per agreement for an administrator who is also the employee', async () => {
    participantUpstream('client_administrator', {
      '/rest/v1/rpc/current_participations': () => [
        participation('client_administrator', employeeId),
      ],
    });

    const own = await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] });

    expect(own.status).toBe(201);
    expect(signingSessionResponseSchema.parse(await own.json()).items).toEqual([
      { kind: 'agreement', employeeId, party: 'employee' },
    ]);
  });

  it('offers the employee their agreement before any member records it', async () => {
    participantUpstream('employee', { '/rest/v1/employee_signing_agreements': () => [] });

    const response = await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] });

    expect(response.status).toBe(201);
    expect(signingSessionResponseSchema.parse(await response.json()).items).toEqual([
      { kind: 'agreement', employeeId, party: 'employee' },
    ]);
  });

  it("refuses an employee another employee's agreement, or their own once they signed it", async () => {
    participantUpstream('employee');
    const other = '7c9e6679-7425-40de-944b-e07fc1f90ae8';
    const response = await send(path, { requestIds: [], agreementEmployeeIds: [other] });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      reason: 'signing_item_not_found',
      issues: [{ path: 'agreementEmployeeIds.0' }],
    });

    participantUpstream('employee', {
      '/rest/v1/employee_signing_agreements': () => [
        agreementRow({ employee_signed_at: '2026-10-18T08:00:00Z', storage_path: 'v1.pdf' }),
      ],
    });
    expect((await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] })).status).toBe(
      404
    );
  });

  it('lets the administrator sign for the employer only once the employee has signed', async () => {
    participantUpstream('client_administrator');
    expect((await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] })).status).toBe(
      404
    );

    participantUpstream('client_administrator', {
      '/rest/v1/employee_signing_agreements': () => [
        agreementRow({ employee_signed_at: '2026-10-18T08:00:00Z', storage_path: 'v1.pdf' }),
      ],
    });
    const stored = new TextEncoder().encode('%PDF employee signed');
    sheetFiles.readDocument.mockResolvedValue(stored);
    const response = await send(path, { requestIds: [], agreementEmployeeIds: [employeeId] });
    expect(response.status).toBe(201);
    expect(signingSessionResponseSchema.parse(await response.json())).toMatchObject({
      channel: 'email',
      addressHint: 'e***@fabrica.ro',
      items: [{ kind: 'agreement', employeeId, party: 'employer' }],
    });
    expect(sheetFiles.readDocument).toHaveBeenCalledWith('v1.pdf');
    const [items] = callsTo('/rest/v1/signing_session_items', 'POST');
    expect((items!.body as { agreement_digest: string }[])[0]!.agreement_digest).toBe(
      await sha256Hex(stored)
    );
  });

  it('answers 409 when there is nowhere to send the code', async () => {
    participantUpstream('employee', { '/rest/v1/client_participants': () => [] });

    const response = await send(path, { requestIds: [requestA] });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason: 'signer_has_no_address' });
    expect(callsTo('/rest/v1/rpc/create_signing_session', 'POST')).toHaveLength(0);
  });
});

async function sha256Hex(bytes: Uint8Array) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

const requestRow = (id: string, record: string, overrides: Record<string, unknown> = {}) => ({
  id,
  organization_id: organizationId,
  client_id: clientId,
  training_record_id: record,
  slot: 'trainer',
  state: 'pending',
  signer_account_id: user.id,
  ...overrides,
});

const recordRow = {
  employee_id: employeeId,
  occupation: 'Sudor',
  admitted_by_name: 'Vasile ȘEF',
  admitted_by_job_title: 'Șef atelier',
  employees: { last_name: 'Popescu', first_name: 'Ion' },
  trainings: {
    trainer_name: 'Ana SPECIALIST',
    trainer_job_title: 'Inspector SSM',
    verifier_name: null,
    verifier_job_title: null,
  },
  clients: { archived_at: null },
};

describe('POST /me/signing-sessions/{sessionId}/sign', () => {
  const path = `/me/signing-sessions/${sessionId}/sign`;

  async function signUpstream(overrides: Record<string, UpstreamRoute> = {}) {
    const row = await sessionRow();
    mockUpstream({
      '/rest/v1/signing_sessions': sessions(row),
      '/rest/v1/signing_session_items': () => [
        { request_id: requestA, agreement_employee_id: null, agreement_party: null },
        { request_id: requestB, agreement_employee_id: null, agreement_party: null },
      ],
      'GET /rest/v1/signature_requests': ({ url }) =>
        url.searchParams.get('id') === `eq.${requestA}`
          ? [requestRow(requestA, recordA)]
          : [requestRow(requestB, recordB)],
      '/rest/v1/profiles': () => [{ full_name: 'Ana Specialist' }],
      '/rest/v1/training_records': () => [recordRow],
      '/rest/v1/training_signatures': () => [],
      '/rest/v1/employee_signing_agreements': () => [
        { employee_id: employeeId, state: 'generated' },
      ],
      ...overrides,
    });
  }

  it('signs every item, places the record and writes the evidence, which signs the request in the database', async () => {
    await signUpstream();

    const response = await send(path, { code: '123456' });

    expect(response.status).toBe(200);
    expect(signSessionResponseSchema.parse(await response.json())).toEqual({
      signed: [
        { requestId: requestA, agreementState: 'generated' },
        { requestId: requestB, agreementState: 'generated' },
      ],
      failed: [],
      agreements: [],
    });
    expect(identityFor).toHaveBeenCalledWith(user.id, 'Ana Specialist');
    expect(vi.mocked(placeRecord).mock.calls.map(([, id]) => id)).toEqual([recordA, recordB]);
    const [, recordId, slot, signer] = vi.mocked(applySignature).mock.calls[0]!;
    expect([recordId, slot, signer]).toEqual([
      recordA,
      'trainer',
      {
        certificatePem: 'CERT Ana Specialist',
        chainPem: ['CA'],
        name: 'Ana SPECIALIST',
        jobTitle: 'Inspector SSM',
      },
    ]);
    const [evidence] = callsTo('/rest/v1/training_signatures', 'POST');
    expect(evidence!.secret).toBe(true);
    expect(evidence!.body).toMatchObject({
      organization_id: organizationId,
      client_id: clientId,
      training_record_id: recordA,
      slot: 'trainer',
      request_id: requestA,
      method: 'electronic',
      signer_account_id: user.id,
      signer_name: 'Ana SPECIALIST',
      signer_job_title: 'Inspector SSM',
      channel: 'email',
      address: 'ana@example.ro',
      code_sent_at: expect.any(String),
      code_verified_at: expect.any(String),
      signed_at: '2026-10-18T09:30:00.000Z',
      digest_before: 'aa',
      digest_after: 'bb',
      certificate_serial: '0a1b',
      client_ip: '203.0.113.7',
      user_agent: 'Firefox',
      signing_session_id: sessionId,
    });
    expect(callsTo('/rest/v1/signature_requests', 'PATCH')).toHaveLength(0);
  });

  it('reports a request the database finds no longer pending when its evidence goes in', async () => {
    await signUpstream({
      'POST /rest/v1/training_signatures': () =>
        Response.json({ code: 'SIG08', message: 'request_not_pending' }, { status: 400 }),
    });

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.failed).toEqual([
      { requestId: requestA, reason: 'request_not_pending' },
      { requestId: requestB, reason: 'request_not_pending' },
    ]);
  });

  it('refuses a record of an archived client before touching its sheet', async () => {
    await signUpstream({
      '/rest/v1/training_records': () => [
        { ...recordRow, clients: { archived_at: '2026-10-18T08:00:00Z' } },
      ],
    });

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.failed.map((each) => each.reason)).toEqual(['client_archived', 'client_archived']);
    expect(placeRecord).not.toHaveBeenCalled();
  });

  it("passes the signer's refusal on as its own reason", async () => {
    await signUpstream();
    vi.mocked(applySignature).mockRejectedValueOnce(
      new ApiError('conflict', undefined, undefined, 'locked_field')
    );

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.failed).toEqual([{ requestId: requestA, reason: 'locked_field' }]);
  });

  it('keeps the code unspent when there is no signer or converter to sign with', async () => {
    await signUpstream();

    const response = await send(path, { code: '123456' }, { ...signingEnv, SIGNER_URL: undefined });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: 'signer_unavailable' });
    expect(callsTo('/rest/v1/signing_sessions', 'PATCH')).toHaveLength(0);
  });

  it('answers 404 for a session asked for in the portal', async () => {
    await signUpstream({
      '/rest/v1/signing_sessions': sessions(
        await sessionRow({ place: 'portal', participant_id: participantId })
      ),
    });

    const response = await send(path, { code: '123456' });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ reason: 'signing_session_not_found' });
  });

  it('carries the attempts left on a wrong code', async () => {
    await signUpstream();

    const response = await send(path, { code: '654321' });

    expect(await response.json()).toMatchObject({ reason: 'code_invalid', attemptsLeft: 2 });
  });

  it('reports an item that fails and signs the others', async () => {
    await signUpstream();
    vi.mocked(applySignature).mockImplementationOnce(async () => {
      throw new ApiError('conflict', 'busy', undefined, 'sheet_busy');
    });

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.failed).toEqual([{ requestId: requestA, reason: 'sheet_busy' }]);
    expect(body.signed.map((each) => each.requestId)).toEqual([requestB]);
    expect(callsTo('/rest/v1/training_signatures', 'POST')).toHaveLength(1);
  });

  it('skips a request no longer pending, and calls an unknown failure signing_failed', async () => {
    await signUpstream({
      'GET /rest/v1/signature_requests': ({ url }) =>
        url.searchParams.get('id') === `eq.${requestA}`
          ? [requestRow(requestA, recordA, { state: 'void' })]
          : [requestRow(requestB, recordB)],
    });
    vi.mocked(placeRecord).mockRejectedValueOnce(new Error('socket hang up'));

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.failed).toEqual([
      { requestId: requestA, reason: 'request_not_pending' },
      { requestId: requestB, reason: 'signing_failed' },
    ]);
    expect(applySignature).not.toHaveBeenCalled();
  });

  it("prints the slot's name and position, while the certificate names the account", async () => {
    await signUpstream({
      'GET /rest/v1/signature_requests': () => [requestRow(requestA, recordA, { slot: 'trainee' })],
      '/rest/v1/signing_session_items': () => [
        { request_id: requestA, agreement_employee_id: null, agreement_party: null },
      ],
    });

    await send(path, { code: '123456' });

    expect(identityFor).toHaveBeenCalledWith(user.id, 'Ana Specialist');
    expect(vi.mocked(applySignature).mock.calls[0]![3]).toMatchObject({
      name: 'Popescu Ion',
      jobTitle: 'Sudor',
    });
  });

  it.each([
    ['a wrong code', {}, '654321', 'code_invalid'],
    ['an expired code', { expires_at: '2026-01-01T00:00:00Z' }, '123456', 'code_expired'],
    ['a used code', { verified_at: '2026-10-18T08:00:00Z' }, '123456', 'code_already_used'],
    ['a code typed wrong three times', { attempts: 3 }, '123456', 'code_attempts_exceeded'],
  ])('refuses %s and signs nothing', async (_, overrides, code, reason) => {
    await signUpstream({ '/rest/v1/signing_sessions': sessions(await sessionRow(overrides)) });

    const response = await send(path, { code });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ reason });
    expect(placeRecord).not.toHaveBeenCalled();
    expect(callsTo('/rest/v1/signing_session_items')).toHaveLength(0);
  });

  it("answers 404 for another account's session", async () => {
    await signUpstream({ '/rest/v1/signing_sessions': sessions(null) });

    const response = await send(path, { code: '123456' });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ reason: 'signing_session_not_found' });
  });
});

describe('the signing agreement signed in a portal session', () => {
  const path = `/portal/participants/${participantId}/signing-sessions/${sessionId}/sign`;

  async function agreementUpstream(
    kind: string,
    agreement: Record<string, unknown>,
    overrides: Record<string, UpstreamRoute> = {},
    digest: string | null = null
  ) {
    const row = await sessionRow({
      channel: 'sms',
      address: '+40722000101',
      place: 'portal',
      participant_id: participantId,
    });
    mockUpstream({
      ...portal(kind),
      ...agreementSources(),
      '/rest/v1/signing_sessions': sessions(row),
      '/rest/v1/signing_session_items': () => [
        {
          request_id: null,
          agreement_employee_id: employeeId,
          agreement_party: kind === 'employee' ? 'employee' : 'employer',
          agreement_digest: digest,
        },
      ],
      'GET /rest/v1/employee_signing_agreements': ({ url }) =>
        url.searchParams.get('select') === 'employee_id,state'
          ? [{ employee_id: employeeId, state: agreement.state ?? 'generated' }]
          : [agreementRow(agreement)],
      'POST /rest/v1/agreement_signatures': () => [],
      ...overrides,
    });
    readAgreementTemplate();
    sheetFiles.writeDocument.mockResolvedValue(undefined);
    sheetFiles.removeDocument.mockResolvedValue(undefined);
    sheetPdf.convertForm.mockResolvedValue(new TextEncoder().encode('%PDF form'));
    sheetSigner.prepareSheet.mockResolvedValue(new TextEncoder().encode('%PDF prepared').buffer);
    sheetSigner.beginSignature.mockResolvedValue({
      prepared: new TextEncoder().encode('%PDF placeholder').buffer,
      toSign: new ArrayBuffer(32),
      sessionToken: 't1',
    });
    sheetSigner.finishSignature.mockResolvedValue(new TextEncoder().encode('%PDF signed').buffer);
  }

  it("draws the employee's agreement up as a form, certifies it with their signature and stores it", async () => {
    await agreementUpstream('employee', {});
    await agreementUpstream('employee', {}, {}, await employeeDigest());

    const response = await send(path, { code: '123456' });

    expect(response.status).toBe(200);
    expect(signSessionResponseSchema.parse(await response.json()).agreements).toEqual([
      { employeeId, party: 'employee', signed: true, reason: null, agreementState: 'generated' },
    ]);
    expect(sheetSigner.prepareSheet.mock.calls[0]![1]).toEqual(['sig_employee', 'sig_employer']);
    expect(sheetSigner.fillFields.mock.calls[0]![1]).toEqual({
      date_employee: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
    });
    expect(sheetSigner.beginSignature.mock.calls[0]![1]).toMatchObject({
      field: 'sig_employee',
      certify: true,
      lockFields: [],
      certificatePem: 'CERT Popescu Ion',
      chainPem: ['CA'],
      appearanceLines: [
        'Popescu Ion',
        'semnat electronic',
        expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
      ],
    });
    const [written, bytes] = sheetFiles.writeDocument.mock.calls[0]!;
    expect(written).toMatch(
      new RegExp(`^signing-agreements/${clientId}/${employeeId}/v1-[0-9a-f]{8}\\.pdf$`)
    );
    expect(new TextDecoder().decode(bytes)).toBe('%PDF signed');
    const [evidence] = callsTo('/rest/v1/agreement_signatures', 'POST');
    expect(evidence!.secret).toBe(true);
    expect(evidence!.body).toMatchObject({
      employee_id: employeeId,
      client_id: clientId,
      party: 'employee',
      signer_account_id: user.id,
      signer_name: 'Popescu Ion',
      channel: 'sms',
      address: '+40722000101',
      certificate_serial: '0a1b',
      signing_session_id: sessionId,
      digest_before: expect.stringMatching(/^[0-9a-f]{64}$/),
      digest_after: expect.stringMatching(/^[0-9a-f]{64}$/),
      storage_path: written,
    });
    expect(callsTo('/rest/v1/employee_signing_agreements', 'PATCH')).toHaveLength(0);
  });

  it('records the agreement as generated when the employee signs it before any member did', async () => {
    const employeeRow = agreementSources()['/rest/v1/employees'] as () => Record<string, unknown>[];
    const unrecorded: Record<string, UpstreamRoute> = {
      // No row until the signature records one: the reads before it find nothing.
      'GET /rest/v1/employee_signing_agreements': ({ url }) =>
        url.searchParams.get('select')?.includes('storage_path')
          ? []
          : [{ employee_id: employeeId, state: 'generated' }],
      'POST /rest/v1/employee_signing_agreements': () => [],
      '/rest/v1/employees': () => [
        { ...employeeRow()[0], clients: { organization_id: organizationId, archived_at: null } },
      ],
    };
    await agreementUpstream('employee', {}, unrecorded);
    await agreementUpstream('employee', {}, unrecorded, await employeeDigest());

    const response = await send(path, { code: '123456' });

    expect(response.status).toBe(200);
    expect(signSessionResponseSchema.parse(await response.json()).agreements).toEqual([
      { employeeId, party: 'employee', signed: true, reason: null, agreementState: 'generated' },
    ]);
    const [recorded] = callsTo('/rest/v1/employee_signing_agreements', 'POST');
    expect(recorded!.secret).toBe(true);
    expect(recorded!.body).toEqual({
      employee_id: employeeId,
      client_id: clientId,
      organization_id: organizationId,
      state: 'generated',
    });
    const [evidence] = callsTo('/rest/v1/agreement_signatures', 'POST');
    expect(evidence!.body).toMatchObject({ party: 'employee', organization_id: organizationId });
    const client = callsTo('/rest/v1/employees').find((call) =>
      call.url.searchParams.get('select')?.startsWith('clients!employees_client_id_fkey(')
    );
    expect(client).toBeDefined();
  });

  it('refuses an agreement that no longer says what it said when the code was asked for', async () => {
    await agreementUpstream('employee', {}, {}, 'f'.repeat(64));

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.agreements[0]).toMatchObject({ signed: false, reason: 'agreement_changed' });
    expect(sheetSigner.beginSignature).not.toHaveBeenCalled();
  });

  it('signs the stored file for the employer and settles the agreement', async () => {
    const employeeCopy = new TextEncoder().encode('%PDF employee signed');
    const digest = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', employeeCopy)),
      (byte) => byte.toString(16).padStart(2, '0')
    ).join('');
    await agreementUpstream(
      'client_administrator',
      { employee_signed_at: '2026-10-18T08:00:00Z', storage_path: 'v1.pdf' },
      { 'GET /rest/v1/agreement_signatures': () => [{ digest_after: digest }] },
      digest
    );
    sheetFiles.readDocument.mockResolvedValue(employeeCopy);

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.agreements[0]).toMatchObject({ party: 'employer', signed: true });
    expect(sheetFiles.readDocument).toHaveBeenCalledWith('v1.pdf');
    expect(sheetPdf.convertForm).not.toHaveBeenCalled();
    expect(sheetSigner.fillFields.mock.calls[0]![1]).toEqual({
      date_employer: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
    });
    expect(sheetSigner.beginSignature.mock.calls[0]![1]).toMatchObject({
      field: 'sig_employer',
      certify: false,
      certificatePem: 'CERT Elena Radu',
      appearanceLines: [
        'Elena Radu',
        'semnat electronic',
        expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
      ],
    });
    const [evidence] = callsTo('/rest/v1/agreement_signatures', 'POST');
    expect(evidence!.body).toMatchObject({ party: 'employer', storage_path: expect.any(String) });
  });

  it('refuses the employer a stored file that is not the one the employee signed', async () => {
    await agreementUpstream(
      'client_administrator',
      { employee_signed_at: '2026-10-18T08:00:00Z', storage_path: 'v1.pdf' },
      { 'GET /rest/v1/agreement_signatures': () => [{ digest_after: 'f'.repeat(64) }] }
    );
    sheetFiles.readDocument.mockResolvedValue(new TextEncoder().encode('%PDF changed'));

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.agreements[0]).toMatchObject({ signed: false, reason: 'signing_failed' });
    expect(sheetSigner.beginSignature).not.toHaveBeenCalled();
  });

  it('reports an agreement the other session signed first, and removes its own copy', async () => {
    await agreementUpstream('employee', {});
    await agreementUpstream(
      'employee',
      {},
      {
        'POST /rest/v1/agreement_signatures': () =>
          Response.json({ code: 'SIG10', message: 'agreement_not_awaiting' }, { status: 400 }),
      },
      await employeeDigest()
    );

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.agreements[0]).toMatchObject({ signed: false, reason: 'agreement_not_awaiting' });
    expect(sheetFiles.removeDocument).toHaveBeenCalledWith(
      sheetFiles.writeDocument.mock.calls[0]![0]
    );
    expect(callsTo('/rest/v1/employee_signing_agreements', 'PATCH')).toHaveLength(0);
  });

  it('reports an agreement no longer awaiting the signer without touching it', async () => {
    await agreementUpstream('employee', {
      state: 'signed_on_paper',
      signed_at: '2026-10-18T08:00:00Z',
    });

    const body = signSessionResponseSchema.parse(
      await (await send(path, { code: '123456' })).json()
    );

    expect(body.agreements[0]).toMatchObject({
      signed: false,
      reason: 'agreement_not_awaiting',
      agreementState: 'signed_on_paper',
    });
    expect(sheetSigner.beginSignature).not.toHaveBeenCalled();
  });
});
