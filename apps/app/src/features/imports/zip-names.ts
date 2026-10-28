// Bytes 0x80 to 0xFF of CP852, the code page Windows writes Romanian names in, with ş and ţ
// read as ș and ț: the code page has no comma below, so Windows wrote those as cedillas.
const cp852 = [
  'ÇüéâäůćçłëŐőîŹÄĆ',
  'ÉĹĺôöĽľŚśÖÜŤťŁ×č',
  'áíóúĄąŽžĘę¬źČș«»',
  '░▒▓│┤ÁÂĚȘ╣║╗╝Żż┐',
  '└┴┬├─┼Ăă╚╔╩╦╠═╬¤',
  'đĐĎËďŇÍÎě┘┌█▄ȚŮ▀',
  'ÓßÔŃńňŠšŔÚŕŰýÝț´',
  '­˝˛ˇ˘§÷¸°¨˙űŘř■ ',
].join('');

const utf8 = new TextDecoder('utf-8', { fatal: true });

export function decodeZipName(raw: Uint8Array) {
  try {
    return utf8.decode(raw);
  } catch {
    return Array.from(raw, (byte) =>
      byte < 0x80 ? String.fromCharCode(byte) : cp852[byte - 0x80]!
    ).join('');
  }
}

const endOfDirectory = 0x06054b50;
const zip64Locator = 0x07064b50;
const zip64EndOfDirectory = 0x06064b50;
const directoryEntry = 0x02014b50;
const utf8Flag = 0x800;

// fflate reads a name without the UTF-8 flag as Latin-1, but Finder writes UTF-8 names without
// the flag and Windows writes its OEM code page.
export function zipNameFixes(zip: Uint8Array) {
  const fixes = new Map<string, string>();
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    const stop = Math.max(0, zip.length - 22 - 0xffff);
    let end = zip.length - 22;
    while (end >= stop && view.getUint32(end, true) !== endOfDirectory) end -= 1;
    if (end < stop) return fixes;
    let count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    if (count === 0xffff || offset === 0xffffffff) {
      if (view.getUint32(end - 20, true) !== zip64Locator) return fixes;
      const record = Number(view.getBigUint64(end - 12, true));
      if (view.getUint32(record, true) !== zip64EndOfDirectory) return fixes;
      count = Number(view.getBigUint64(record + 32, true));
      offset = Number(view.getBigUint64(record + 48, true));
    }
    for (let index = 0; index < count; index += 1) {
      if (view.getUint32(offset, true) !== directoryEntry) break;
      const nameLength = view.getUint16(offset + 28, true);
      if (!(view.getUint16(offset + 8, true) & utf8Flag)) {
        const raw = zip.subarray(offset + 46, offset + 46 + nameLength);
        const asRead = String.fromCharCode(...raw);
        const name = decodeZipName(raw);
        if (name !== asRead) fixes.set(asRead, name);
      }
      offset +=
        46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    }
  } catch {
    // A directory cut short keeps the names read so far; fflate reports the zip itself.
  }
  return fixes;
}
