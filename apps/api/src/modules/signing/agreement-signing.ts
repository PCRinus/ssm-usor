import type { SigningAgreementParty, SigningAgreementState } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { type AdminClient, createLastingAdminClient } from '../../lib/admin-db';
import { archivedClientError, fromDatabaseError } from '../../lib/db';
import { sha256 } from '../../lib/docx';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { pdfSigningServices, signedOn, signField } from '../../lib/pdf-signing';
import { checkToSign } from '../../lib/signed-attributes';
import { signingAgreementDocx } from './agreement';
import { type AgreementStateRow, awaits } from './agreement-state';
import { sessionEvidence } from './evidence';
import type { createSigningIdentities } from './identities';
import type { SigningSession } from './signing-sessions';

export const agreementSignatureFields = {
  employee: 'sig_employee',
  employer: 'sig_employer',
} as const satisfies Record<SigningAgreementParty, string>;

/** The "Data:" field beside each party's signature, filled with the day of that signature. */
export const agreementDateFields = {
  employee: 'date_employee',
  employer: 'date_employer',
} as const satisfies Record<SigningAgreementParty, string>;

const partyLabels: Record<SigningAgreementParty, string> = {
  employee: 'Salariat',
  employer: 'Angajator',
};

export const agreementNotAwaiting = () =>
  ApiError.conflict(
    'agreement_not_awaiting',
    'The signing agreement does not await this signature.'
  );

const agreementChanged = () =>
  ApiError.conflict(
    'agreement_changed',
    'The signing agreement changed since the code was asked for; ask for a new code.'
  );

const unavailable = (reason: 'pdf_unavailable' | 'signer_unavailable') =>
  new ApiError('service_unavailable', undefined, undefined, reason);

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

// What the employee is shown is the agreement as drawn up from the template and the merge data;
// the converted PDF differs on every conversion, so the digest is of what goes into it.
async function drawn(c: Context<ApiEnv>, ids: { clientId: string; employeeId: string }) {
  const agreement = await signingAgreementDocx(
    c,
    createLastingAdminClient(c),
    ids,
    pdfSigningServices(c).files.readTemplate
  );
  const content = new TextEncoder().encode(
    JSON.stringify({ template: agreement.templatePath, data: agreement.data })
  );
  return { ...agreement, digest: await sha256(content) };
}

/**
 * What the signer sees when they ask for the code: the agreement's content for the employee, the
 * stored file the employee signed for the employer. Checked again when the code is typed.
 */
export async function agreementDigest(
  c: Context<ApiEnv>,
  input: {
    clientId: string;
    employeeId: string;
    party: SigningAgreementParty;
    storagePath: string | null;
  }
) {
  if (input.party === 'employee') return (await drawn(c, input)).digest;
  return sha256(await pdfSigningServices(c).files.readDocument(input.storagePath!));
}

export type AgreementSigning = {
  clientId: string;
  employeeId: string;
  party: SigningAgreementParty;
  /** The name the signature's appearance prints. */
  signer: { accountId: string; name: string };
  /** The account's own name, the one a new certificate carries. */
  accountName: string;
  /** What the session recorded the agreement as when the code was asked for. */
  digest: string | null;
  session: SigningSession;
  clientIp: string | null;
  userAgent: string | null;
};

type ClientOfAgreement = { organization_id: string; archived_at: string | null };

