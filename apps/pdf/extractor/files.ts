export type ImageKind = 'jpeg' | 'png' | 'heic';

const startsWith = (bytes: Uint8Array, prefix: number[], at = 0) =>
  prefix.every((byte, index) => bytes[at + index] === byte);

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

const heifBrands = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

export function imageKind(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp' && heifBrands.has(ascii(bytes, 8, 12))) {
    return 'heic';
  }
  return null;
}

export const isJpeg = (bytes: Uint8Array) => imageKind(bytes) === 'jpeg';

// The PDF specification lets the header start anywhere in the first kilobyte.
export const isPdf = (bytes: Uint8Array) =>
  ascii(bytes, 0, Math.min(bytes.length, 1024)).includes('%PDF-');

const cfbSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

// Besides Word 97–2003, other programs and older web exports save RTF, HTML and Office Open XML
// under the name `.doc`, and LibreOffice reads them all.
export function isWordLike(bytes: Uint8Array): boolean {
  if (startsWith(bytes, cfbSignature)) return true;
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return true;
  const head = bytes.subarray(0, 512);
  if (head.some((byte) => byte < 0x09 || (byte > 0x0d && byte < 0x20))) return false;
  const text = new TextDecoder().decode(head).trimStart();
  return text.startsWith('{\\rtf') || /^<[!?a-z]/i.test(text);
}

const endOfChain = 0xfffffffe;

// LibreOffice reports a file it needs a password for as one it cannot read, so the compound
// file (MS-CFB) is read here: an encrypted `.docx` package, or a `.doc` whose File Information
// Block says it is encrypted or obfuscated.
export function isPasswordProtectedWord(bytes: Uint8Array): boolean {
  if (bytes.length < 512 || !startsWith(bytes, cfbSignature)) return false;
  try {
    const compound = readCompound(bytes);
    if (compound.entries.has('EncryptedPackage')) return true;
    const word = compound.entries.get('WordDocument');
    if (!word || word.size < compound.miniStreamCutoff) return false;
    const fib = compound.sector(word.start);
    if (fib[0] !== 0xec || fib[1] !== 0xa5) return false;
    const flags = fib[0x0a]! | (fib[0x0b]! << 8);
    return (flags & 0x0100) !== 0 || (flags & 0x8000) !== 0;
  } catch {
    return false;
  }
}

function readCompound(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorSize = 1 << view.getUint16(0x1e, true);
  const sectorCount = Math.floor(bytes.length / sectorSize);
  const sector = (index: number) => {
    if (index >= sectorCount) throw new Error('sector outside the file');
    const start = (index + 1) * sectorSize;
    return bytes.subarray(start, start + sectorSize);
  };
  const u32 = (data: Uint8Array, offset: number) =>
    new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true);

  const fatSectors: number[] = [];
  for (let offset = 0x4c; offset < 0x200; offset += 4)
    fatSectors.push(view.getUint32(offset, true));
  let difat = view.getUint32(0x44, true);
  for (let guard = 0; difat !== endOfChain && difat < sectorCount && guard < sectorCount; guard++) {
    const data = sector(difat);
    for (let offset = 0; offset < sectorSize - 4; offset += 4) fatSectors.push(u32(data, offset));
    difat = u32(data, sectorSize - 4);
  }
  const fat: number[] = [];
  for (const index of fatSectors) {
    if (index >= sectorCount) continue;
    const data = sector(index);
    for (let offset = 0; offset < sectorSize; offset += 4) fat.push(u32(data, offset));
  }

  const entries = new Map<string, { start: number; size: number }>();
  let current = view.getUint32(0x30, true);
  for (let guard = 0; current !== endOfChain && guard < sectorCount; guard++) {
    const data = sector(current);
    for (let offset = 0; offset + 128 <= sectorSize; offset += 128) {
      const nameBytes = new DataView(data.buffer, data.byteOffset + offset + 0x40, 2).getUint16(
        0,
        true
      );
      if (nameBytes < 2 || nameBytes > 64) continue;
      const name = new TextDecoder('utf-16le').decode(
        data.subarray(offset, offset + nameBytes - 2)
      );
      entries.set(name, { start: u32(data, offset + 0x74), size: u32(data, offset + 0x78) });
    }
    current = fat[current] ?? endOfChain;
  }

  return { entries, sector, miniStreamCutoff: view.getUint32(0x38, true) };
}

export type PdfInfo = { pageCount: number; pageSizes: Map<number, [number, number]> };

export function parsePdfInfo(output: string): PdfInfo {
  const pages = /^Pages:\s+(\d+)/m.exec(output);
  const pageSizes = new Map<number, [number, number]>();
  for (const match of output.matchAll(/^Page\s+(\d+) size:\s+([\d.]+) x ([\d.]+) pts/gm)) {
    pageSizes.set(Number(match[1]), [Number(match[2]), Number(match[3])]);
  }
  return { pageCount: pages ? Number(pages[1]) : 0, pageSizes };
}

export const scanThreshold = 100;

export type PdfPage = { number: number; text: string; isScan: boolean };

// Layout mode pads lines with spaces, so a scan is told by the characters that are not whitespace.
export function splitPages(text: string, pageCount: number): PdfPage[] {
  const parts = text.split('\f');
  return Array.from({ length: pageCount }, (_, index) => {
    const pageText = (parts[index] ?? '').replace(/\s+$/, '');
    return {
      number: index + 1,
      text: pageText,
      isScan: pageText.replace(/\s/g, '').length < scanThreshold,
    };
  });
}

export const pageImageDpi = 150;
export const longestEdgePixels = 2500;

export function dpiFor(size: [number, number] | undefined): number {
  if (!size) return pageImageDpi;
  const longestInches = Math.max(...size) / 72;
  return Math.max(
    1,
    Math.min(pageImageDpi, Math.floor(longestEdgePixels / Math.max(longestInches, 0.01)))
  );
}
