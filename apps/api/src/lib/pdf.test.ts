import { describe, expect, it } from 'vitest';

import { isPdf } from './pdf';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('a PDF by its first bytes', () => {
  it('starts with the %PDF- signature', () => {
    expect(isPdf(bytes('%PDF-1.7\n'))).toBe(true);
    expect(isPdf(bytes('%PDF-'))).toBe(true);
  });

  it('is not anything shorter or anything else', () => {
    expect(isPdf(bytes(''))).toBe(false);
    expect(isPdf(bytes('%PDF'))).toBe(false);
    expect(isPdf(bytes('PK\u0003\u0004'))).toBe(false);
    expect(isPdf(bytes(' %PDF-1.7'))).toBe(false);
  });
});
