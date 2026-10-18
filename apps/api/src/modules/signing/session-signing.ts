import type { RouteHandler } from '@hono/zod-openapi';
import {
  signatureErrorReasons,
  type SignerSlot,
  type SigningAgreementParty,
  type SigningAgreementState,
  type SigningItemFailureReason,
  signingItemFailureReasons,
  type SigningSessionItem,
  type SignSessionResponse,
} from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { type Participation, participationOf } from '../../lib/participant';
import { applySignature, placeRecord, signedSheetContext } from '../signed-sheets/signed-sheets';
import { awaits, signAgreement } from './agreement-signing';
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

// On Cloudflare the client's address is this header; elsewhere there is none to trust.
const clientIpOf = (c: Context<ApiEnv>) => c.req.header('cf-connecting-ip') ?? null;

type Item =
  | { kind: 'request'; requestId: string }
  | { kind: 'agreement'; employeeId: string; party: SigningAgreementParty };

async function pendingRequests(
  db: DataClient,
  accountId: string,
  requestIds: string[],
  scope: { clientId: string } | { member: true }
) {
  if (requestIds.length === 0) return;
  let query = db
    .from('signature_requests')
    .select('id, slot')
    .in('id', requestIds)
    .eq('signer_account_id', accountId)
    .eq('state', 'pending');
  if ('clientId' in scope) query = query.eq('client_id', scope.clientId);
  const { data, error } = await query;
  if (error) throw fromDatabaseError(error, 'signing session requests');
  // The trainee always signs in the portal, as the employee's own participant.
  const usable = new Set(
    data
      .filter((row) => 'clientId' in scope || (row.slot as SignerSlot) !== 'trainee')
      .map((row) => row.id)
  );
  const missing = requestIds.findIndex((id) => !usable.has(id));
  if (missing >= 0) {
    throw notFound(
      `requestIds.${missing}`,
      'This request is not pending, or is not addressed to you here.'
    );
  }
}

async function awaitedAgreements(
  db: DataClient,
  participation: Participation,
  employeeIds: string[]
): Promise<Item[]> {
  if (employeeIds.length === 0) return [];
  const party: SigningAgreementParty =
    participation.kind === 'client_administrator' ? 'employer' : 'employee';
  const { data, error } = await db
    .from('employee_signing_agreements')
    .select(
      'employee_id, organization_id, state, storage_path, employee_signed_at, employer_signed_at'
    )
    .eq('client_id', participation.clientId)
    .in('employee_id', employeeIds);
  if (error) throw fromDatabaseError(error, 'signing session agreements');
  const missing = employeeIds.findIndex(
    (id) =>
      (party === 'employee' && id !== participation.employeeId) ||
      !awaits(data.find((row) => row.employee_id === id) ?? null, party)
  );
  if (missing >= 0) {
    throw notFound(
      `agreementEmployeeIds.${missing}`,
      'This signing agreement does not await your signature.'
    );
  }
  return employeeIds.map((employeeId) => ({ kind: 'agreement', employeeId, party }));
}

