import type { RouteHandler } from '@hono/zod-openapi';
import {
  type PortalSignatureRequest,
  type RecordSignaturesResponse,
  signatureErrorReasons,
  type SignatureRequestItem,
  type SignatureRequestState,
  type SignerSlot,
  type SigningAgreementResponse,
  type SigningAgreementState,
  type SigningAgreementSummary,
  type SigningAgreementUnavailable,
  type SupplementaryTrainingReason,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';
import { buildSigningAgreementData, signingTypeKeys } from '@ssm-usor/document-engine';
import type { Context } from 'hono';

import { printedAddress } from '../../lib/address';
import { createAdminClient } from '../../lib/admin-db';
import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore, createFileStore } from '../../lib/files';
import { participationOf } from '../../lib/participant';
import { requirePdfConverter } from '../../lib/pdf';
import { collator } from '../../lib/romanian';
import { builtInTemplates, merge } from '../documents/documents';
import { signedSheetContext, voidRow } from '../signed-sheets/signed-sheets';
import { awaitedParty, awaits } from './agreement-state';
import {
  nameIn,
  recordSlots,
  requestColumns,
  type RequestRow,
  signatureColumns,
  type SignatureRow,
} from './record-slots';
import type {
  getPortalEmployeeSigningAgreementRoute,
  getPortalSigningAgreementRoute,
  getPortalSigningAgreementStateRoute,
  getRecordSignaturesRoute,
  getSigningAgreementRoute,
  getSigningAgreementStateRoute,
  listClientSignatureRequestsRoute,
  listMySignatureRequestsRoute,
  listPortalClientSignatureRequestsRoute,
  listPortalSignatureRequestsRoute,
  listPortalSigningAgreementsRoute,
  listSignerCandidatesRoute,
  markPaperSignatureRoute,
  putSigningAgreementStateRoute,
  voidRecordSignaturesRoute,
} from './routes';
import { contactOf, signersOfClient } from './signers';

const noSuchClient = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');
const noSuchRecord = () =>
  new ApiError('not_found', 'This training record does not exist under this client.');
const noSuchEmployee = () =>
  new ApiError('not_found', 'This employee does not exist under this client.');
// The agreement names the representative who signs it for the employer, as a document would.
const noRepresentative = (client: {
  legal_representative_name: string | null;
  legal_representative_role: string | null;
}) =>
  new ApiError(
    'conflict',
    "The client's legal representative, who signs the signing agreement for the employer, is not filled in.",
    undefined,
    'missing_document_data',
    missingRepresentative(client)
  );

type RepresentativeColumns = {
  legal_representative_name: string | null;
  legal_representative_role: string | null;
};

const missingRepresentative = (client: RepresentativeColumns) => [
  ...(client.legal_representative_name?.trim() ? [] : (['client.representativeName'] as const)),
  ...(client.legal_representative_role?.trim() ? [] : (['client.representativeRole'] as const)),
];

const representativeMissing = (client: RepresentativeColumns) =>
  missingRepresentative(client).length > 0;

const toIso = (value: string) => new Date(value).toISOString();
const toIsoOrNull = (value: string | null) => (value ? toIso(value) : null);

async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'signing client');
  if (!data) throw noSuchClient();
}

export const listSignerCandidates: RouteHandler<typeof listSignerCandidatesRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const seen = new Set<string>();
  const items = (await signersOfClient(db, clientId)).flatMap(
    ({ accountId, name, jobTitle, kind, employeeId }) => {
      if (seen.has(accountId)) return [];
      seen.add(accountId);
      return [{ accountId, name, jobTitle, kind, employeeId }];
    }
  );
  return c.json({ items }, 200);
};

