import type { RouteHandler } from '@hono/zod-openapi';
import {
  signatureErrorReasons,
  type SignatureRequestSlot,
  type SignerSlot,
  type SigningAgreementParty,
  type SigningAgreementState,
  type SigningItemFailureReason,
  signingItemFailureReasons,
  type SigningSessionItem,
  type SignSessionResponse,
  type TestSheetSignerSlot,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { type Participation, participationOf } from '../../lib/participant';
import { createPdfConverter } from '../../lib/pdf';
import { checkToSign } from '../../lib/signed-attributes';
import { createSigner } from '../../lib/signer';
import { applySignature, placeRecord, signedSheetContext } from '../signed-sheets/signed-sheets';
import { applyTestSheetSignature, testSheetDeps } from '../test-sheets/test-sheets';
import { agreementDigest, signAgreement } from './agreement-signing';
import { awaits } from './agreement-state';
import { createSigningIdentities } from './identities';
import type {
  createMySigningSessionRoute,
  createPortalSigningSessionRoute,
  signMySigningSessionRoute,
  signPortalSigningSessionRoute,
} from './routes';
import { signerContact, type SigningPlace } from './signers';
import { type SigningSession, signingSessionsOf } from './signing-sessions';

/** `i***@example.ro`, `+40 7** *** *12`: enough to recognise the address, not to learn it. */
export function addressHint(channel: 'email' | 'sms', address: string) {
  if (channel === 'email') {
    const at = address.lastIndexOf('@');
    return `${address.slice(0, Math.min(1, at))}***${address.slice(at)}`;
  }
  const romanian = /^\+40(\d)(\d{6})(\d{2})$/.exec(address);
  if (romanian) return `+40 ${romanian[1]}** *** *${romanian[3]}`;
  return `${address.slice(0, 3)} ${'*'.repeat(Math.max(0, address.length - 5))}${address.slice(-2)}`;
}

const notFound = (path: string, message: string) =>
  new ApiError(
    'not_found',
    message,
    [{ path, message }],
    signatureErrorReasons.signingItemNotFound
  );

const ipv4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const ipv6 = /^[0-9a-f:]+(:(\d{1,3}\.){3}\d{1,3})?$/i;

/**
 * On Cloudflare the client's address is this header; elsewhere there is none to trust. One that
 * is not an address is dropped, since the evidence column would refuse it after the signature.
 */
export function clientIpOf(c: Context<ApiEnv>) {
  const header = c.req.header('cf-connecting-ip')?.trim();
  if (!header) return null;
  if (ipv4.test(header) || (header.includes(':') && ipv6.test(header) && header.length <= 45)) {
    return header;
  }
  return null;
}

type Item =
  | { kind: 'request'; requestId: string }
  | {
      kind: 'agreement';
      employeeId: string;
      party: SigningAgreementParty;
      digest: string;
    };

async function pendingRequests(
  db: DataClient,
  accountId: string,
  requestIds: string[],
  scope: { clientId: string } | { organizationId: string }
) {
  if (requestIds.length === 0) return;
  let query = db
    .from('signature_requests')
    .select('id, slot')
    .in('id', requestIds)
    .eq('signer_account_id', accountId)
    .eq('state', 'pending');
  query =
    'clientId' in scope
      ? query.eq('client_id', scope.clientId)
      : query.eq('organization_id', scope.organizationId).neq('slot', 'trainee');
  const { data, error } = await query;
  if (error) throw fromDatabaseError(error, 'signing session requests');
  const usable = new Set(data.map((row) => row.id));
  const missing = requestIds.findIndex((id) => !usable.has(id));
  if (missing >= 0) {
    throw notFound(
      `requestIds.${missing}`,
      'This request is not pending, or is not addressed to you here.'
    );
  }
}

/**
 * The party is decided per agreement: the participant's own agreement while it awaits the
 * employee is theirs as the employee, even for an administrator who is also that employee; any
 * other, for an administrator, is the employer's.
 */
function partyOf(
  participation: Participation,
  employeeId: string,
  row: Parameters<typeof awaits>[0]
): SigningAgreementParty | null {
  if (employeeId === participation.employeeId && awaits(row, 'employee')) return 'employee';
  if (participation.kind === 'client_administrator' && awaits(row, 'employer')) return 'employer';
  return null;
}

async function awaitedAgreements(
  c: Context<ApiEnv>,
  db: DataClient,
  participation: Participation,
  employeeIds: string[]
): Promise<Item[]> {
  if (employeeIds.length === 0) return [];
  const { data, error } = await db
    .from('employee_signing_agreements')
    .select(
      'employee_id, organization_id, state, storage_path, employee_signed_at, employer_signed_at'
    )
    .eq('client_id', participation.clientId)
    .in('employee_id', employeeIds);
  if (error) throw fromDatabaseError(error, 'signing session agreements');
  const items: Item[] = [];
  for (const [index, employeeId] of employeeIds.entries()) {
    const row = data.find((each) => each.employee_id === employeeId) ?? null;
    const party = partyOf(participation, employeeId, row);
    if (!party) {
      throw notFound(
        `agreementEmployeeIds.${index}`,
        'This signing agreement does not await your signature.'
      );
    }
    const digest = await agreementDigest(c, {
      clientId: participation.clientId,
      employeeId,
      party,
      storagePath: row?.storage_path ?? null,
    });
    items.push({ kind: 'agreement', employeeId, party, digest });
  }
  return items;
}

async function createSession(
  c: Context<ApiEnv>,
  items: Item[],
  signer: { clientId: string; place: SigningPlace; participantId: string | null }
) {
  const accountId = c.get('user').id;
  await createSigningIdentities(c);
  const admin = adminClient(c.env);
  const contact = await signerContact(admin, { accountId, ...signer });
  if (!contact) {
    throw new ApiError(
      'conflict',
      'There is neither an email nor a phone to send your signing code to.',
      undefined,
      signatureErrorReasons.signerHasNoAddress
    );
  }
  const { sessionId, expiresAt } = await signingSessionsOf(c).create(
    {
      accountId,
      place: signer.place,
      participantId: signer.participantId,
      channel: contact.channel,
      address: contact.address,
      clientIp: clientIpOf(c),
      userAgent: c.req.header('user-agent') ?? null,
    },
    async (id) => {
      const { error } = await admin.from('signing_session_items').insert(
        items.map((item, position) => ({
          session_id: id,
          position,
          request_id: item.kind === 'request' ? item.requestId : null,
          agreement_employee_id: item.kind === 'agreement' ? item.employeeId : null,
          agreement_party: item.kind === 'agreement' ? item.party : null,
          agreement_digest: item.kind === 'agreement' ? item.digest : null,
        }))
      );
      if (error) {
        console.error(`Signing session items failed: ${error.code ?? 'no code'}`);
        throw new ApiError('service_unavailable');
      }
    }
  );
  return {
    sessionId,
    channel: contact.channel,
    addressHint: addressHint(contact.channel, contact.address),
    expiresAt: expiresAt.toISOString(),
    items: items.map((item): SigningSessionItem =>
      item.kind === 'request'
        ? item
        : { kind: 'agreement', employeeId: item.employeeId, party: item.party }
    ),
  };
}

export const createMySigningSession: RouteHandler<
  typeof createMySigningSessionRoute,
  ApiEnv
> = async (c) => {
  const { requestIds, agreementEmployeeIds } = c.req.valid('json');
  if (agreementEmployeeIds?.length) {
    throw new ApiError(
      'unprocessable',
      'A signing agreement is signed in the portal, by the employee and the client administrator.',
      undefined,
      signatureErrorReasons.agreementSignedInPortal
    );
  }
  await pendingRequests(createDataClient(c), c.get('user').id, requestIds, {
    organizationId: c.get('membership').organizationId,
  });
  const items: Item[] = requestIds.map((requestId) => ({ kind: 'request', requestId }));
  return c.json(
    await createSession(c, items, { clientId: '', place: 'app', participantId: null }),
    201
  );
};

export const createPortalSigningSession: RouteHandler<
  typeof createPortalSigningSessionRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  const { requestIds, agreementEmployeeIds = [] } = c.req.valid('json');
  const db = createDataClient(c);
  await pendingRequests(db, c.get('user').id, requestIds, { clientId: participation.clientId });
  const agreements = await awaitedAgreements(c, db, participation, agreementEmployeeIds);
  const items: Item[] = [
    ...agreements,
    ...requestIds.map((requestId): Item => ({ kind: 'request', requestId })),
  ];
  return c.json(
    await createSession(c, items, {
      clientId: participation.clientId,
      place: 'portal',
      participantId,
    }),
    201
  );
};

