// Verifies a Standard Webhooks signature (https://www.standardwebhooks.com), which is how
// Supabase Auth signs its HTTP hooks: HMAC-SHA256 over "<id>.<timestamp>.<body>" with the
// base64 key that follows "whsec_", sent as one or more space-separated "v1,<base64>".

const TOLERANCE_SECONDS = 5 * 60;

const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

// Supabase shows the secret as "v1,whsec_<base64>"; several may be joined with "|" while
// one is being rotated out.
function signingKeys(secret: string) {
  return secret
    .split('|')
    .map((part) =>
      part
        .trim()
        .replace(/^v1,/, '')
        .replace(/^whsec_/, '')
    )
    .filter(Boolean);
}

export interface SignedRequest {
  id: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  body: string;
}

export async function verifyWebhookSignature(
  secret: string,
  { id, timestamp, signature, body }: SignedRequest,
  now: number = Date.now()
): Promise<boolean> {
  if (!id || !timestamp || !signature) return false;

  // A captured request cannot be replayed once it is older than the tolerance.
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) return false;

  const candidates = signature
    .split(' ')
    .filter((entry) => entry.startsWith('v1,'))
    .map((entry) => entry.slice(3));
  const message = new TextEncoder().encode(`${id}.${timestamp}.${body}`);

  for (const key of signingKeys(secret)) {
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await crypto.subtle.importKey(
        'raw',
        decodeBase64(key),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );
    } catch {
      continue;
    }
    for (const candidate of candidates) {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = decodeBase64(candidate);
      } catch {
        continue;
      }
      // `verify` compares in constant time.
      if (await crypto.subtle.verify('HMAC', cryptoKey, bytes, message)) return true;
    }
  }
  return false;
}
