import { ApiError } from './errors';

export const maxDocxBytes = 15 * 1024 * 1024;
const bytesOf = (text: string) => new TextEncoder().encode(text);
const zipSignature = [0x50, 0x4b, 0x03, 0x04];
const documentPart = bytesOf('word/document.xml');

function includes(haystack: Uint8Array, needle: Uint8Array) {
  outer: for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    for (let index = 0; index < needle.length; index += 1) {
      if (haystack[start + index] !== needle[index]) continue outer;
    }
    return true;
  }
  return false;
}

// A zip that names the main part of a Word document. File names are stored as they are, so
// this needs no unzipping; it keeps a PDF or a picture out, not a determined forger.
export const looksLikeDocx = (bytes: Uint8Array) =>
  zipSignature.every((byte, index) => bytes[index] === byte) && includes(bytes, documentPart);

export function requireDocx(bytes: Uint8Array) {
  if (bytes.length === 0 || bytes.length > maxDocxBytes) {
    throw new ApiError('validation_error', 'The file is empty or larger than 15 MB.');
  }
  if (!looksLikeDocx(bytes)) {
    throw new ApiError('validation_error', 'The file is not a Word document (.docx).');
  }
}

export async function sha256(bytes: Uint8Array) {
  // A copy with a plain ArrayBuffer behind it, which is what the digest is typed to take.
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