const databaseReasons: Record<string, SigningItemFailureReason> = {
  request_not_pending: 'request_not_pending',
  signer_not_addressed: 'request_not_pending',
  signer_not_of_client: 'signer_not_of_client',
  agreement_not_awaiting: 'agreement_not_awaiting',
  agreement_signer_not_party: 'agreement_not_awaiting',
  client_archived: 'client_archived',
};

const failureReasonOf = (error: unknown): SigningItemFailureReason => {
  // The document engine's refusal to draw an agreement up without the representative.
  if (error instanceof Error && error.name === 'SigningAgreementDataError') {
    return 'missing_document_data';
  }
  const reason = error instanceof ApiError ? error.reason : undefined;
  const known =
    (reason && databaseReasons[reason]) ??
    signingItemFailureReasons.find((each) => each === reason);
  if (known) return known;
  console.error(
    `A signing session item failed: ${error instanceof Error ? `${error.name} ${error.message}` : 'unknown'}`
  );
  return 'signing_failed';
};

const requestNotPending = () =>
  new ApiError('conflict', undefined, undefined, 'request_not_pending');

const clientArchived = () => new ApiError('conflict', undefined, undefined, 'client_archived');

type RecordForSigning = {
  employee_id: string;
  occupation: string;
  admitted_by_name: string | null;
  admitted_by_job_title: string | null;
  employees: { last_name: string; first_name: string };
  trainings: {
    trainer_name: string;
    trainer_job_title: string;
    verifier_name: string | null;
    verifier_job_title: string | null;
  };
  clients: { archived_at: string | null };
};

