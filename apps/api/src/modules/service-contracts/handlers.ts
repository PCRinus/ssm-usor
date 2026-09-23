import type { RouteHandler } from '@hono/zod-openapi';
import {
  otherDocumentTypes,
  serviceContractConflictReasons,
  type ServiceContractResponse,
  serviceContractTypeKey,
} from '@ssm-usor/contracts';

import {
  archivedClientError,
  createDataClient,
  type DataClient,
  fromDatabaseError,
} from '../../lib/db';
import { type ApiEnv, appOrigin } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createFileStore } from '../../lib/files';
import { createToken, hashToken } from '../../lib/tokens';
import { stableJson } from '../documents/context';
import { generateOtherDocument, readOtherDocument } from '../documents/documents';
import { buildServiceContractContext } from './context';
import { loadServiceContractFacts, missingServiceContractData } from './facts';
import type {
  generateServiceContractRoute,
  getServiceContractRoute,
  saveServiceContractRoute,
  sendServiceContractRoute,
} from './routes';

// The register usually starts again each year, so the year of the contract decides.
async function suggestedNumber(db: DataClient, year: number) {
  const inYear = await db
    .from('service_contracts')
    .select('contract_number')
    .gte('contract_date', `${year}-01-01`)
    .lte('contract_date', `${year}-12-31`)
    .order('contract_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (inYear.error) throw fromDatabaseError(inYear.error, 'last contract number of the year');
  if (inYear.data) return inYear.data.contract_number + 1;
  const any = await db.from('service_contracts').select('id').limit(1).maybeSingle();
  if (any.error) throw fromDatabaseError(any.error, 'any contract');
  return any.data ? 1 : null;
}

async function respond(db: DataClient, clientId: string): Promise<ServiceContractResponse> {
  const facts = await loadServiceContractFacts(db, clientId);
  const year = Number((facts.contract?.contractDate ?? new Date().toISOString()).slice(0, 4));
  const [suggested, { document, draftSnapshot }] = await Promise.all([
    facts.contract ? null : suggestedNumber(db, year),
    readOtherDocument(db, clientId, serviceContractTypeKey),
  ]);
  const missing = missingServiceContractData(facts);
  // What the draft printed against what it would print now. Only the names it printed count,
  // and a draft that was uploaded printed none.
  const current: Record<string, unknown> | null =
    facts.contract && missing.length === 0
      ? buildServiceContractContext({ ...facts, contract: facts.contract })
      : null;
  const draftOutdated =
    current !== null &&
    draftSnapshot !== null &&
    Object.entries(draftSnapshot as Record<string, unknown>).some(
      ([name, printed]) => stableJson(current[name]) !== stableJson(printed)
    );
  return {
    contract: facts.contract,
    suggestedNumber: suggested,
    clientRepresentative: {
      name: facts.client.legal_representative_name,
      role: facts.client.legal_representative_role,
    },
    readiness: { ready: missing.length === 0, missing },
    document,
    lastSend: document?.issued ? await lastSendOf(db, document.issued.id) : null,
    draftOutdated,
  };
}

async function lastSendOf(db: DataClient, revisionId: string) {
  const { data, error } = await db
    .from('service_contract_sends')
    .select('sent_to, sent_at, document_revisions(revision)')
    .eq('revision_id', revisionId)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'last send of the service contract');
  return data
    ? { sentTo: data.sent_to, sentAt: data.sent_at, revision: data.document_revisions.revision }
    : null;
}

const returnLinkDays = 60;

// Workers have no Buffer; `btoa` takes a binary string, built in chunks that fit the stack.
function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export const getServiceContract: RouteHandler<typeof getServiceContractRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  return c.json(await respond(createDataClient(c), clientId), 200);
};

export const saveServiceContract: RouteHandler<typeof saveServiceContractRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const userId = c.get('user').id;

  // The client first: a lead or a client that is not there answers 404 before anything is
  // written, and an archived one is refused by its trigger.
  const representative = {
    ...(body.clientRepresentativeName !== undefined && {
      legal_representative_name: body.clientRepresentativeName,
    }),
    ...(body.clientRepresentativeRole !== undefined && {
      legal_representative_role: body.clientRepresentativeRole,
    }),
  };
  const client =
    Object.keys(representative).length > 0
      ? await db
          .from('clients')
          .update(representative)
          .eq('id', clientId)
          .select('id')
          .maybeSingle()
      : await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (client.error) throw fromDatabaseError(client.error, 'client of the service contract');
  if (!client.data) {
    throw new ApiError('not_found', 'This client does not exist in your organization.');
  }

  const details = {
    contract_number: body.contractNumber,
    contract_date: body.contractDate,
    start_date: body.startDate,
    duration_months: body.durationMonths,
    renews_automatically: body.renewsAutomatically,
    covers_occupational_safety: body.coversOccupationalSafety,
    covers_fire_safety: body.coversFireSafety,
    updated_by: userId,
  };
  // An update, then an insert: an upsert would write `created_by` again on every save.
  let saved = await db
    .from('service_contracts')
    .update(details)
    .eq('client_id', clientId)
    .select('id')
    .maybeSingle();
  if (!saved.error && !saved.data) {
    saved = await db
      .from('service_contracts')
      .insert({
        ...details,
        organization_id: c.get('membership').organizationId,
        client_id: clientId,
        created_by: userId,
      })
      .select('id')
      .single();
  }
  if (saved.error?.code === '23505') {
    throw new ApiError(
      'conflict',
      'Another contract of that year has this number.',
      undefined,
      serviceContractConflictReasons.numberTaken
    );
  }
  if (saved.error) throw fromDatabaseError(saved.error, 'save service contract');
  return c.json(await respond(db, clientId), 200);
};

