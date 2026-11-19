import { sha256 } from './hash';

/** Only its hash is stored. */
export function createToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

export const hashToken = (token: string) => sha256(token);
