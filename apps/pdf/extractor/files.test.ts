import { describe, expect, it } from 'vitest';

import {
  dpiFor,
  imageKind,
  isPasswordProtectedWord,
  isPdf,
  isWordLike,
  parsePdfInfo,
  splitPages,
} from './files.ts';

const ascii = (text: string) => new TextEncoder().encode(text);
const free = 0xffffffff;
const endOfChain = 0xfffffffe;

function compoundFile(streamName: string, wordFlags = 0): Uint8Array {
  const sector = 512;
  const bytes = new Uint8Array(sector * 11);
  const view = new DataView(bytes.buffer);
  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  view.setUint16(0x1e, 9, true);
  view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true);
  view.setUint32(0x30, 1, true);
  view.setUint32(0x38, 4096, true);
  view.setUint32(0x3c, endOfChain, true);
  view.setUint32(0x44, endOfChain, true);
  for (let offset = 0x4c; offset < 0x200; offset += 4) view.setUint32(offset, free, true);
  view.setUint32(0x4c, 0, true);

  const fat = sector;
  for (let index = 0; index < 128; index++) view.setUint32(fat + index * 4, free, true);
  view.setUint32(fat, 0xfffffffd, true);
  view.setUint32(fat + 4, endOfChain, true);
  for (let index = 2; index < 9; index++) view.setUint32(fat + index * 4, index + 1, true);
  view.setUint32(fat + 9 * 4, endOfChain, true);

  const directory = sector * 2;
  const entry = (at: number, name: string, type: number, start: number, size: number) => {
    for (let index = 0; index < name.length; index++) {
      view.setUint16(at + index * 2, name.charCodeAt(index), true);
    }
    view.setUint16(at + 0x40, (name.length + 1) * 2, true);
    bytes[at + 0x42] = type;
    view.setUint32(at + 0x74, start, true);
    view.setUint32(at + 0x78, size, true);
  };
  entry(directory, 'Root Entry', 5, endOfChain, 0);
  entry(directory + 128, streamName, 2, 2, 4096);

  const stream = sector * 3;
  bytes.set([0xec, 0xa5], stream);
  view.setUint16(stream + 0x0a, wordFlags, true);
  return bytes;
}

describe('imageKind', () => {
  it('tells a JPEG, a PNG and a HEIC by their first bytes', () => {
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe1]))).toBe('jpeg');
    expect(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(imageKind(ascii('\0\0\0\x18ftypheic\0\0\0\0'))).toBe('heic');
    expect(imageKind(ascii('\0\0\0\x18ftypmif1\0\0\0\0'))).toBe('heic');
    expect(imageKind(ascii('\0\0\0\x18ftypisom\0\0\0\0'))).toBeNull();
    expect(imageKind(ascii('%PDF-1.7'))).toBeNull();
  });
});

describe('isPdf', () => {
  it('finds the header within the first kilobyte', () => {
    expect(isPdf(ascii('%PDF-1.4\n'))).toBe(true);
    expect(isPdf(ascii(`${' '.repeat(200)}%PDF-1.4`))).toBe(true);
    expect(isPdf(ascii('PK\x03\x04'))).toBe(false);
  });
});

describe('isWordLike', () => {
  it('takes Word 97–2003, Office Open XML, RTF and HTML', () => {
    expect(isWordLike(compoundFile('WordDocument'))).toBe(true);
    expect(isWordLike(ascii('PK\x03\x04 [Content_Types].xml'))).toBe(true);
    expect(isWordLike(ascii('{\\rtf1\\ansi Decizia nr. 1'))).toBe(true);
    expect(isWordLike(ascii('\uFEFF\n  <html><body>Decizia</body></html>'))).toBe(true);
    expect(isWordLike(ascii('<?xml version="1.0"?><w:wordDocument>'))).toBe(true);
  });

  it('refuses other bytes, binary ones that happen to start with a bracket among them', () => {
    expect(isWordLike(ascii('%PDF-1.7'))).toBe(false);
    expect(isWordLike(ascii('Decizia nr. 1, as plain text'))).toBe(false);
    expect(isWordLike(new Uint8Array([0x3c, 0x16, 0xb9, 0x3a, 0xe0, 0xab]))).toBe(false);
  });
});

describe('isPasswordProtectedWord', () => {
  it('reads the encryption flags of a .doc', () => {
    expect(isPasswordProtectedWord(compoundFile('WordDocument'))).toBe(false);
    expect(isPasswordProtectedWord(compoundFile('WordDocument', 0x0100))).toBe(true);
    expect(isPasswordProtectedWord(compoundFile('WordDocument', 0x8000))).toBe(true);
  });

  it('knows an encrypted .docx by its package stream', () => {
    expect(isPasswordProtectedWord(compoundFile('EncryptedPackage'))).toBe(true);
  });

  it('says no for anything that is not a readable compound file', () => {
    expect(isPasswordProtectedWord(ascii('{\\rtf1 '.repeat(100)))).toBe(false);
    const truncated = compoundFile('WordDocument', 0x0100).subarray(0, 1024);
    expect(isPasswordProtectedWord(truncated)).toBe(false);
  });
});

describe('parsePdfInfo', () => {
  it('reads the page count and the sizes of the pages listed', () => {
    const output = [
      'Producer:        LibreOffice 25.2',
      'Pages:           3',
      'Encrypted:       no',
      'Page    1 size:  595.276 x 841.89 pts (A4)',
      'Page    1 rot:   0',
      'Page    2 size:  1190.55 x 841.89 pts (A3)',
    ].join('\n');
    const info = parsePdfInfo(output);
    expect(info.pageCount).toBe(3);
    expect(info.pageSizes.get(1)).toEqual([595.276, 841.89]);
    expect(info.pageSizes.get(2)).toEqual([1190.55, 841.89]);
    expect(info.pageSizes.has(3)).toBe(false);
  });
});

describe('splitPages', () => {
  it('splits at form feeds and marks a page with little text as a scan', () => {
    const text = `${'Decizia nr. 1 privind organizarea activității de securitate și sănătate în muncă. '.repeat(2)}\f   \n  Semnătura  \n\f\f`;
    expect(splitPages(text, 3)).toEqual([
      { number: 1, text: text.split('\f')[0]!.trimEnd(), isScan: false },
      { number: 2, text: '   \n  Semnătura', isScan: true },
      { number: 3, text: '', isScan: true },
    ]);
  });

  it('does not count layout padding as text', () => {
    const padded = `${' '.repeat(500)}${'x'.repeat(99)}\f`;
    expect(splitPages(padded, 1)[0]!.isScan).toBe(true);
    expect(splitPages(`${'x'.repeat(100)}\f`, 1)[0]!.isScan).toBe(false);
  });
});

describe('dpiFor', () => {
  it('renders at 150 dpi and lowers it for a page too large', () => {
    expect(dpiFor([595.276, 841.89])).toBe(150);
    expect(dpiFor(undefined)).toBe(150);
    expect(dpiFor([2383.94, 3370.39])).toBe(53);
  });
});