async function recordSignatures(
  db: DataClient,
  clientId: string,
  recordId: string
): Promise<RecordSignaturesResponse> {
  const [record, requests, signatures] = await Promise.all([
    db
      .from('training_records')
      .select('id, admitted_on, trainings!inner(verifier_name)')
      .eq('id', recordId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('signature_requests')
      .select(requestColumns)
      .eq('training_record_id', recordId)
      .order('created_at', { ascending: false }),
    db
      .from('training_signatures')
      .select(signatureColumns)
      .eq('training_record_id', recordId)
      .order('created_at', { ascending: false }),
  ]);
  if (record.error) throw fromDatabaseError(record.error, 'signatures record');
  if (requests.error) throw fromDatabaseError(requests.error, 'record signature requests');
  if (signatures.error) throw fromDatabaseError(signatures.error, 'record signatures');
  if (!record.data) throw noSuchRecord();
  const requestRows = requests.data as RequestRow[];
  const signatureRows = signatures.data as SignatureRow[];
  const named =
    requestRows.some((row) => row.signer_account_id) ||
    signatureRows.some((row) => row.signer_account_id);
  const directory = named ? await signersOfClient(db, clientId) : [];
  return {
    recordId,
    slots: recordSlots(
      {
        verifierName: record.data.trainings.verifier_name,
        admittedOn: record.data.admitted_on,
      },
      requestRows,
      signatureRows,
      directory
    ),
    hasSignatures: signatureRows.length > 0,
  };
}

// The functions find the record in the caller's organization; the client in the path is checked
// here, so a record of another client is a 404 as everywhere else.
async function requireRecord(db: DataClient, clientId: string, recordId: string) {
  const { data, error } = await db
    .from('training_records')
    .select('id')
    .eq('id', recordId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'signing record');
  if (!data) throw noSuchRecord();
}

function fromSigningFunctionError(
  error: { code?: string | null; message?: string },
  context: string
) {
  if (error.code === 'P0002') return noSuchRecord();
  return fromDatabaseError(error, context);
}

export const getRecordSignatures: RouteHandler<typeof getRecordSignaturesRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  return c.json(await recordSignatures(createDataClient(c), clientId, recordId), 200);
};

export const markPaperSignature: RouteHandler<typeof markPaperSignatureRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  const { slot, signerName, signerJobTitle } = c.req.valid('json');
  const db = createDataClient(c);
  await requireRecord(db, clientId, recordId);
  const { error } = await db.rpc('mark_paper_signature', {
    p_record_id: recordId,
    p_slot: slot,
    p_signer_name: signerName,
    p_signer_job_title: signerJobTitle ?? undefined,
  });
  if (error) throw fromSigningFunctionError(error, 'mark paper signature');
  return c.json(await recordSignatures(db, clientId, recordId), 200);
};

export const voidRecordSignatures: RouteHandler<typeof voidRecordSignaturesRoute, ApiEnv> = async (
  c
) => {
  const { clientId, recordId } = c.req.valid('param');
  const { reason } = c.req.valid('json');
  const db = createDataClient(c);
  await requireRecord(db, clientId, recordId);
  const { error } = await db.rpc('void_training_signatures', {
    p_record_id: recordId,
    p_reason: reason,
  });
  if (error) throw fromSigningFunctionError(error, 'void training signatures');
  // The database has voided the row; the sheet's "anulat" follows here or on its next write.
  try {
    await voidRow(signedSheetContext(c), recordId);
  } catch (failure) {
    if (!(failure instanceof ApiError && failure.reason === 'record_not_on_sheet')) {
      console.error(
        `The voided row of ${recordId} was not marked on its sheet: ${failure instanceof ApiError ? (failure.reason ?? failure.code) : failure instanceof Error ? failure.name : 'unknown'}`
      );
    }
  }
  return c.json(await recordSignatures(db, clientId, recordId), 200);
};

const listColumns =
  'id, slot, state, signer_account_id, issued_at, notified_at, clients!signature_requests_client_id_fkey(id, legal_name), training_records!signature_requests_record_of_client(id, training_id, employees(id, last_name, first_name, employee_signing_agreements(state, employee_signed_at, employer_signed_at)), trainings(domain, phase, held_on))';

// Any embed may come back null when a policy hides its row; such a request is left out.
type ListRow = {
  id: string;
  slot: SignerSlot;
  state: SignatureRequestState;
  signer_account_id: string | null;
  issued_at: string;
  notified_at: string | null;
  clients: { id: string; legal_name: string } | null;
  training_records: {
    id: string;
    training_id: string;
    employees: {
      id: string;
      last_name: string;
      first_name: string;
      employee_signing_agreements: AgreementSummaryRow[] | null;
    } | null;
    trainings: { domain: TrainingDomain; phase: TrainingPhase; held_on: string } | null;
  } | null;
};