export function printedSlot(slot: SignerSlot, record: Omit<RecordForSigning, 'clients'>) {
  switch (slot) {
    case 'trainee':
      return {
        name: `${record.employees.last_name} ${record.employees.first_name}`,
        jobTitle: record.occupation,
      };
    case 'trainer':
      return { name: record.trainings.trainer_name, jobTitle: record.trainings.trainer_job_title };
    case 'verifier':
      return {
        name: record.trainings.verifier_name ?? '',
        jobTitle: record.trainings.verifier_job_title ?? '',
      };
    case 'admitter':
      return { name: record.admitted_by_name ?? '', jobTitle: record.admitted_by_job_title ?? '' };
  }
}

type Signing = {
  session: SigningSession;
  identities: Awaited<ReturnType<typeof createSigningIdentities>>;
  /** The account's own name, the one its certificate carries. */
  accountName: string;
  clientIp: string | null;
  userAgent: string | null;
};

const signedWith =
  (signing: Signing, identity: Awaited<ReturnType<Signing['identities']['identityFor']>>) =>
  async (toSign: ArrayBuffer, prepared: ArrayBuffer) => {
    await checkToSign(prepared, toSign, identity.certificatePem);
    return signing.identities.signWithIdentity(identity, toSign);
  };

type RequestForSigning = {
  id: string;
  organization_id: string;
  client_id: string;
  training_record_id: string | null;
  test_sheet_id: string | null;
  slot: SignatureRequestSlot;
  state: string;
  signer_account_id: string | null;
};

