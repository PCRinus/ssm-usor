import { beforeAll, describe, expect, it, vi } from 'vitest';

import {
  CA_SUBJECT,
  createIdentity,
  generateSigningCa,
  identityFor,
  type IdentityStore,
  issueIdentity,
  loadSigningCa,
  type SigningCa,
  type SigningIdentity,
  signWithIdentity,
} from './signing-ca';
import { x509 } from './x509';

const accountId = '1e8b36cc-d87a-4318-9af2-acb1f6156112';
const now = new Date('2026-10-18T09:30:12.345Z');

let secrets: Awaited<ReturnType<typeof generateSigningCa>>;
let ca: SigningCa;

beforeAll(async () => {
  secrets = await generateSigningCa(now);
  ca = await loadSigningCa(secrets);
});

function memoryStore(initial: SigningIdentity | null = null) {
  let saved = initial;
  const store: IdentityStore = {
    load: vi.fn(async () => saved),
    save: vi.fn(async (identity: SigningIdentity) => {
      saved = identity;
    }),
  };
  return store;
}

const verify = async (identity: SigningIdentity, data: BufferSource, signature: ArrayBuffer) => {
  const certificate = new x509.X509Certificate(identity.certificatePem);
  const key = await certificate.publicKey.export(
    { name: 'ECDSA', namedCurve: 'P-256' },
    ['verify'],
    crypto
  );
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, data);
};

describe('the authority', () => {
  it('is a ten-year, self-signed P-256 CA that may sign certificates only', async () => {
    const certificate = new x509.X509Certificate(secrets.SIGNING_CA_CERT);

    expect(certificate.subject).toContain(`CN=${CA_SUBJECT}`);
    expect(await certificate.isSelfSigned(crypto)).toBe(true);
    expect(certificate.notAfter.getUTCFullYear()).toBe(2036);
    const constraints = certificate.getExtension(x509.BasicConstraintsExtension)!;
    expect(constraints.ca).toBe(true);
    expect(constraints.critical).toBe(true);
    const usages = certificate.getExtension(x509.KeyUsagesExtension)!;
    expect(usages.usages & x509.KeyUsageFlags.keyCertSign).toBeTruthy();
    expect(usages.usages & x509.KeyUsageFlags.digitalSignature).toBeFalsy();
    expect(Buffer.from(secrets.SIGNING_KEY_ENCRYPTION_KEY, 'base64')).toHaveLength(32);
  });

  it('loads from PEMs whose line breaks were written as \\n', async () => {
    const oneLine = (pem: string) => pem.replace(/\n/g, '\\n');

    const loaded = await loadSigningCa({
      ...secrets,
      SIGNING_CA_KEY: oneLine(secrets.SIGNING_CA_KEY),
      SIGNING_CA_CERT: oneLine(secrets.SIGNING_CA_CERT),
    });

    expect(loaded.certificate.subject).toBe(ca.certificate.subject);
  });

  it.each([
    ['without the key', { SIGNING_CA_KEY: undefined }],
    ['with a short key-encryption key', { SIGNING_KEY_ENCRYPTION_KEY: 'c2hvcnQ=' }],
    ['with a broken certificate', { SIGNING_CA_CERT: 'not a certificate' }],
  ])('is unavailable %s', async (_case, override) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(loadSigningCa({ ...secrets, ...override })).rejects.toMatchObject({
      code: 'service_unavailable',
      reason: 'signing_unavailable',
    });
  });
});