type VisibleListRow = ListRow & {
  clients: NonNullable<ListRow['clients']>;
  training_records: NonNullable<ListRow['training_records']> & {
    employees: NonNullable<NonNullable<ListRow['training_records']>['employees']>;
    trainings: NonNullable<NonNullable<ListRow['training_records']>['trainings']>;
  };
};

const visible = (row: ListRow): row is VisibleListRow =>
  !!row.clients && !!row.training_records?.employees && !!row.training_records.trainings;

type AgreementSummaryRow = {
  state: string;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

const agreementSummaryOf = (
  agreements: AgreementSummaryRow[] | null | undefined
): SigningAgreementSummary => {
  const row = agreements?.[0];
  return row
    ? {
        state: row.state as SigningAgreementState,
        employeeSignedAt: toIsoOrNull(row.employee_signed_at),
        employerSignedAt: toIsoOrNull(row.employer_signed_at),
      }
    : null;
};

const toListItem = (
  row: VisibleListRow,
  signer: SignatureRequestItem['signer']
): SignatureRequestItem => ({
  id: row.id,
  slot: row.slot,
  state: row.state,
  issuedAt: toIso(row.issued_at),
  notifiedAt: toIsoOrNull(row.notified_at),
  client: { id: row.clients.id, name: row.clients.legal_name },
  record: {
    id: row.training_records.id,
    trainingId: row.training_records.training_id,
    employee: {
      id: row.training_records.employees.id,
      lastName: row.training_records.employees.last_name,
      firstName: row.training_records.employees.first_name,
    },
    domain: row.training_records.trainings.domain,
    phase: row.training_records.trainings.phase,
    heldOn: row.training_records.trainings.held_on,
  },
  signer,
  agreement: agreementSummaryOf(row.training_records.employees.employee_signing_agreements),
});

export const listMySignatureRequests: RouteHandler<
  typeof listMySignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  // The member's own organization, and never a trainee's request, which the account signs in the
  // portal when it is also an employee somewhere.
  const { data, error } = await createDataClient(c)
    .from('signature_requests')
    .select(listColumns)
    .eq('signer_account_id', c.get('user').id)
    .eq('organization_id', c.get('membership').organizationId)
    .neq('slot', 'trainee')
    .eq('state', 'pending')
    .order('issued_at')
    .order('id')
    .limit(1000);
  if (error) throw fromDatabaseError(error, 'my signature requests');
  return c.json(
    {
      items: (data as unknown as ListRow[])
        .filter(visible)
        .map((row) => toListItem(row, { accountId: c.get('user').id, name: null })),
    },
    200
  );
};

export const listClientSignatureRequests: RouteHandler<
  typeof listClientSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { clientId } = c.req.valid('param');
  const { state } = c.req.valid('query');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('signature_requests')
    .select(listColumns)
    .eq('client_id', clientId)
    .eq('state', state)
    .order('issued_at')
    .order('id')
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'client signature requests');
  const rows = (data as unknown as ListRow[]).filter(visible);
  const directory = rows.some((row) => row.signer_account_id)
    ? await signersOfClient(db, clientId)
    : [];
  return c.json(
    { items: rows.map((row) => toListItem(row, nameIn(directory, row.signer_account_id))) },
    200
  );
};

// Policies choose the rows a participant reads, not the columns: every portal select names its
// columns, so the CNP and the notes never leave.
const portalRecordColumns =
  'id, occupation, admitted_on, admitted_by_name, admitted_by_job_title, employees(id, last_name, first_name, employee_signing_agreements(state, employee_signed_at, employer_signed_at)), trainings(domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason)';

type PortalRecordRow = {
  id: string;
  occupation: string;
  admitted_on: string | null;
  admitted_by_name: string | null;
  admitted_by_job_title: string | null;
  employees: {
    id: string;
    last_name: string;
    first_name: string;
    employee_signing_agreements: AgreementSummaryRow[];
  };
  trainings: {
    domain: TrainingDomain;
    phase: TrainingPhase;
    held_on: string;
    duration_minutes: number;
    material: string;
    trainer_name: string;
    trainer_job_title: string;
    verifier_name: string | null;
    verifier_job_title: string | null;
    supplementary_reason: SupplementaryTrainingReason | null;
  };
};

function printedSigner(slot: SignerSlot, record: PortalRecordRow) {
  switch (slot) {
    case 'trainee':
      return `${record.employees.last_name} ${record.employees.first_name}`;
    case 'trainer':
      return record.trainings.trainer_name;
    case 'verifier':
      return record.trainings.verifier_name ?? '';
    case 'admitter':
      return record.admitted_by_name ?? '';
  }
}

