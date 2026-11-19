export const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export async function sha256(data: Uint8Array | string) {
  // A copy with a plain ArrayBuffer behind it, which is what the digest is typed to take.
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}
