import type { Context } from 'hono';

import { type AdminClient, adminClient } from '../../lib/admin-db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  identityFor,
  type IdentityStore,
  issueIdentity,
  loadSigningCa,
  type SigningIdentity,
  signWithIdentity,
} from '../../lib/signing-ca';

const identityColumns =
  'account_id, subject_name, certificate_pem, certificate_serial, private_key_encrypted, key_version, not_before, not_after';

// PostgREST reads and writes bytea as hex text with a `\x` prefix.
const toByteaHex = (bytes: Uint8Array) =>
  `\\x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

function fromByteaHex(text: string) {
  const hex = text.startsWith('\\x') ? text.slice(2) : text;
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));
}

const storeFailed = (context: string, code: string | undefined) => {
  console.error(`Signing identity ${context} failed: ${code ?? 'no code'}`);
  return new ApiError('service_unavailable');
};

type IdentityRow = {
  account_id: string;
  subject_name: string;
  certificate_pem: string;
  certificate_serial: string;
  private_key_encrypted: string;
  key_version: number;
  not_before: string;
  not_after: string;
};

const toIdentity = (row: IdentityRow): SigningIdentity => ({
  accountId: row.account_id,
  subjectName: row.subject_name,
  certificatePem: row.certificate_pem,
  certificateSerial: row.certificate_serial,
  privateKeyEncrypted: fromByteaHex(row.private_key_encrypted),
  keyVersion: row.key_version,
  notBefore: new Date(row.not_before),
  notAfter: new Date(row.not_after),
});

// signing_identities has no policy at all: only the secret key reads or writes it.
export function identityStore(admin: AdminClient): IdentityStore {
  async function load(accountId: string) {
    const { data, error } = await admin
      .from('signing_identities')
      .select(identityColumns)
      .eq('account_id', accountId)
      .is('superseded_at', null)
      .maybeSingle();
    if (error) throw storeFailed('load', error.code);
    return data ? toIdentity(data) : null;
  }
  return {
    load,
    async save(identity) {
      const superseded = await admin
        .from('signing_identities')
        .update({ superseded_at: new Date().toISOString() })
        .eq('account_id', identity.accountId)
        .is('superseded_at', null);
      if (superseded.error) throw storeFailed('supersede', superseded.error.code);
      const { error } = await admin.from('signing_identities').insert({
        account_id: identity.accountId,
        subject_name: identity.subjectName,
        certificate_pem: identity.certificatePem,
        certificate_serial: identity.certificateSerial,
        private_key_encrypted: toByteaHex(identity.privateKeyEncrypted),
        key_version: identity.keyVersion,
        not_before: identity.notBefore.toISOString(),
        not_after: identity.notAfter.toISOString(),
      });
      if (error?.code === '23505') {
        const winner = await load(identity.accountId);
        if (winner) return winner;
      }
      if (error) throw storeFailed('save', error.code);
      return identity;
    },
  };
}

/**
 * The identities of the deployment's authority: `identityFor` before a signature, then
 * `signWithIdentity` over the signer container's `toSign`, with `chainPem` as the chain.
 */
export async function createSigningIdentities(c: Context<ApiEnv>) {
  const ca = await loadSigningCa(c.env);
  const store = identityStore(adminClient(c.env));
  return {
    chainPem: [ca.certificatePem],
    identityFor: (accountId: string, subjectName: string) =>
      identityFor(ca, store, accountId, subjectName),
    issueIdentity: (accountId: string, subjectName: string) =>
      issueIdentity(ca, store, accountId, subjectName),
    signWithIdentity: (identity: SigningIdentity, toSign: ArrayBuffer | Uint8Array) =>
      signWithIdentity(ca, identity, toSign),
  };
}
