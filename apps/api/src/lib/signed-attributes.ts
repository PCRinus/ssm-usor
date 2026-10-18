import { ApiError } from './errors';
import { x509 } from './x509';

// The API signs whatever `toSign` the signer container hands it. Before it does, it checks that
// those bytes are CMS signed attributes over the very PDF it was given back and the certificate it
// chose, so that a signer container that misbehaved cannot have it sign something else.

const OID_MESSAGE_DIGEST = '1.2.840.113549.1.9.4';
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

type Node = { tag: number; start: number; end: number; next: number };

function readNode(bytes: Uint8Array, offset: number, limit = bytes.length): Node {
  if (offset + 2 > limit) throw new Error('truncated');
  const tag = bytes[offset]!;
  let length = bytes[offset + 1]!;
  let start = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4 || start + count > limit) throw new Error('bad length');
    length = 0;
    for (let index = 0; index < count; index++) length = length * 256 + bytes[start + index]!;
    start += count;
  }
  const end = start + length;
  if (end > limit) throw new Error('truncated');
  return { tag, start, end, next: end };
}

function children(bytes: Uint8Array, node: Node) {
  const nodes: Node[] = [];
  for (let offset = node.start; offset < node.end;) {
    const child = readNode(bytes, offset, node.end);
    nodes.push(child);
    offset = child.next;
  }
  return nodes;
}

function oidOf(bytes: Uint8Array, node: Node) {
  if (node.tag !== 0x06) throw new Error('not an OID');
  const body = bytes.subarray(node.start, node.end);
  const parts = [Math.floor(body[0]! / 40), body[0]! % 40];
  let value = 0;
  for (const byte of body.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function sha256(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', joined)));
}

/** The digest the signature covers: the newest `/ByteRange`, the placeholder just added. */
export async function byteRangeDigest(pdf: Uint8Array) {
  let text = '';
  for (let start = 0; start < pdf.length; start += 0x8000) {
    text += String.fromCharCode(...pdf.subarray(start, start + 0x8000));
  }
  const last = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/.exec(
    text.slice(text.lastIndexOf('/ByteRange'))
  );
  if (!last) throw new Error('no ByteRange');
  const [a, b, c, d] = last.slice(1, 5).map(Number) as [number, number, number, number];
  if (a !== 0 || a + b > c || c + d > pdf.length) throw new Error('bad ByteRange');
  return sha256(pdf.subarray(a, a + b), pdf.subarray(c, c + d));
}

type SignedAttributes = { messageDigest: string; certificateHash: string | null };

export function readSignedAttributes(der: Uint8Array): SignedAttributes {
  const root = readNode(der, 0);
  if (root.tag !== 0x31 || root.next !== der.length) throw new Error('not a SET');
  let messageDigest: string | null = null;
  let certificateHash: string | null = null;
  for (const attribute of children(der, root)) {
    const [type, values] = children(der, attribute);
    if (!type || !values || values.tag !== 0x31) throw new Error('bad attribute');
    const oid = oidOf(der, type);
    const [value] = children(der, values);
    if (!value) throw new Error('empty attribute');
    if (oid === OID_MESSAGE_DIGEST) {
      if (value.tag !== 0x04) throw new Error('messageDigest is not an OCTET STRING');
      messageDigest = hex(der.subarray(value.start, value.end));
    } else if (oid === OID_SIGNING_CERTIFICATE_V2) {
      const [certificates] = children(der, value);
      const [first] = certificates ? children(der, certificates) : [];
      if (!first) throw new Error('no ESSCertIDv2');
      const fields = children(der, first);
      // hashAlgorithm is optional and defaults to SHA-256 (RFC 5035).
      const algorithm = fields[0]?.tag === 0x30 ? fields[0] : null;
      if (algorithm) {
        const [algorithmOid] = children(der, algorithm);
        if (!algorithmOid || oidOf(der, algorithmOid) !== OID_SHA256) {
          throw new Error('signingCertificateV2 is not SHA-256');
        }
      }
      const hash = fields[algorithm ? 1 : 0];
      if (!hash || hash.tag !== 0x04) throw new Error('no certHash');
      certificateHash = hex(der.subarray(hash.start, hash.end));
    }
  }
  if (!messageDigest) throw new Error('no messageDigest');
  return { messageDigest, certificateHash };
}

/**
 * Refuses to sign unless `toSign` carries the digest of `prepared` outside its `/ByteRange` hole
 * and names `certificatePem` in its signingCertificateV2.
 */
export async function checkToSign(
  prepared: ArrayBuffer | Uint8Array,
  toSign: ArrayBuffer | Uint8Array,
  certificatePem: string
) {
  try {
    const attributes = readSignedAttributes(new Uint8Array(toSign));
    const digest = await byteRangeDigest(new Uint8Array(prepared));
    if (attributes.messageDigest !== digest) throw new Error('messageDigest differs');
    const certificate = new Uint8Array(new x509.X509Certificate(certificatePem).rawData);
    if (attributes.certificateHash !== (await sha256(certificate))) {
      throw new Error('signingCertificateV2 differs');
    }
  } catch (error) {
    console.error(
      `The signer's bytes to sign were refused: ${error instanceof Error ? error.message : 'unknown'}`
    );
    throw new ApiError(
      'service_unavailable',
      'The signing service answered something the API will not sign. Nothing was signed.',
      undefined,
      'signer_unavailable'
    );
  }
}