// The request was checked as the signer's when the code was asked for; from here everything is
// the secret key's, as no policy lets a signer write a signature, and the database's checks on
// the evidence decide whether it stands.
async function signRequest(c: Context<ApiEnv>, requestId: string, signing: Signing) {
  const admin = adminClient(c.env);
  const { session } = signing;
  const request = await admin
    .from('signature_requests')
    .select(
      'id, organization_id, client_id, training_record_id, test_sheet_id, slot, state, signer_account_id'
    )
    .eq('id', requestId)
    .maybeSingle();
  if (request.error) throw new ApiError('service_unavailable');
  if (request.data?.state !== 'pending' || request.data.signer_account_id !== session.accountId) {
    throw requestNotPending();
  }
  if (request.data.test_sheet_id) return signTestSheetRequest(c, request.data, signing);
  return signRecordRequest(c, request.data, signing);
}

async function signRecordRequest(c: Context<ApiEnv>, request: RequestForSigning, signing: Signing) {
  const admin = adminClient(c.env);
  const { session } = signing;
  const requestId = request.id;
  const recordId = request.training_record_id!;
  const slot = request.slot as SignerSlot;
  const record = await admin
    .from('training_records')
    .select(
      'employee_id, occupation, admitted_by_name, admitted_by_job_title, employees(last_name, first_name), trainings(trainer_name, trainer_job_title, verifier_name, verifier_job_title), clients!training_records_client_id_fkey(archived_at)'
    )
    .eq('id', recordId)
    .maybeSingle();
  if (record.error || !record.data) throw new ApiError('service_unavailable');
  const row = record.data as unknown as RecordForSigning;
  if (row.clients.archived_at) throw clientArchived();
  const printed = printedSlot(slot, row);

  const ctx = signedSheetContext(c);
  const identity = await signing.identities.identityFor(session.accountId, signing.accountName);
  await placeRecord(ctx, recordId);
  const result = await applySignature(
    ctx,
    recordId,
    slot,
    { certificatePem: identity.certificatePem, chainPem: signing.identities.chainPem, ...printed },
    signedWith(signing, identity)
  );

  const evidence = await admin.from('training_signatures').insert({
    organization_id: request.organization_id,
    client_id: request.client_id,
    training_record_id: recordId,
    slot,
    request_id: requestId,
    method: 'electronic',
    signer_account_id: session.accountId,
    signer_name: printed.name,
    signer_job_title: printed.jobTitle || null,
    channel: session.channel,
    address: session.address,
    code_sent_at: session.codeSentAt.toISOString(),
    code_verified_at: (session.verifiedAt ?? result.signedAt).toISOString(),
    signed_at: result.signedAt.toISOString(),
    digest_before: result.digestBefore,
    digest_after: result.digestAfter,
    certificate_serial: identity.certificateSerial,
    client_ip: signing.clientIp,
    user_agent: signing.userAgent?.slice(0, 500) ?? null,
    signing_session_id: session.id,
  });
  if (evidence.error) {
    // The sheet carries a signature without evidence and its field is spent: the request stays
    // as the database left it, and only a void moves the record to a fresh row.
    console.error(
      `Training signature evidence failed for sheet ${result.sheetId} v${result.version}: ${evidence.error.code ?? 'no code'} ${evidence.error.message ?? ''}`
    );
    throw fromDatabaseError(evidence.error, 'training signature evidence');
  }
  return { employeeId: row.employee_id };
}

type SheetForSigning = {
  employee_id: string;
  employees: {
    last_name: string;
    first_name: string;
    job_title: string;
    job_positions: { name: string } | null;
  };
  test_results: { examiner_name: string | null; examiner_job_title: string | null };
  clients: { archived_at: string | null };
};

