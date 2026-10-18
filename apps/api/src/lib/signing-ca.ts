import { signatureErrorReasons } from '@ssm-usor/contracts';

import type { ApiEnv } from './env';
import { ApiError } from './errors';
import { x509 } from './x509';

// The app is its own certificate authority (ADR 023): a signature's weight is its evidence, not
// its issuer. The CA key and the key-encryption key are Worker secrets.

const keyAlgorithm = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const signatureAlgorithm = { name: 'ECDSA', hash: 'SHA-256' } as const;

export const CA_SUBJECT = 'SSM Ușor Signing CA';
const CA_YEARS = 10;
export const CERTIFICATE_YEARS = 2;
export const REISSUE_WITHIN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
export const KEY_VERSION = 1;
// X.520's upper bound for a common name.
const COMMON_NAME_MAX = 64;

export type SigningCaSecrets = Pick<
  ApiEnv['Bindings'],
  'SIGNING_CA_KEY' | 'SIGNING_CA_CERT' | 'SIGNING_KEY_ENCRYPTION_KEY'
>;

export type SigningCa = {
  key: CryptoKey;
  certificate: x509.X509Certificate;
  certificatePem: string;
  keyEncryptionKey: CryptoKey;
};

export type SigningIdentity = {
  accountId: string;
  subjectName: string;
  certificatePem: string;
  /** Hex, as the certificate carries it and the evidence records it. */
  certificateSerial: string;
  /** The PKCS#8 key under AES-256-GCM: a 12-byte IV, then the ciphertext and its tag. */
  privateKeyEncrypted: Uint8Array;
  keyVersion: number;
  notBefore: Date;
  notAfter: Date;
};

export interface IdentityStore {
  /** The account's live identity, the one not superseded. */
  load(accountId: string): Promise<SigningIdentity | null>;
  /**
   * Supersedes the account's live identity, if it has one, and inserts this one; the old row
   * stays for the signatures that name its certificate. Answers the live identity, which is
   * another one when a concurrent issue won.
   */
  save(identity: SigningIdentity): Promise<SigningIdentity>;
}

const unavailable = () =>
  new ApiError(
    'service_unavailable',
    'Signing is not available on this server. Nothing was signed.',
    undefined,
    signatureErrorReasons.signingUnavailable
  );

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

export function fromBase64(text: string) {
  const binary = atob(text);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// A PEM pasted into a one-line .dev.vars value or GitHub secret may carry its line breaks as `\n`.
const pemOf = (value: string) => value.replace(/\\n/g, '\n').trim();

const wholeSeconds = (date: Date) => new Date(Math.floor(date.getTime() / 1000) * 1000);

const yearsAfter = (date: Date, years: number) => {
  const later = new Date(date);
  later.setUTCFullYear(later.getUTCFullYear() + years);
  return later;
};

export async function loadSigningCa(
  secrets: SigningCaSecrets,
  now = new Date()
): Promise<SigningCa> {
  const { SIGNING_CA_KEY, SIGNING_CA_CERT, SIGNING_KEY_ENCRYPTION_KEY } = secrets;
  if (!SIGNING_CA_KEY || !SIGNING_CA_CERT || !SIGNING_KEY_ENCRYPTION_KEY) throw unavailable();
  try {
    const certificate = new x509.X509Certificate(pemOf(SIGNING_CA_CERT));
    if (certificate.notAfter.getTime() <= now.getTime()) {
      throw new Error('the authority certificate has expired');
    }
    const key = await crypto.subtle.importKey(
      'pkcs8',
      x509.PemConverter.decodeFirst(pemOf(SIGNING_CA_KEY)),
      keyAlgorithm,
      false,
      ['sign']
    );
    // A key and certificate from two different rotations would issue certificates nothing verifies.
    const probe = crypto.getRandomValues(new Uint8Array(32));
    const signed = await crypto.subtle.sign(signatureAlgorithm, key, probe);
    const publicKey = await certificate.publicKey.export(keyAlgorithm, ['verify'], crypto);
    if (!(await crypto.subtle.verify(signatureAlgorithm, publicKey, signed, probe))) {
      throw new Error('the authority key does not match its certificate');
    }
    const kek = fromBase64(SIGNING_KEY_ENCRYPTION_KEY.trim());
    if (kek.length !== 32) throw new Error('the key-encryption key is not 32 bytes');
    const keyEncryptionKey = await crypto.subtle.importKey('raw', kek, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    return { key, certificate, certificatePem: certificate.toString('pem'), keyEncryptionKey };
  } catch (error) {
    console.error(
      `The signing authority could not be loaded: ${error instanceof Error ? error.message : 'unknown error'}`
    );
    throw unavailable();
  }
}

export async function generateSigningCa(now = new Date()) {
  const keys = (await crypto.subtle.generateKey(keyAlgorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const notBefore = wholeSeconds(now);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name: [{ CN: [CA_SUBJECT] }, { O: ['SSM Ușor'] }],
    notBefore,
    notAfter: yearsAfter(notBefore, CA_YEARS),
    signingAlgorithm: signatureAlgorithm,
    keys,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign,
        true
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  });
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
  return {
    SIGNING_CA_KEY: x509.PemConverter.encode(pkcs8, 'PRIVATE KEY'),
    SIGNING_CA_CERT: certificate.toString('pem'),
    SIGNING_KEY_ENCRYPTION_KEY: toBase64(crypto.getRandomValues(new Uint8Array(32))),
  };
}

// The account id is the additional data, so an encrypted key copied onto another account's row
// does not decrypt.
async function encryptKey(ca: SigningCa, accountId: string, pkcs8: ArrayBuffer) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(accountId) },
    ca.keyEncryptionKey,
    pkcs8
  );
  const out = new Uint8Array(iv.length + sealed.byteLength);
  out.set(iv);
  out.set(new Uint8Array(sealed), iv.length);
  return out;
}