function toPortalRequest(
  request: { id: string; slot: SignerSlot; issued_at: string },
  record: PortalRecordRow
): PortalSignatureRequest {
  const training = record.trainings;
  return {
    id: request.id,
    slot: request.slot,
    issuedAt: toIso(request.issued_at),
    signerName: printedSigner(request.slot, record),
    record: {
      id: record.id,
      employee: {
        id: record.employees.id,
        lastName: record.employees.last_name,
        firstName: record.employees.first_name,
      },
      domain: training.domain,
      phase: training.phase,
      heldOn: training.held_on,
      durationMinutes: training.duration_minutes,
      material: training.material,
      trainer: { name: training.trainer_name, jobTitle: training.trainer_job_title },
      verifier:
        training.verifier_name !== null && training.verifier_job_title !== null
          ? { name: training.verifier_name, jobTitle: training.verifier_job_title }
          : null,
      supplementaryReason: training.supplementary_reason,
      occupation: record.occupation,
      admission:
        record.admitted_on && record.admitted_by_name
          ? {
              admittedOn: record.admitted_on,
              name: record.admitted_by_name,
              jobTitle: record.admitted_by_job_title ?? '',
            }
          : null,
    },
    agreement: agreementSummaryOf(record.employees.employee_signing_agreements),
  };
}

export const listPortalSignatureRequests: RouteHandler<
  typeof listPortalSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId } = participationOf(c, participantId);
  const { data: requests, error } = await createDataClient(c)
    .from('signature_requests')
    .select('id, slot, issued_at, training_record_id')
    .eq('signer_account_id', c.get('user').id)
    .eq('client_id', clientId)
    .eq('state', 'pending')
    .order('issued_at')
    .order('id')
    .limit(1000);
  if (error) throw fromDatabaseError(error, 'portal signature requests');
  if (requests.length === 0) return c.json({ items: [] }, 200);
  // A workplace manager signs other employees' admissions, whose records the participant
  // policies do not show. The request rows the signer read as themselves are the authorization
  // for reading these records, by id and client, with the secret key.
  const records = await createAdminClient(c)
    .from('training_records')
    .select(portalRecordColumns)
    .eq('client_id', clientId)
    .in('id', [...new Set(requests.map((request) => request.training_record_id))]);
  if (records.error) throw fromDatabaseError(records.error, 'portal signature records');
  const byId = new Map((records.data as unknown as PortalRecordRow[]).map((row) => [row.id, row]));
  return c.json(
    {
      items: requests.flatMap((request) => {
        const record = byId.get(request.training_record_id);
        return record ? [toPortalRequest(request, record)] : [];
      }),
    },
    200
  );
};

export const listPortalClientSignatureRequests: RouteHandler<
  typeof listPortalClientSignatureRequestsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const participation = participationOf(c, participantId);
  // Checked here and not left to the policies: an account that is also a member reads every
  // request of the organization through the members' policies.
  if (participation.kind !== 'client_administrator') {
    throw new ApiError(
      'forbidden',
      "Only the client administrator sees the client's signature requests."
    );
  }
  const { data, error } = await createDataClient(c)
    .from('signature_requests')
    .select(
      `id, slot, issued_at, training_records!signature_requests_record_of_client(${portalRecordColumns})`
    )
    .eq('client_id', participation.clientId)
    .eq('state', 'pending')
    .order('issued_at')
    .order('id')
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'portal client signature requests');
  const rows = data as unknown as {
    id: string;
    slot: SignerSlot;
    issued_at: string;
    training_records: PortalRecordRow;
  }[];
  return c.json({ items: rows.map((row) => toPortalRequest(row, row.training_records)) }, 200);
};

export const agreementColumns =
  'state, generated_at, signed_at, client_file_id, storage_path, employee_signed_at, employer_signed_at';

