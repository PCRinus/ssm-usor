import { describe, expect, it } from 'vitest';

import { fileNameWords } from './content-disposition';

describe('the words of a file name', () => {
  it('are capitalised ASCII, without diacritics or punctuation', () => {
    expect(fileNameWords('ȘTEFĂNESCU-POPA ana maria')).toEqual([
      'Stefanescu',
      'Popa',
      'Ana',
      'Maria',
    ]);
  });

  it('drop a character with no ASCII letter in it', () => {
    expect(fileNameWords("  O'Neill  ß 2  ")).toEqual(['O', 'Neill', '2']);
  });
});
