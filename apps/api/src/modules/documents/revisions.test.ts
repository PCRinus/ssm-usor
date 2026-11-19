import { describe, expect, it } from 'vitest';

import { maxDocxBytes } from '../../lib/docx';
import { requireSignedCopy } from './revisions';

const pdf = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-'));
  return bytes;
};

describe('a signed copy', () => {
  it('is a PDF of at most 15 MB', () => {
    expect(() => requireSignedCopy(pdf(1024))).not.toThrow();
    expect(() => requireSignedCopy(pdf(maxDocxBytes))).not.toThrow();
  });

  it('is refused empty, too large or not a PDF', () => {
    for (const bytes of [new Uint8Array(), pdf(maxDocxBytes + 1)]) {
      expect(() => requireSignedCopy(bytes)).toThrow(
        expect.objectContaining({
          code: 'validation_error',
          message: 'The file is empty or larger than 15 MB.',
        })
      );
    }
    expect(() => requireSignedCopy(new TextEncoder().encode('PK\u0003\u0004'))).toThrow(
      expect.objectContaining({ code: 'validation_error', message: 'The signed copy is a PDF.' })
    );
  });
});
