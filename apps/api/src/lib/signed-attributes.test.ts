import { beforeAll, describe, expect, it, vi } from 'vitest';

import { checkToSign, readSignedAttributes } from './signed-attributes';
import { createIdentity, generateSigningCa, loadSigningCa } from './signing-ca';
import { x509 } from './x509';

function tlv(tag: number, ...parts: Uint8Array[]) {
  const body = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  const length =
    body.length < 0x80
      ? [body.length]
      : body.length < 0x100
        ? [0x81, body.length]
        : [0x82, body.length >> 8, body.length & 0xff];
  return new Uint8Array([tag, ...length, ...body]);
}

function oid(dotted: string) {
  const [first, second, ...rest] = dotted.split('.').map(Number);
  const bytes = [first! * 40 + second!];
  for (const value of rest) {
    const groups = [value & 0x7f];
    for (let left = value >> 7; left > 0; left >>= 7) groups.unshift((left & 0x7f) | 0x80);
    bytes.push(...groups);
  }
  return tlv(0x06, new Uint8Array(bytes));
}

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
const unhex = (text: string) => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16));

function signedAttributes(messageDigest: string, certificateHash: string, withAlgorithm = false) {
  const essCertId = tlv(
    0x30,
    ...(withAlgorithm ? [tlv(0x30, oid('2.16.840.1.101.3.4.2.1'))] : []),
    tlv(0x04, unhex(certificateHash))
  );
  return tlv(
    0x31,
    tlv(0x30, oid('1.2.840.113549.1.9.3'), tlv(0x31, oid('1.2.840.113549.1.7.1'))),
    tlv(0x30, oid('1.2.840.113549.1.9.4'), tlv(0x31, tlv(0x04, unhex(messageDigest)))),
    tlv(0x30, oid('1.2.840.113549.1.9.16.2.47'), tlv(0x31, tlv(0x30, tlv(0x30, essCertId))))
  );
}

const prepared = new TextEncoder().encode(
  '%PDF-1.7 head /ByteRange [0 30 40 10] <00000000> tail-bytes'
);
let certificatePem: string;
let certificateHash: string;
let documentDigest: string;

beforeAll(async () => {
  const ca = await loadSigningCa(await generateSigningCa());
  certificatePem = (await createIdentity(ca, '1e8b36cc-d87a-4318-9af2-acb1f6156112', 'Ion Pop'))
    .certificatePem;
  certificateHash = hex(
    await crypto.subtle.digest('SHA-256', new x509.X509Certificate(certificatePem).rawData)
  );
  const covered = new Uint8Array([...prepared.subarray(0, 30), ...prepared.subarray(40, 50)]);
  documentDigest = hex(await crypto.subtle.digest('SHA-256', covered));
});

describe('readSignedAttributes', () => {
  it('reads the message digest and the certificate hash, with or without the hash algorithm', () => {
    for (const withAlgorithm of [false, true]) {
      expect(
        readSignedAttributes(signedAttributes('ab'.repeat(32), 'cd'.repeat(32), withAlgorithm))
      ).toEqual({ messageDigest: 'ab'.repeat(32), certificateHash: 'cd'.repeat(32) });
    }
  });

  it('refuses bytes that are not a SET of attributes', () => {
    expect(() => readSignedAttributes(new Uint8Array([0x30, 0x00]))).toThrow();
    expect(() => readSignedAttributes(new Uint8Array([0x31, 0x05, 0x30]))).toThrow();
  });
});

describe('checkToSign', () => {
  it('lets through the attributes of this document and this certificate', async () => {
    await expect(
      checkToSign(prepared, signedAttributes(documentDigest, certificateHash), certificatePem)
    ).resolves.toBeUndefined();
  });

  it.each([
    ['another document', () => signedAttributes('00'.repeat(32), certificateHash)],
    ['another certificate', () => signedAttributes(documentDigest, '00'.repeat(32))],
    ['bytes that are not signed attributes', () => new Uint8Array(32)],
  ])('refuses to sign over %s', async (_case, toSign) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(checkToSign(prepared, toSign(), certificatePem)).rejects.toMatchObject({
      code: 'service_unavailable',
      reason: 'signer_unavailable',
    });
  });
});