export type AgreementRow = {
  state: string;
  generated_at: string;
  signed_at: string | null;
  client_file_id: string | null;
  storage_path: string | null;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

export const toAgreementState = (row: AgreementRow) => ({
  state: row.state as SigningAgreementState,
  generatedAt: toIso(row.generated_at),
  signedAt: toIsoOrNull(row.signed_at),
  clientFileId: row.client_file_id,
  employeeSignedAt: toIsoOrNull(row.employee_signed_at),
  employerSignedAt: toIsoOrNull(row.employer_signed_at),
  awaiting: awaitedParty(row),
});

// What drawing the agreement up would refuse, told before the employee tries.
const unavailableFor = (
  client: RepresentativeColumns | null,
  employee: { email: string | null; phone: string | null }
): SigningAgreementUnavailable => {
  if (client && representativeMissing(client)) {
    return { reason: 'missing_document_data', missing: missingRepresentative(client) };
  }
  if (!contactOf({ emails: [employee.email], phones: [employee.phone] })) {
    return { reason: 'employee_has_no_address', missing: [] };
  }
  return null;
};

type AgreementSources = {
  row: AgreementRow | null;
  client: RepresentativeColumns | null;
  employee: { email: string | null; phone: string | null };
};

const toAgreement = ({ row, client, employee }: AgreementSources): SigningAgreementResponse => ({
  agreement: row ? toAgreementState(row) : null,
  unavailable: awaits(row, 'employee') ? unavailableFor(client, employee) : null,
});

async function agreementSources(
  db: DataClient,
  clientId: string,
  employeeId: string
): Promise<AgreementSources> {
  const [employee, agreement, client] = await Promise.all([
    db
      .from('employees')
      .select('id, email, phone')
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('employee_signing_agreements')
      .select(agreementColumns)
      .eq('employee_id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('clients')
      .select('legal_representative_name, legal_representative_role')
      .eq('id', clientId)
      .maybeSingle(),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'agreement employee');
  if (agreement.error) throw fromDatabaseError(agreement.error, 'signing agreement');
  if (client.error) throw fromDatabaseError(client.error, 'agreement client');
  if (!employee.data) throw noSuchEmployee();
  return { row: agreement.data, client: client.data, employee: employee.data };
}

const agreementOf = async (db: DataClient, clientId: string, employeeId: string) =>
  toAgreement(await agreementSources(db, clientId, employeeId));

const agreementFileName = (employee: { lastName: string; firstName: string }) => {
  const words = `${employee.lastName} ${employee.firstName}`
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase());
  return `Act-aditional-semnare-electronica-${words.join('-')}.pdf`;
};

/** The caller reads the template, since who may read Storage differs between them. */
export async function signingAgreementDocx(
  c: Context<ApiEnv>,
  db: DataClient,
  { clientId, employeeId }: { clientId: string; employeeId: string },
  readTemplate: (storagePath: string) => Promise<Uint8Array>
) {
  const [employee, client] = await Promise.all([
    db
      .from('employees')
      .select(
        'last_name, first_name, employee_number, job_title, contract_number, hired_at, birth_date, birth_place, home_address, email, phone'
      )
      .eq('id', employeeId)
      .eq('client_id', clientId)
      .maybeSingle(),
    db
      .from('clients')
      .select(
        'organization_id, legal_name, cui, county_code, locality, address_line, legal_representative_name, legal_representative_role'
      )
      .eq('id', clientId)
      .maybeSingle(),
  ]);
  if (employee.error) throw fromDatabaseError(employee.error, 'agreement employee');
  if (client.error) throw fromDatabaseError(client.error, 'agreement client');
  if (!employee.data || !client.data) throw noSuchEmployee();
  if (representativeMissing(client.data)) throw noRepresentative(client.data);
  const organization = await db
    .from('organizations')
    .select('name, legal_name')
    .eq('id', client.data.organization_id)
    .maybeSingle();
  if (organization.error) throw fromDatabaseError(organization.error, 'agreement provider');
  // An employee's invitation must go to the email or phone on their row, so the row is where
  // their codes go.
  const contact = contactOf({ emails: [employee.data.email], phones: [employee.data.phone] });
  if (!contact) {
    throw new ApiError(
      'conflict',
      'The employee has neither an email nor a phone for the signing codes.',
      undefined,
      signatureErrorReasons.employeeHasNoAddress
    );
  }
  const typeKey = signingTypeKeys.agreement;
  const [template] = await builtInTemplates(db, [typeKey]);
  if (!template) {
    console.error(`The template ${typeKey} is not registered: run pnpm templates:register.`);
    throw new ApiError(
      'service_unavailable',
      'The signing agreement template is not available yet.',
      undefined,
      'template_missing'
    );
  }
  const row = employee.data;
  const data = buildSigningAgreementData({
    // Every plan carries the line for now (docs/document-branding.md).
    branding: true,
    client: {
      legalName: client.data.legal_name,
      cui: client.data.cui,
      address: printedAddress({
        countyCode: client.data.county_code,
        locality: client.data.locality,
        addressLine: client.data.address_line,
      }),
      representativeName: client.data.legal_representative_name ?? '',
      representativeRole: client.data.legal_representative_role ?? '',
    },
    provider: {
      legalName: organization.data?.legal_name || organization.data?.name || '',
    },
    employee: {
      lastName: row.last_name,
      firstName: row.first_name,
      employeeNumber: row.employee_number,
      contractTitle: row.job_title,
      contractNumber: row.contract_number,
      hiredAt: row.hired_at,
      birthDate: row.birth_date,
      birthPlace: row.birth_place,
      homeAddress: row.home_address,
    },
    channel: contact.channel,
  });
  const { bytes } = merge(await readTemplate(template.storagePath), data, typeKey);
  return {
    docx: bytes,
    data,
    templatePath: template.storagePath,
    fileName: agreementFileName({ lastName: row.last_name, firstName: row.first_name }),
  };
}

/**
 * The stored agreement once a party has signed it, read with the secret key after the caller's own
 * read of the row; else drawn up on the spot.
 */
export async function signingAgreementPdf(
  c: Context<ApiEnv>,
  db: DataClient,
  ids: { clientId: string; employeeId: string },
  readTemplate: (storagePath: string) => Promise<Uint8Array>
) {
  const stored = await db
    .from('employee_signing_agreements')
    .select('storage_path')
    .eq('employee_id', ids.employeeId)
    .eq('client_id', ids.clientId)
    .maybeSingle();
  if (stored.error) throw fromDatabaseError(stored.error, 'stored signing agreement');
  if (stored.data?.storage_path) {
    const employee = await db
      .from('employees')
      .select('last_name, first_name')
      .eq('id', ids.employeeId)
      .eq('client_id', ids.clientId)
      .maybeSingle();
    if (employee.error) throw fromDatabaseError(employee.error, 'agreement employee');
    if (!employee.data) throw noSuchEmployee();
    return {
      pdf: await createAdminFileStore(c).readDocument(stored.data.storage_path),
      fileName: agreementFileName({
        lastName: employee.data.last_name,
        firstName: employee.data.first_name,
      }),
    };
  }
  const pdf = requirePdfConverter(c);
  const { docx, fileName } = await signingAgreementDocx(c, db, ids, readTemplate);
  return { pdf: await pdf.convertDocx(docx), fileName };
}

const pdfHeaders = (fileName: string) => ({
  'Content-Type': 'application/pdf',
  'Content-Disposition': contentDisposition('attachment', fileName),
});

export const getSigningAgreement: RouteHandler<typeof getSigningAgreementRoute, ApiEnv> = async (
  c
) => {
  const employee = c.req.valid('param');
  const drawn = await signingAgreementPdf(
    c,
    createDataClient(c),
    employee,
    createFileStore(c).readTemplate
  );
  return c.body(new Uint8Array(drawn.pdf), 200, pdfHeaders(drawn.fileName));
};

export const getSigningAgreementState: RouteHandler<
  typeof getSigningAgreementStateRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  return c.json(await agreementOf(createDataClient(c), clientId, employeeId), 200);
};

export const putSigningAgreementState: RouteHandler<
  typeof putSigningAgreementStateRoute,
  ApiEnv
> = async (c) => {
  const { clientId, employeeId } = c.req.valid('param');
  const { state, clientFileId } = c.req.valid('json');
  const db = createDataClient(c);
  const sources = await agreementSources(db, clientId, employeeId);
  const agreement = sources.row;
  if (state === 'generated') await requireRepresentative(db, clientId);
  const now = new Date().toISOString();
  // marked_by is the database's to set, from the member signed in.
  const change =
    state === 'generated'
      ? { state, generated_at: now, signed_at: null, client_file_id: clientFileId ?? null }
      : {
          state,
          signed_at: state === 'signed_on_paper' ? now : null,
          client_file_id: clientFileId ?? null,
        };
  // Not an upsert: members may update only these columns, and an upsert sets them all.
  const saved = agreement
    ? await db
        .from('employee_signing_agreements')
        .update(change)
        .eq('employee_id', employeeId)
        .eq('client_id', clientId)
        .select(agreementColumns)
        .single()
    : await db
        .from('employee_signing_agreements')
        .insert({
          employee_id: employeeId,
          client_id: clientId,
          organization_id: c.get('membership').organizationId,
          ...change,
        })
        .select(agreementColumns)
        .single();
  if (saved.error) {
    if (saved.error.code === '23503') {
      throw new ApiError('conflict', 'The file is not a file of this client.');
    }
    throw fromDatabaseError(saved.error, 'save signing agreement');
  }
  return c.json(toAgreement({ ...sources, row: saved.data }), 200);
};

async function requireRepresentative(db: DataClient, clientId: string) {
  const { data, error } = await db
    .from('clients')
    .select('legal_representative_name, legal_representative_role')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'agreement representative');
  if (data && representativeMissing(data)) throw noRepresentative(data);
}