async function signTestSheetRequest(
  c: Context<ApiEnv>,
  request: RequestForSigning,
  signing: Signing
) {
  const admin = adminClient(c.env);
  const { session } = signing;
  const slot = request.slot as TestSheetSignerSlot;
  const read = await admin
    .from('test_sheets')
    .select(
      'employee_id, employees!test_sheets_employee_of_client(last_name, first_name, job_title, job_positions(name)), test_results!test_sheets_result_of_client(examiner_name, examiner_job_title), clients!test_sheets_client_id_fkey(archived_at)'
    )
    .eq('id', request.test_sheet_id!)
    .maybeSingle();
  if (read.error || !read.data) throw new ApiError('service_unavailable');
  const sheet = read.data as unknown as SheetForSigning;
  if (sheet.clients.archived_at) throw clientArchived();
  const printed =
    slot === 'trainee'
      ? {
          name: `${sheet.employees.last_name} ${sheet.employees.first_name}`,
          jobTitle: sheet.employees.job_positions?.name?.trim() || sheet.employees.job_title,
        }
      : {
          name: sheet.test_results.examiner_name ?? '',
          jobTitle: sheet.test_results.examiner_job_title ?? '',
        };
  if (!printed.name) throw requestNotPending();

  const identity = await signing.identities.identityFor(session.accountId, signing.accountName);
  const result = await applyTestSheetSignature(
    testSheetDeps(c),
    request.test_sheet_id!,
    slot,
    {
      certificatePem: identity.certificatePem,
      chainPem: signing.identities.chainPem,
      name: printed.name,
    },
    signedWith(signing, identity)
  );

  const evidence = await admin.from('test_sheet_signatures').insert({
    organization_id: request.organization_id,
    client_id: request.client_id,
    test_sheet_id: request.test_sheet_id!,
    slot,
    request_id: request.id,
    method: 'electronic',
    signer_account_id: session.accountId,
    signer_name: printed.name,
    signer_job_title: printed.jobTitle || null,
    channel: session.channel,
    address: session.address,
    code_sent_at: session.codeSentAt.toISOString(),
    code_verified_at: (session.verifiedAt ?? result.signedAt).toISOString(),
    signed_at: result.signedAt.toISOString(),
    digest_before: result.digestBefore,
    digest_after: result.digestAfter,
    certificate_serial: identity.certificateSerial,
    client_ip: signing.clientIp,
    user_agent: signing.userAgent?.slice(0, 500) ?? null,
    signing_session_id: session.id,
  });
  if (evidence.error) {
    // As on a sheet row: the field is spent, and the request stays as the database left it.
    console.error(
      `Test sheet signature evidence failed for ${request.test_sheet_id} v${result.version}: ${evidence.error.code ?? 'no code'} ${evidence.error.message ?? ''}`
    );
    throw fromDatabaseError(evidence.error, 'test sheet signature evidence');
  }
  return { employeeId: sheet.employee_id };
}

async function agreementStates(c: Context<ApiEnv>, employeeIds: string[]) {
  const states = new Map<string, SigningAgreementState>();
  if (employeeIds.length === 0) return states;
  const { data, error } = await adminClient(c.env)
    .from('employee_signing_agreements')
    .select('employee_id, state')
    .in('employee_id', [...new Set(employeeIds)]);
  if (error) throw fromDatabaseError(error, 'signing agreement states');
  for (const row of data) states.set(row.employee_id, row.state as SigningAgreementState);
  return states;
}

async function memberName(c: Context<ApiEnv>, accountId: string) {
  const { data, error } = await adminClient(c.env)
    .from('profiles')
    .select('full_name')
    .eq('user_id', accountId)
    .maybeSingle();
  if (error) throw new ApiError('service_unavailable');
  return data?.full_name?.trim() || c.get('user').email || accountId;
}

