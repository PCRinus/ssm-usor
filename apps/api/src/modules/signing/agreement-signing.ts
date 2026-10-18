import type { SigningAgreementParty, SigningAgreementState } from '@ssm-usor/contracts';
import type { Context } from 'hono';

import { createAdminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { signedOn } from '../signed-sheets/form';
import { signedSheetContext } from '../signed-sheets/signed-sheets';
import { signingAgreementDocx } from './handlers';
import type { createSigningIdentities } from './identities';
import type { SigningSession } from './signing-sessions';

export const agreementSignatureFields = {
  employee: 'sig_employee',
  employer: 'sig_employer',
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

const unavailable = (reason: 'pdf_unavailable' | 'signer_unavailable') =>
  new ApiError('service_unavailable', undefined, undefined, reason);

type AgreementStateRow = {
  organization_id: string;
  state: string;
  storage_path: string | null;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

/** The employee signs first, the employer after, each once, while the agreement is not settled. */
export const awaits = (row: AgreementStateRow | null, party: SigningAgreementParty) =>
  !!row &&
  row.state === 'generated' &&
  (party === 'employee'
    ? row.employee_signed_at === null
    : row.employee_signed_at !== null && row.employer_signed_at === null && !!row.storage_path);

const buffer = (bytes: Uint8Array) => new Uint8Array(bytes).buffer;

async function sha256(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer(bytes)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type AgreementSigning = {
  clientId: string;
  employeeId: string;
  party: SigningAgreementParty;
  signer: { accountId: string; name: string };
  session: SigningSession;
  clientIp: string | null;
  userAgent: string | null;
  signedAt: Date;
};

/**
 * Signs one party's field of the employee's signing agreement. The employee's signature renders
 * the agreement as a form and certifies it; the employer's goes on the stored file. Each version
 * is a file of its own, the row pointing at the newest.
 */
export async function signAgreement(
  c: Context<ApiEnv>,
  identities: Awaited<ReturnType<typeof createSigningIdentities>>,
  input: AgreementSigning
): Promise<SigningAgreementState> {
  const { clientId, employeeId, party, signer, session, signedAt } = input;
  const admin = createAdminClient(c);
  const read = await admin
    .from('employee_signing_agreements')
    .select('organization_id, state, storage_path, employee_signed_at, employer_signed_at')
    .eq('employee_id', employeeId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (read.error) throw new ApiError('service_unavailable');
  const row = read.data;
  if (!row || !awaits(row, party)) throw agreementNotAwaiting();

  const ctx = signedSheetContext(c);
  const signerService = ctx.signer;
  if (!signerService) throw unavailable('signer_unavailable');

  let before: Uint8Array;
  if (party === 'employee') {
    if (!ctx.pdf) throw unavailable('pdf_unavailable');
    const { docx } = await signingAgreementDocx(
      c,
      admin,
      { clientId, employeeId },
      ctx.files.readTemplate
    );
    const form = await ctx.pdf.convertForm(docx);
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
    if (employeeSignature.data?.digest_after !== (await sha256(before))) {
      console.error(`Signing agreement of ${employeeId} does not match the employee's evidence.`);
      throw new ApiError('internal_error', 'The stored signing agreement could not be verified.');
    }
  }

  const identity = await identities.identityFor(signer.accountId, signer.name);
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
  const signature = await identities.signWithIdentity(identity, begun.toSign);
  const signed = new Uint8Array(
    await signerService.finishSignature(begun.prepared, begun.sessionToken, signature)
  );

  const version = party === 'employee' ? 1 : 2;
  const path = `signing-agreements/${clientId}/${employeeId}/v${version}-${crypto.randomUUID().slice(0, 8)}.pdf`;
  await ctx.files.writeDocument(path, signed, { replace: false });
  const forget = () => ctx.files.removeDocument(path).catch(() => undefined);

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
  });
  if (evidence.error) {
    await forget();
    if (evidence.error.code === '23505') throw agreementNotAwaiting();
    console.error(`Agreement signature evidence failed: ${evidence.error.code ?? 'no code'}`);
    throw new ApiError('service_unavailable');
  }

  const at = signedAt.toISOString();
  const change =
    party === 'employee'
      ? { storage_path: path, employee_signed_at: at }
      : {
          storage_path: path,
          employer_signed_at: at,
          state: 'signed_electronically',
          signed_at: at,
        };
  const updated = await admin
    .from('employee_signing_agreements')
    .update(change)
    .eq('employee_id', employeeId)
    .is(party === 'employee' ? 'employee_signed_at' : 'employer_signed_at', null)
    .select('state');
  if (updated.error || updated.data.length !== 1) {
    // The evidence row stands and names this file, which is kept for it.
    console.error(
      `Signing agreement of ${employeeId} not moved on after the ${party}'s signature: ${updated.error?.code ?? 'raced'}`
    );
    throw new ApiError('service_unavailable');
  }
  return updated.data[0]!.state as SigningAgreementState;
}