function ownEmployee(c: Context<ApiEnv>, participantId: string) {
  const participation = participationOf(c, participantId);
  if (!participation.employeeId) {
    throw new ApiError('not_found', 'This participant is not an employee of the client.');
  }
  return { clientId: participation.clientId, employeeId: participation.employeeId };
}

// Storage lets only members read the templates. The participant reads the template's registry
// row through their own policy, so the path the secret key reads is one they may use.
export const getPortalSigningAgreement: RouteHandler<
  typeof getPortalSigningAgreementRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const drawn = await signingAgreementPdf(
    c,
    createDataClient(c),
    ownEmployee(c, participantId),
    createAdminFileStore(c).readTemplate
  );
  return c.body(new Uint8Array(drawn.pdf), 200, pdfHeaders(drawn.fileName));
};

export const getPortalSigningAgreementState: RouteHandler<
  typeof getPortalSigningAgreementStateRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId, employeeId } = ownEmployee(c, participantId);
  return c.json(await agreementOf(createDataClient(c), clientId, employeeId), 200);
};

// Checked here and not left to the policies, as for the client's requests: a member reads every
// agreement of the organization through the members' policies.
function administeredClient(c: Context<ApiEnv>, participantId: string) {
  const participation = participationOf(c, participantId);
  if (participation.kind !== 'client_administrator') {
    throw new ApiError('forbidden', 'Only the client administrator signs for the employer.');
  }
  return participation.clientId;
}