export const generateServiceContract: RouteHandler<
  typeof generateServiceContractRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  const facts = await loadServiceContractFacts(db, clientId);
  if (facts.client.archived_at) throw archivedClientError();
  const missing = missingServiceContractData(facts);
  if (!facts.contract || missing.length > 0) {
    throw new ApiError(
      'conflict',
      `Data the contract prints is missing: ${missing.join(', ')}.`,
      undefined,
      serviceContractConflictReasons.missingData
    );
  }
  const membership = c.get('membership');
  await generateOtherDocument(
    db,
    createFileStore(c),
    // During an impersonation the row records the platform admin, as elsewhere.
    {
      userId: membership.userId,
      organizationId: membership.organizationId,
      createdBy: c.get('user').id,
    },
    clientId,
    {
      typeKey: serviceContractTypeKey,
      title: otherDocumentTypes[serviceContractTypeKey],
      ownersOnly: true,
    },
    buildServiceContractContext({ ...facts, contract: facts.contract })
  );
  return c.json(await respond(db, clientId), 200);
};

export const sendServiceContract: RouteHandler<typeof sendServiceContractRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const { to, note } = c.req.valid('json');
  const mail = c.env.MAIL;
  if (!mail) throw new ApiError('service_unavailable');
  const db = createDataClient(c);
  const user = c.get('user');
  // Replies and the copy go to the owner, so an account without an address cannot send.
  if (!user.email) throw new ApiError('conflict', 'Your account has no email address.');

  const facts = await loadServiceContractFacts(db, clientId);
  if (facts.client.archived_at) throw archivedClientError();
  const { document } = await readOtherDocument(db, clientId, serviceContractTypeKey);
  if (!facts.contract || !document?.issued) {
    throw new ApiError(
      'conflict',
      'Only an issued contract is sent.',
      undefined,
      serviceContractConflictReasons.notIssued
    );
  }
  const [revision, profile, organization] = await Promise.all([
    db.from('document_revisions').select('pdf_path').eq('id', document.issued.id).single(),
    db.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
    db.from('organizations').select('name').single(),
  ]);
  if (revision.error) throw fromDatabaseError(revision.error, 'issued contract revision');
  if (profile.error) throw fromDatabaseError(profile.error, 'profile of the sender');
  if (organization.error) throw fromDatabaseError(organization.error, 'organization of the sender');
  if (!revision.data.pdf_path) {
    // Issued where no converter was configured. The Word file is not sent in its place: it
    // invites the recipient to change clauses.
    throw new ApiError(
      'conflict',
      'The issued contract has no PDF to send.',
      undefined,
      serviceContractConflictReasons.pdfMissing
    );
  }

  const pdf = await createFileStore(c).readDocument(revision.data.pdf_path);
  const { contractNumber, contractDate } = facts.contract;
  // The return link: the token goes out in the email, its hash stays with the send.
  const token = createToken();
  const returnUrl = new URL('/contract', appOrigin(c.env));
  returnUrl.searchParams.set('token', token);
  let receipt;
  try {
    receipt = await mail.sendServiceContract({
      to,
      senderEmail: user.email,
      senderName: profile.data?.full_name ?? null,
      organizationName: facts.organization.legal_name ?? organization.data.name,
      clientName: facts.client.legal_name,
      contractNumber,
      contractDate,
      note: note ?? null,
      returnUrl: returnUrl.href,
      attachment: {
        fileName: `Contract nr. ${contractNumber} din ${contractDate.split('-').reverse().join('.')}.pdf`,
        contentBase64: toBase64(pdf),
      },
    });
  } catch (cause) {
    console.error(`The service contract could not be emailed: ${String(cause)}`);
    throw new ApiError('service_unavailable', 'The email could not be sent.');
  }

  // After the email: a send that is recorded was handed to the provider.
  const recorded = await db.from('service_contract_sends').insert({
    organization_id: c.get('membership').organizationId,
    document_id: document.id,
    revision_id: document.issued.id,
    sent_to: to,
    note: note ?? null,
    provider_message_id: receipt.id,
    sent_by: user.id,
    token_hash: await hashToken(token),
    return_expires_at: new Date(Date.now() + returnLinkDays * 86_400_000).toISOString(),
  });
  if (recorded.error) throw fromDatabaseError(recorded.error, 'record service contract send');
  return c.json(await respond(db, clientId), 200);
};