async function createSession(
  c: Context<ApiEnv>,
  items: Item[],
  signer: { clientId: string; place: SigningPlace }
) {
  const accountId = c.get('user').id;
  await createSigningIdentities(c);
  const contact = await signerContact(createAdminClient(c), { accountId, ...signer });
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
      channel: contact.channel,
      address: contact.address,
      clientIp: clientIpOf(c),
      userAgent: c.req.header('user-agent') ?? null,
    },
    async (id) => {
      const { error } = await createAdminClient(c)
        .from('signing_session_items')
        .insert(
          items.map((item, position) => ({
            session_id: id,
            position,
            request_id: item.kind === 'request' ? item.requestId : null,
            agreement_employee_id: item.kind === 'agreement' ? item.employeeId : null,
            agreement_party: item.kind === 'agreement' ? item.party : null,
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
    items: items as SigningSessionItem[],
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
  await pendingRequests(createDataClient(c), c.get('user').id, requestIds, { member: true });
  const items: Item[] = requestIds.map((requestId) => ({ kind: 'request', requestId }));
  return c.json(await createSession(c, items, { clientId: '', place: 'app' }), 201);
};

export const createPortalSigningSession: RouteHandler<
  typeof createPortalSigningSessionRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  const { requestIds, agreementEmployeeIds = [] } = c.req.valid('json');
  const db = createDataClient(c);
  const agreements = await awaitedAgreements(db, participation, agreementEmployeeIds);
  await pendingRequests(db, c.get('user').id, requestIds, { clientId: participation.clientId });
  const items: Item[] = [
    ...agreements,
    ...requestIds.map((requestId): Item => ({ kind: 'request', requestId })),
  ];
  return c.json(
    await createSession(c, items, { clientId: participation.clientId, place: 'portal' }),
    201
  );
};

const failureReasonOf = (error: unknown): SigningItemFailureReason => {
  const reason = error instanceof ApiError ? error.reason : undefined;
  const known = signingItemFailureReasons.find((each) => each === reason);
  if (known) return known;
  console.error(
    `A signing session item failed: ${error instanceof Error ? `${error.name} ${error.message}` : 'unknown'}`
  );
  return 'signing_failed';
};

const requestNotPending = () =>
  new ApiError('conflict', undefined, undefined, 'request_not_pending');

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
};

function printedSlot(slot: SignerSlot, record: RecordForSigning) {
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
  clientIp: string | null;
  userAgent: string | null;
};

// The request was checked as the signer's when the code was asked for; from here everything is
// the secret key's, as no policy lets a signer write a signature.
async function signRequest(c: Context<ApiEnv>, requestId: string, signing: Signing) {
  const admin = createAdminClient(c);
  const { session } = signing;
  const request = await admin
    .from('signature_requests')
    .select('id, organization_id, client_id, training_record_id, slot, state, signer_account_id')
    .eq('id', requestId)
    .maybeSingle();
  if (request.error) throw new ApiError('service_unavailable');
  if (request.data?.state !== 'pending' || request.data.signer_account_id !== session.accountId) {
    throw requestNotPending();
  }
  const { training_record_id: recordId, slot } = request.data;
  const record = await admin
    .from('training_records')
    .select(
      'employee_id, occupation, admitted_by_name, admitted_by_job_title, employees(last_name, first_name), trainings(trainer_name, trainer_job_title, verifier_name, verifier_job_title)'
    )
    .eq('id', recordId)
    .maybeSingle();
  if (record.error || !record.data) throw new ApiError('service_unavailable');
  const printed = printedSlot(slot, record.data as RecordForSigning);

  const ctx = signedSheetContext(c);
  const identity = await signing.identities.identityFor(session.accountId, printed.name);
  await placeRecord(ctx, recordId);
  const signedAt = new Date();
  const result = await applySignature(
    ctx,
    recordId,
    slot,
    { certificatePem: identity.certificatePem, chainPem: signing.identities.chainPem, ...printed },
    signedAt,
    (toSign) => signing.identities.signWithIdentity(identity, toSign)
  );

  const evidence = await admin.from('training_signatures').insert({
    organization_id: request.data.organization_id,
    client_id: request.data.client_id,
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
    code_verified_at: (session.verifiedAt ?? signedAt).toISOString(),
    signed_at: signedAt.toISOString(),
    digest_before: result.digestBefore,
    digest_after: result.digestAfter,
    certificate_serial: identity.certificateSerial,
    client_ip: signing.clientIp,
    user_agent: signing.userAgent?.slice(0, 500) ?? null,
    signing_session_id: session.id,
  });
  if (evidence.error) {
    // The sheet carries a signature without evidence and its field is spent: the request stays
    // pending, and only a void moves the record to a fresh row.
    console.error(
      `Training signature evidence failed for sheet ${result.sheetId} v${result.version}: ${evidence.error.code ?? 'no code'}`
    );
    throw new ApiError('service_unavailable');
  }
  const signed = await admin
    .from('signature_requests')
    .update({ state: 'signed', signing_session_id: session.id })
    .eq('id', requestId)
    .eq('state', 'pending');
  if (signed.error) {
    console.error(`Signature request not marked signed: ${signed.error.code ?? 'no code'}`);
  }
  return { employeeId: record.data.employee_id };
}

async function agreementStates(c: Context<ApiEnv>, employeeIds: string[]) {
  const states = new Map<string, SigningAgreementState>();
  if (employeeIds.length === 0) return states;
  const { data, error } = await createAdminClient(c)
    .from('employee_signing_agreements')
    .select('employee_id, state')
    .in('employee_id', [...new Set(employeeIds)]);
  if (error) throw fromDatabaseError(error, 'signing agreement states');
  for (const row of data) states.set(row.employee_id, row.state as SigningAgreementState);
  return states;
}

async function signSession(
  c: Context<ApiEnv>,
  sessionId: string,
  code: string,
  participation: Participation | null
): Promise<SignSessionResponse> {
  // Before the code is spent: without the authority's secrets nothing can be signed.
  const identities = await createSigningIdentities(c);
  const session = await signingSessionsOf(c).verify({
    sessionId,
    accountId: c.get('user').id,
    code,
  });
  const { data: items, error } = await createAdminClient(c)
    .from('signing_session_items')
    .select('request_id, agreement_employee_id, agreement_party')
    .eq('session_id', session.id)
    .order('position');
  if (error) throw fromDatabaseError(error, 'signing session items');

  const signing: Signing = {
    session,
    identities,
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
          signer: {
            accountId: session.accountId,
            name: await agreementSignerName(c, participation, employeeId, party),
          },
          session,
          clientIp: signing.clientIp,
          userAgent: signing.userAgent,
          signedAt: new Date(),
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

// The employee signs under the name the agreement prints; the administrator under their own.
async function agreementSignerName(
  c: Context<ApiEnv>,
  participation: Participation,
  employeeId: string,
  party: SigningAgreementParty
) {
  if (party === 'employer') return participation.fullName;
  const { data, error } = await createAdminClient(c)
    .from('employees')
    .select('last_name, first_name')
    .eq('id', employeeId)
    .eq('client_id', participation.clientId)
    .maybeSingle();
  if (error || !data) throw new ApiError('service_unavailable');
  return `${data.last_name} ${data.first_name}`;
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