type AgreementListRow = AgreementRow & {
  employees: { id: string; last_name: string; first_name: string };
};

export const listPortalSigningAgreements: RouteHandler<
  typeof listPortalSigningAgreementsRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const clientId = administeredClient(c, participantId);
  const { data, error } = await createDataClient(c)
    .from('employee_signing_agreements')
    .select(
      `${agreementColumns}, employees!employee_signing_agreements_employee_of_client(id, last_name, first_name)`
    )
    .eq('client_id', clientId)
    .or(
      'state.eq.signed_electronically,and(state.eq.generated,employee_signed_at.not.is.null,employer_signed_at.is.null)'
    )
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'portal signing agreements');
  const items = (data as unknown as AgreementListRow[])
    .map((row) => ({
      employee: {
        id: row.employees.id,
        lastName: row.employees.last_name,
        firstName: row.employees.first_name,
      },
      agreement: toAgreementState(row),
      awaitingEmployer: row.state === 'generated',
    }))
    .sort(
      (a, b) =>
        Number(b.awaitingEmployer) - Number(a.awaitingEmployer) ||
        collator.compare(a.employee.lastName, b.employee.lastName) ||
        collator.compare(a.employee.firstName, b.employee.firstName)
    );
  return c.json({ items }, 200);
};

export const getPortalEmployeeSigningAgreement: RouteHandler<
  typeof getPortalEmployeeSigningAgreementRoute,
  ApiEnv
> = async (c) => {
  const { participantId, employeeId } = c.req.valid('param');
  const clientId = administeredClient(c, participantId);
  const drawn = await signingAgreementPdf(
    c,
    createDataClient(c),
    { clientId, employeeId },
    createAdminFileStore(c).readTemplate
  );
  return c.body(new Uint8Array(drawn.pdf), 200, pdfHeaders(drawn.fileName));
};
