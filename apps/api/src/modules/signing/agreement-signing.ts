import type { SigningAgreementParty, SigningAgreementState } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { adminClient } from '../../lib/admin-db';
import { fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { checkToSign } from '../../lib/signed-attributes';
import { signedOn } from '../signed-sheets/form';
import { signedSheetContext } from '../signed-sheets/signed-sheets';
import { type AgreementStateRow, awaits } from './agreement-state';
import { signingAgreementDocx } from './handlers';
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
  new ApiError(
    'conflict',
    'The signing agreement does not await this signature.',
    undefined,
    'agreement_not_awaiting'
  );

const agreementChanged = () =>
  new ApiError(
    'conflict',
    'The signing agreement changed since the code was asked for; ask for a new code.',
    undefined,
    'agreement_changed'
  );

const unavailable = (reason: 'pdf_unavailable' | 'signer_unavailable') =>
  new ApiError('service_unavailable', undefined, undefined, reason);

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// What the employee is shown is the agreement as drawn up from the template and the merge data;
// the converted PDF differs on every conversion, so the digest is of what goes into it.
async function drawn(c: Context<ApiEnv>, ids: { clientId: string; employeeId: string }) {
  const agreement = await signingAgreementDocx(
    c,
    adminClient(c.env),
    ids,
    signedSheetContext(c).files.readTemplate
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
  return sha256(await signedSheetContext(c).files.readDocument(input.storagePath!));
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

/**
 * Signs one party's field of the employee's signing agreement. The employee's signature renders
 * the agreement as a form and certifies it; the employer's goes on the stored file. Each version
 * is a file of its own; the evidence row, which the database checks, moves the agreement on.
 */
export async function signAgreement(
  c: Context<ApiEnv>,
  identities: Awaited<ReturnType<typeof createSigningIdentities>>,
  input: AgreementSigning
): Promise<SigningAgreementState> {
  const { clientId, employeeId, party, signer, session } = input;
  const admin = adminClient(c.env);
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
  if (!row || !awaits(row, party)) throw agreementNotAwaiting();
  if (row.clients.archived_at) {
    throw new ApiError('conflict', undefined, undefined, 'client_archived');
  }

  const ctx = signedSheetContext(c);
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
    before = await ctx.files.readDocument(row.storage_path!);
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
  const begun = await signerService.beginSignature(buffer(before), {
    field: agreementSignatureFields[party],
    certificatePem: identity.certificatePem,
    chainPem: identities.chainPem,
    reason: `Act adițional privind semnarea electronică: ${partyLabels[party].toLowerCase()}`,
    signedAt: signedAt.toISOString(),
    certify: party === 'employee',
    lockFields: [],
    appearanceLines: [signer.name, partyLabels[party], 'semnat electronic', signedOn(signedAt)],
  });
  await checkToSign(begun.prepared, begun.toSign, identity.certificatePem);
  const signature = await identities.signWithIdentity(identity, begun.toSign);
  const signed = new Uint8Array(
    await signerService.finishSignature(begun.prepared, begun.sessionToken, signature)
  );

  const version = party === 'employee' ? 1 : 2;
  const path = `signing-agreements/${clientId}/${employeeId}/v${version}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await ctx.files.writeDocument(path, signed, { replace: false });

  const evidence = await admin.from('agreement_signatures').insert({
    organization_id: row.organization_id,
    client_id: clientId,
    employee_id: employeeId,
    party,
    signer_account_id: signer.accountId,
    signer_name: signer.name,
    channel: session.channel,
    address: session.address,
    code_sent_at: session.codeSentAt.toISOString(),
    code_verified_at: (session.verifiedAt ?? signedAt).toISOString(),
    signed_at: signedAt.toISOString(),
    digest_before: await sha256(before),
    digest_after: await sha256(signed),
    certificate_serial: identity.certificateSerial,
    client_ip: input.clientIp,
    user_agent: input.userAgent?.slice(0, 500) ?? null,
    signing_session_id: session.id,
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