const signingUnavailable = (reason: 'signer_unavailable' | 'pdf_unavailable') =>
  new ApiError(
    'service_unavailable',
    'Signing is not available right now. Nothing was signed and the code is not spent.',
    undefined,
    reason
  );

async function signSession(
  c: Context<ApiEnv>,
  sessionId: string,
  code: string,
  participation: Participation | null
): Promise<SignSessionResponse> {
  // Before the code is spent: without the authority's secrets, the signer or the converter
  // nothing can be signed.
  const identities = await createSigningIdentities(c);
  if (!createSigner(c)) throw signingUnavailable('signer_unavailable');
  if (!createPdfConverter(c)) throw signingUnavailable('pdf_unavailable');
  const session = await signingSessionsOf(c).verify({
    sessionId,
    accountId: c.get('user').id,
    code,
    place: participation ? 'portal' : 'app',
    participantId: participation?.participantId ?? null,
  });
  const { data: items, error } = await adminClient(c.env)
    .from('signing_session_items')
    .select('request_id, agreement_employee_id, agreement_party, agreement_digest')
    .eq('session_id', session.id)
    .order('position');
  if (error) throw fromDatabaseError(error, 'signing session items');

  const signing: Signing = {
    session,
    identities,
    accountName: participation?.fullName ?? (await memberName(c, session.accountId)),
    clientIp: clientIpOf(c),
    userAgent: c.req.header('user-agent') ?? null,
  };
  const answer: SignSessionResponse = { signed: [], failed: [], agreements: [] };
  const signedEmployees: string[] = [];
  const agreementResults: {
    employeeId: string;
    party: SigningAgreementParty;
    reason: SigningItemFailureReason | null;
  }[] = [];

  for (const item of items) {
    if (item.agreement_employee_id && item.agreement_party) {
      const party = item.agreement_party as SigningAgreementParty;
      const employeeId = item.agreement_employee_id;
      try {
        if (!participation) throw new ApiError('forbidden');
        await signAgreement(c, signing.identities, {
          clientId: participation.clientId,
          employeeId,
          party,
          signer: { accountId: session.accountId, name: participation.fullName },
          accountName: signing.accountName,
          digest: item.agreement_digest,
          session,
          clientIp: signing.clientIp,
          userAgent: signing.userAgent,
        });
        agreementResults.push({ employeeId, party, reason: null });
      } catch (failure) {
        agreementResults.push({ employeeId, party, reason: failureReasonOf(failure) });
      }
      continue;
    }
    const requestId = item.request_id!;
    try {
      const { employeeId } = await signRequest(c, requestId, signing);
      signedEmployees.push(employeeId);
      answer.signed.push({ requestId, agreementState: null });
    } catch (failure) {
      answer.failed.push({ requestId, reason: failureReasonOf(failure) });
    }
  }

  const states = await agreementStates(c, [
    ...signedEmployees,
    ...agreementResults.map((result) => result.employeeId),
  ]);
  answer.signed = answer.signed.map((each, index) => ({
    ...each,
    agreementState: states.get(signedEmployees[index]!) ?? null,
  }));
  answer.agreements = agreementResults.map(({ employeeId, party, reason }) => ({
    employeeId,
    party,
    signed: reason === null,
    reason,
    agreementState: states.get(employeeId) ?? null,
  }));
  return answer;
}

export const signMySigningSession: RouteHandler<typeof signMySigningSessionRoute, ApiEnv> = async (
  c
) => {
  const { sessionId } = c.req.valid('param');
  const { code } = c.req.valid('json');
  return c.json(await signSession(c, sessionId, code, null), 200);
};

export const signPortalSigningSession: RouteHandler<
  typeof signPortalSigningSessionRoute,
  ApiEnv
> = async (c) => {
  const { participantId, sessionId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  const { code } = c.req.valid('json');
  return c.json(await signSession(c, sessionId, code, participation), 200);
};