describe('an identity', () => {
  it('has a two-year certificate from the CA naming the person and the account', async () => {
    const identity = await createIdentity(ca, accountId, '  Ion Popescu  ', now);
    const certificate = new x509.X509Certificate(identity.certificatePem);

    expect(certificate.subject).toBe(`CN=Ion Popescu, 2.5.4.5=${accountId}`);
    expect(certificate.issuer).toBe(ca.certificate.subject);
    expect(
      await certificate.verify({ publicKey: ca.certificate.publicKey, date: now }, crypto)
    ).toBe(true);
    expect(certificate.serialNumber).toBe(identity.certificateSerial);
    expect(identity.subjectName).toBe('Ion Popescu');
    expect(identity.notBefore.toISOString()).toBe('2026-10-18T09:30:12.000Z');
    expect(identity.notAfter.toISOString()).toBe('2028-10-18T09:30:12.000Z');
    expect(certificate.notAfter.toISOString()).toBe(identity.notAfter.toISOString());
    const usages = certificate.getExtension(x509.KeyUsagesExtension)!;
    expect(usages.usages).toBe(
      x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.nonRepudiation
    );
    expect(certificate.getExtension(x509.BasicConstraintsExtension)!.ca).toBe(false);
  });

  it('keeps the private key encrypted, with a fresh IV per key', async () => {
    const first = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const second = await createIdentity(ca, accountId, 'Ion Popescu', now);

    expect(first.keyVersion).toBe(1);
    expect(first.privateKeyEncrypted.slice(0, 12)).not.toEqual(
      second.privateKeyEncrypted.slice(0, 12)
    );
    expect(first.certificateSerial).not.toBe(second.certificateSerial);
    expect(new TextDecoder('latin1').decode(first.privateKeyEncrypted)).not.toContain('PRIVATE');
  });

  it('signs as WebCrypto does, raw r||s that the certificate verifies', async () => {
    const identity = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const toSign = crypto.getRandomValues(new Uint8Array(219));

    const signature = await signWithIdentity(ca, identity, toSign);

    expect(signature.byteLength).toBe(64);
    expect(await verify(identity, toSign, signature)).toBe(true);
  });

  it('does not sign with a key moved to another account', async () => {
    const identity = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const moved = { ...identity, accountId: '00000000-0000-4000-8000-000000000001' };

    await expect(signWithIdentity(ca, moved, new Uint8Array(32))).rejects.toThrow();
  });

  it('does not sign under another authority', async () => {
    const identity = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const other = await loadSigningCa(await generateSigningCa(now));

    await expect(signWithIdentity(other, identity, new Uint8Array(32))).rejects.toThrow();
  });
});

describe('identityFor', () => {
  it('issues and stores an identity for an account that has none', async () => {
    const store = memoryStore();

    const identity = await identityFor(ca, store, accountId, 'Ion Popescu', now);

    expect(store.save).toHaveBeenCalledWith(identity);
  });

  it('reuses a current identity', async () => {
    const current = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const store = memoryStore(current);

    const later = new Date('2027-06-01T00:00:00Z');
    expect(await identityFor(ca, store, accountId, 'Ion Popescu', later)).toBe(current);
    expect(store.save).not.toHaveBeenCalled();
  });

  it.each([
    ['expires within 30 days', 'Ion Popescu', new Date('2028-09-25T00:00:00Z')],
    ['has expired', 'Ion Popescu', new Date('2029-01-01T00:00:00Z')],
    ['names the person differently', 'Ion Popescu-Ionescu', new Date('2027-01-01T00:00:00Z')],
  ])('reissues one that %s', async (_case, name, at) => {
    const current = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const store = memoryStore(current);

    const identity = await identityFor(ca, store, accountId, name, at);

    expect(identity.certificateSerial).not.toBe(current.certificateSerial);
    expect(identity.notBefore.getTime()).toBe(Math.floor(at.getTime() / 1000) * 1000);
    expect(store.save).toHaveBeenCalledWith(identity);
  });

  it('reissues one from an authority that has been replaced', async () => {
    const current = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const replaced = await loadSigningCa(await generateSigningCa(now));

    const identity = await identityFor(
      replaced,
      memoryStore(current),
      accountId,
      'Ion Popescu',
      now
    );

    expect(identity.certificateSerial).not.toBe(current.certificateSerial);
    expect(new x509.X509Certificate(identity.certificatePem).issuer).toBe(
      replaced.certificate.subject
    );
    expect(
      await verify(
        identity,
        new Uint8Array(8),
        await signWithIdentity(replaced, identity, new Uint8Array(8))
      )
    ).toBe(true);
  });

  it('reissues one whose key was stored under a replaced key-encryption key', async () => {
    const current = await createIdentity(ca, accountId, 'Ion Popescu', now);
    const rekeyed = await loadSigningCa({
      ...secrets,
      SIGNING_KEY_ENCRYPTION_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString(
        'base64'
      ),
    });

    const identity = await identityFor(
      rekeyed,
      memoryStore(current),
      accountId,
      'Ion Popescu',
      now
    );

    expect(identity.certificateSerial).not.toBe(current.certificateSerial);
    expect((await signWithIdentity(rekeyed, identity, new Uint8Array(8))).byteLength).toBe(64);
  });

  it('issueIdentity replaces whatever the account had', async () => {
    const store = memoryStore(await createIdentity(ca, accountId, 'Ion Popescu', now));

    const identity = await issueIdentity(ca, store, accountId, 'Ion Popescu', now);

    expect(await store.load(accountId)).toBe(identity);
  });

  it('cuts a name longer than a common name may be', async () => {
    const long = 'Maria-Magdalena Ecaterina Alexandrescu-Constantinescu-Vasilescu Popescu';

    const identity = await createIdentity(ca, accountId, long, now);

    const commonName = new x509.X509Certificate(identity.certificatePem).subjectName.getField(
      'CN'
    )[0]!;
    expect(commonName.length).toBeLessThanOrEqual(64);
    expect(identity.subjectName).toBe(long);
  });
});
