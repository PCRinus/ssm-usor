import type { RouteHandler } from '@hono/zod-openapi';
import {
  type FileLinkResponse,
  signatureErrorReasons,
  type SigningAgreementResponse,
  type SigningAgreementState,
  type SigningAgreementUnavailable,
} from '@ssm-usor/contracts';
import { buildSigningAgreementData, signingTypeKeys } from '@ssm-usor/document-engine';
import type { Context } from 'hono';

import { printedAddress } from '../../lib/address';
import { contentDisposition } from '../../lib/content-disposition';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { createAdminFileStore, createFileStore } from '../../lib/files';
import { createPortalReadClient, participationOf } from '../../lib/participant';
import { requirePdfConverter } from '../../lib/pdf';
import { collator } from '../../lib/romanian';
import { mergeBuiltIn } from '../../lib/templates';
import { toIso, toIsoOrNull } from '../../lib/timestamps';
import { awaitedParty, awaits } from './agreement-state';
import type {
  getPortalEmployeeSigningAgreementLinkRoute,
  getPortalEmployeeSigningAgreementRoute,
  getPortalSigningAgreementLinkRoute,
  getPortalSigningAgreementRoute,
  getPortalSigningAgreementStateRoute,
  getSigningAgreementLinkRoute,
  getSigningAgreementRoute,
  getSigningAgreementStateRoute,
  listPortalSigningAgreementsRoute,
  putSigningAgreementStateRoute,
} from './routes';
import { contactOf } from './signers';

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
  const { bytes, storagePath } = await mergeBuiltIn(
    db,
    readTemplate,
    signingTypeKeys.agreement,
    data,
    'signing agreement'
  );
  return {
    docx: bytes,
    data,
    templatePath: storagePath,
    fileName: agreementFileName({ lastName: row.last_name, firstName: row.first_name }),
  };
}

async function storedAgreement(db: DataClient, ids: { clientId: string; employeeId: string }) {
  const stored = await db
    .from('employee_signing_agreements')
    .select('storage_path')
    .eq('employee_id', ids.employeeId)
    .eq('client_id', ids.clientId)
    .maybeSingle();
  if (stored.error) throw fromDatabaseError(stored.error, 'stored signing agreement');
  if (!stored.data?.storage_path) return null;
  const employee = await db
    .from('employees')
    .select('last_name, first_name')
    .eq('id', ids.employeeId)
    .eq('client_id', ids.clientId)
    .maybeSingle();
  if (employee.error) throw fromDatabaseError(employee.error, 'agreement employee');
  if (!employee.data) throw noSuchEmployee();
  return {
    storagePath: stored.data.storage_path,
    fileName: agreementFileName({
      lastName: employee.data.last_name,
      firstName: employee.data.first_name,
    }),
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
  const stored = await storedAgreement(db, ids);
  if (stored) {
    return {
      pdf: await createAdminFileStore(c).readDocument(stored.storagePath),
      fileName: stored.fileName,
    };
  }
  const pdf = requirePdfConverter(c);
  const { docx, fileName } = await signingAgreementDocx(c, db, ids, readTemplate);
  return { pdf: await pdf.convertDocx(docx), fileName };
}

export async function storedAgreementLink(
  c: Context<ApiEnv>,
  db: DataClient,
  ids: { clientId: string; employeeId: string }
): Promise<FileLinkResponse> {
  const stored = await storedAgreement(db, ids);
  if (!stored) {
    throw new ApiError(
      'not_found',
      'Nobody has signed the agreement electronically, so it has no stored file.',
      undefined,
      'agreement_not_stored'
    );
  }
  // Ten minutes: the page keeps the link on a real anchor and renews it before then; a phone may
  // sleep in between.
  const expiresInSeconds = 600;
  return {
    // The route has authorized this agreement, through member policies or the participation.
    url: await createAdminFileStore(c).documentLink(stored.storagePath, expiresInSeconds),
    fileName: stored.fileName,
    expiresInSeconds,
  };
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

export const getSigningAgreementLink: RouteHandler<
  typeof getSigningAgreementLinkRoute,
  ApiEnv
> = async (c) =>
  c.json(await storedAgreementLink(c, createDataClient(c), c.req.valid('param')), 200);

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

export const getPortalSigningAgreement: RouteHandler<
  typeof getPortalSigningAgreementRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const drawn = await signingAgreementPdf(
    c,
    createPortalReadClient(c),
    ownEmployee(c, participantId),
    createAdminFileStore(c).readTemplate
  );
  return c.body(new Uint8Array(drawn.pdf), 200, pdfHeaders(drawn.fileName));
};

export const getPortalSigningAgreementLink: RouteHandler<
  typeof getPortalSigningAgreementLinkRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  return c.json(
    await storedAgreementLink(c, createPortalReadClient(c), ownEmployee(c, participantId)),
    200
  );
};

export const getPortalSigningAgreementState: RouteHandler<
  typeof getPortalSigningAgreementStateRoute,
  ApiEnv
> = async (c) => {
  const { participantId } = c.req.valid('param');
  const { clientId, employeeId } = ownEmployee(c, participantId);
  return c.json(await agreementOf(createPortalReadClient(c), clientId, employeeId), 200);
};

// Checked here, as for the client's requests, since the reads take the secret key.
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
  const { data, error } = await createPortalReadClient(c)
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
    createPortalReadClient(c),
    { clientId, employeeId },
    createAdminFileStore(c).readTemplate
  );
  return c.body(new Uint8Array(drawn.pdf), 200, pdfHeaders(drawn.fileName));
};

export const getPortalEmployeeSigningAgreementLink: RouteHandler<
  typeof getPortalEmployeeSigningAgreementLinkRoute,
  ApiEnv
> = async (c) => {
  const { participantId, employeeId } = c.req.valid('param');
  const clientId = administeredClient(c, participantId);
  return c.json(
    await storedAgreementLink(c, createPortalReadClient(c), { clientId, employeeId }),
    200
  );
};