async function decryptKey(ca: SigningCa, identity: SigningIdentity) {
  if (identity.keyVersion !== KEY_VERSION) {
    throw new Error(`no key-encryption key of version ${identity.keyVersion}`);
  }
  const sealed = identity.privateKeyEncrypted;
  return crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: sealed.slice(0, 12),
      additionalData: new TextEncoder().encode(identity.accountId),
    },
    ca.keyEncryptionKey,
    sealed.slice(12)
  );
}

export async function createIdentity(
  ca: SigningCa,
  accountId: string,
  subjectName: string,
  now = new Date()
): Promise<SigningIdentity> {
  const keys = (await crypto.subtle.generateKey(keyAlgorithm, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const name = subjectName.trim();
  const notBefore = wholeSeconds(now);
  const notAfter = yearsAfter(notBefore, CERTIFICATE_YEARS);
  const certificate = await x509.X509CertificateGenerator.create({
    // The serialNumber attribute (2.5.4.5) ties the certificate to the account, not to a name
    // two people may share.
    subject: [{ CN: [name.slice(0, COMMON_NAME_MAX).trim()] }, { '2.5.4.5': [accountId] }],
    issuer: ca.certificate.subjectName,
    notBefore,
    notAfter,
    signingAlgorithm: signatureAlgorithm,
    publicKey: keys.publicKey,
    signingKey: ca.key,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(
        x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation,
        true
      ),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(ca.certificate.publicKey),
    ],
  });
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
  return {
    accountId,
    subjectName: name,
    certificatePem: certificate.toString('pem'),
    certificateSerial: certificate.serialNumber,
    privateKeyEncrypted: await encryptKey(ca, accountId, pkcs8),
    keyVersion: KEY_VERSION,
    notBefore,
    notAfter,
  };
}

export async function issueIdentity(
  ca: SigningCa,
  store: IdentityStore,
  accountId: string,
  subjectName: string,
  now = new Date()
) {
  return store.save(await createIdentity(ca, accountId, subjectName, now));
}

async function usableUnder(ca: SigningCa, identity: SigningIdentity, now: Date) {
  if (
    identity.notBefore.getTime() > now.getTime() ||
    identity.notAfter.getTime() - now.getTime() <= REISSUE_WITHIN_DAYS * DAY_MS
  ) {
    return false;
  }
  const issuedHere = await new x509.X509Certificate(identity.certificatePem).verify(
    { publicKey: ca.certificate.publicKey, signatureOnly: true },
    crypto
  );
  return (
    issuedHere &&
    decryptKey(ca, identity).then(
      () => true,
      () => false
    )
  );
}

/**
 * The account's identity, reissued only when it has expired, expires within 30 days, or belongs
 * to an authority or a key-encryption key that has since been replaced. `subjectName`, the
 * account's own name, is used only for a new certificate: the name a slot prints goes in the
 * signature's appearance, never in the certificate. A signature keeps its certificate's serial in
 * its evidence, and the superseded identity stays.
 */
export async function identityFor(
  ca: SigningCa,
  store: IdentityStore,
  accountId: string,
  subjectName: string,
  now = new Date()
) {
  const current = await store.load(accountId);
  return current && (await usableUnder(ca, current, now))
    ? current
    : issueIdentity(ca, store, accountId, subjectName, now);
}

/** Raw r||s (IEEE P1363, 64 bytes), which is what the signer container embeds. */
export async function signWithIdentity(
  ca: SigningCa,
  identity: SigningIdentity,
  toSign: ArrayBuffer | Uint8Array
) {
  const pkcs8 = await decryptKey(ca, identity);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, keyAlgorithm, false, ['sign']);
  return crypto.subtle.sign(signatureAlgorithm, key, new Uint8Array(toSign));
}