// Before the employee signs, there may be no agreement row: the client is read through the
// employee, which also checks the employee is the client's.
async function clientOfEmployee(
  admin: AdminClient,
  clientId: string,
  employeeId: string
): Promise<ClientOfAgreement> {
  // Two keys lead to the client (the plain one and the one that carries the organization), so
  // PostgREST needs the hint; without it the embed answers PGRST201 and nothing is signed.
  const read = await admin
    .from('employees')
    .select('clients!employees_client_id_fkey(organization_id, archived_at)')
    .eq('id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (read.error) throw new ApiError('service_unavailable');
  const client = (read.data as { clients: ClientOfAgreement | null } | null)?.clients;
  if (!client) throw agreementNotAwaiting();
  return client;
}

/**
 * Signs one party's field of the employee's signing agreement. The employee's signature renders
 * the agreement as a form and certifies it; the employer's goes on the stored file. Each version
 * is a file of its own; the evidence row, which the database checks, moves the agreement on. An
 * employee signing before any member recorded the agreement records it as generated themselves.
 */
export async function signAgreement(
  c: Context<ApiEnv>,
  identities: Awaited<ReturnType<typeof createSigningIdentities>>,
  input: AgreementSigning
): Promise<SigningAgreementState> {
  const { clientId, employeeId, party, signer, session } = input;
  const admin = createLastingAdminClient(c);
  const read = await admin
    .from('employee_signing_agreements')
    .select(
      'organization_id, state, storage_path, employee_signed_at, employer_signed_at, clients!employee_signing_agreements_client_id_fkey(archived_at)'
    )
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (read.error) throw new ApiError('service_unavailable');
  const row = read.data as
    | (AgreementStateRow & { organization_id: string; clients: { archived_at: string | null } })
    | null;
  if (!awaits(row, party)) throw agreementNotAwaiting();
  const client: ClientOfAgreement = row
    ? { organization_id: row.organization_id, archived_at: row.clients.archived_at }
    : await clientOfEmployee(admin, clientId, employeeId);
  if (client.archived_at) {
    throw archivedClientError();
  }

  const ctx = pdfSigningServices(c);
  const signerService = ctx.signer;
  if (!signerService) throw unavailable('signer_unavailable');

  let before: Uint8Array;
  if (party === 'employee') {
    if (!ctx.pdf) throw unavailable('pdf_unavailable');
    const agreement = await drawn(c, { clientId, employeeId });
    if (agreement.digest !== input.digest) throw agreementChanged();
    const form = await ctx.pdf.convertForm(agreement.docx);
    before = new Uint8Array(
      await signerService.prepareSheet(buffer(form), Object.values(agreementSignatureFields))
    );
  } else {
    before = await ctx.files.readDocument(row!.storage_path!);
    const employeeSignature = await admin
      .from('agreement_signatures')
      .select('digest_after')
      .eq('employee_id', employeeId)
      .eq('party', 'employee')
      .maybeSingle();
    if (employeeSignature.error) throw new ApiError('service_unavailable');
    const stored = await sha256(before);
    if (employeeSignature.data?.digest_after !== stored) {
      console.error(`Signing agreement of ${employeeId} does not match the employee's evidence.`);
      throw new ApiError('internal_error', 'The stored signing agreement could not be verified.');
    }
    if (stored !== input.digest) throw agreementChanged();
  }

  const identity = await identities.identityFor(signer.accountId, input.accountName);
  const signedAt = new Date();
  before = new Uint8Array(
    await signerService.fillFields(buffer(before), {
      [agreementDateFields[party]]: signedOn(signedAt),
    })
  );
  const signed = await signField(
    signerService,
    before,
    {
      field: agreementSignatureFields[party],
      certificatePem: identity.certificatePem,
      chainPem: identities.chainPem,
      reason: `Act adițional privind semnarea electronică: ${partyLabels[party].toLowerCase()}`,
      signedAt,
      certify: party === 'employee',
      lockFields: [],
      name: signer.name,
    },
    async (toSign, prepared) => {
      await checkToSign(prepared, toSign, identity.certificatePem);
      return identities.signWithIdentity(identity, toSign);
    }
  );

  const version = party === 'employee' ? 1 : 2;
  const path = `${client.organization_id}/signing-agreements/${clientId}/${employeeId}/v${version}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await ctx.files.writeDocument(path, signed, { replace: false });

  if (!row) {
    const recorded = await admin.from('employee_signing_agreements').insert({
      employee_id: employeeId,
      client_id: clientId,
      organization_id: client.organization_id,
      state: 'generated',
    });
    // A member recorded it meanwhile: the evidence's check decides whether it still awaits.
    if (recorded.error && recorded.error.code !== '23505') {
      await ctx.files.removeDocument(path).catch(() => undefined);
      throw fromDatabaseError(recorded.error, 'record signing agreement');
    }
  }

  const evidence = await admin.from('agreement_signatures').insert({
    organization_id: client.organization_id,
    client_id: clientId,
    employee_id: employeeId,
    party,
    ...sessionEvidence({
      session,
      signer,
      certificateSerial: identity.certificateSerial,
      signedAt,
      digestBefore: await sha256(before),
      digestAfter: await sha256(signed),
      clientIp: input.clientIp,
      userAgent: input.userAgent,
    }),
    storage_path: path,
  });
  if (evidence.error) {
    await ctx.files.removeDocument(path).catch(() => undefined);
    if (evidence.error.code === '23505') throw agreementNotAwaiting();
    console.error(`Agreement signature evidence failed: ${evidence.error.code ?? 'no code'}`);
    throw fromDatabaseError(evidence.error, 'agreement signature evidence');
  }

  const settled = await admin
    .from('employee_signing_agreements')
    .select('state')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (settled.error || !settled.data) throw new ApiError('service_unavailable');
  return settled.data.state as SigningAgreementState;
}
