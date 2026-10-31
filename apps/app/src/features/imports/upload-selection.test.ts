import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  addToSelection,
  cleanPath,
  emptySelection,
  removeGroup,
  selectionRows,
  selectionTotals,
} from './upload-selection';

const blob = (text = 'x', type = '') => new Blob([text], { type });

const zip = (entries: Record<string, string | Uint8Array>) =>
  new Blob([
    zipSync(
      Object.fromEntries(
        Object.entries(entries).map(([name, content]) => [
          name,
          typeof content === 'string' ? strToU8(content) : content,
        ])
      )
    ) as BlobPart,
  ]);

const zipBytes = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

// Swaps a name for raw bytes of the same length, without the UTF-8 flag.
function rename(zipped: Uint8Array, placeholder: string, name: string | number[]) {
  const from = strToU8(placeholder);
  const to = typeof name === 'string' ? strToU8(name) : [...name, ...from.slice(name.length)];
  for (let at = 0; at <= zipped.length - from.length; at += 1) {
    if (from.every((byte, index) => zipped[at + index] === byte)) zipped.set(to, at);
  }
  return zipped;
}

const megabytes = (count: number) => new Uint8Array(count * 1024 * 1024);

describe('choosing the files of an import', () => {
  it('opens a zip in the browser and keeps its paths under the zip', async () => {
    const selection = await addToSelection(emptySelection, [
      {
        path: 'dosar-ssm.zip',
        blob: zip({
          'Decizii/Decizie 1.docx': 'a',
          'Instructiuni PSI.doc': 'b',
          '__MACOSX/Decizii/._Decizie 1.docx': 'c',
          'plan evacuare.dwg': 'd',
          'Decizii/.DS_Store': 'e',
        }),
      },
    ]);

    expect(selection.files.map((file) => [file.path, file.mimeType, file.group])).toEqual([
      [
        'dosar-ssm.zip/Decizii/Decizie 1.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'dosar-ssm.zip',
      ],
      ['dosar-ssm.zip/Instructiuni PSI.doc', 'application/msword', 'dosar-ssm.zip'],
    ]);
    expect(selection.setAside).toMatchObject([
      { path: 'dosar-ssm.zip/plan evacuare.dwg', reason: 'unsupported' },
    ]);
    expect(selection.systemFiles).toHaveLength(2);
    expect(selectionRows(selection.files)).toMatchObject([
      { kind: 'folder', group: 'dosar-ssm.zip', zip: true },
    ]);
  });

  it('leaves out the lock files Word keeps beside an open document, in a folder and in a zip', async () => {
    const selection = await addToSelection(emptySelection, [
      { path: 'Dosar SSM/Decizie numire.docx', blob: blob() },
      { path: 'Dosar SSM/~$cizie numire.docx', blob: blob() },
      { path: 'Dosar SSM/PSI/~$structiuni.doc', blob: blob() },
      { path: 'arhiva.zip', blob: zip({ 'Plan.doc': 'a', '~$Plan.doc': 'b' }) },
    ]);

    expect(selection.files.map((file) => file.path)).toEqual([
      'Dosar SSM/Decizie numire.docx',
      'arhiva.zip/Plan.doc',
    ]);
    expect(selection.setAside).toEqual([]);
    expect(selection.systemFiles).toEqual([
      'Dosar SSM/~$cizie numire.docx',
      'Dosar SSM/PSI/~$structiuni.doc',
      'arhiva.zip/~$Plan.doc',
    ]);
  });

  it('keeps a folder whole, groups loose photographs and lists loose documents on their own', async () => {
    const selection = await addToSelection(emptySelection, [
      { path: 'Acte PSI/Registru.pdf', blob: blob() },
      { path: 'Acte PSI/2021/Decizie.PDF', blob: blob() },
      { path: 'Contract 2019.pdf', blob: blob() },
      { path: 'IMG_2041.HEIC', blob: blob() },
      { path: 'IMG_2042.jpg', blob: blob() },
    ]);

    expect(selectionRows(selection.files)).toMatchObject([
      { kind: 'folder', group: 'Acte PSI', zip: false, files: [{}, {}] },
      { kind: 'file', group: 'Contract 2019.pdf' },
      { kind: 'photos', files: [{ mimeType: 'image/heic' }, { mimeType: 'image/jpeg' }] },
    ]);
    expect(removeGroup(selection, 'Acte PSI').files.map((file) => file.path)).toEqual([
      'Contract 2019.pdf',
      'IMG_2041.HEIC',
      'IMG_2042.jpg',
    ]);
  });

  it('refuses archives it cannot open, sets aside empty and oversized files, and numbers a second copy', async () => {
    const first = await addToSelection(emptySelection, [
      { path: 'acte-psi-2021.rar', blob: blob() },
      { path: 'gol.pdf', blob: new Blob([]) },
      { path: 'mare.pdf', blob: new Blob([new Uint8Array(20 * 1024 * 1024 + 1)]) },
      { path: 'Decizie.docx', blob: blob() },
      { path: 'stricat.zip', blob: blob('not a zip') },
    ]);
    const second = await addToSelection(first, [{ path: 'Decizie.docx', blob: blob('y') }]);

    expect(second.archives).toEqual(['acte-psi-2021.rar']);
    expect(second.brokenZips).toEqual(['stricat.zip']);
    expect(second.setAside.map((file) => [file.path, file.reason])).toEqual([
      ['gol.pdf', 'empty'],
      ['mare.pdf', 'too_large'],
    ]);
    expect(second.files.map((file) => file.path)).toEqual(['Decizie.docx', 'Decizie (2).docx']);
    expect(selectionRows(second.files)).toMatchObject([
      { kind: 'file', group: 'Decizie.docx' },
      { kind: 'file', group: 'Decizie (2).docx' },
    ]);
    expect(removeGroup(second, 'Decizie (2).docx').files.map((file) => file.path)).toEqual([
      'Decizie.docx',
    ]);
  });

  it('stops opening a zip that holds more than one import takes', async () => {
    const selection = await addToSelection(emptySelection, [
      {
        path: 'prea-multe.zip',
        blob: zip(
          Object.fromEntries(Array.from({ length: 151 }, (_, index) => [`f${index}.pdf`, 'x']))
        ),
      },
      {
        path: 'prea-grea.zip',
        blob: zip(
          Object.fromEntries(
            Array.from({ length: 6 }, (_, index) => [`f${index}.pdf`, megabytes(18)])
          )
        ),
      },
      { path: 'Decizie.docx', blob: blob() },
    ]);

    expect(selection.largeZips).toEqual(['prea-multe.zip', 'prea-grea.zip']);
    expect(selection.brokenZips).toEqual([]);
    expect(selection.files.map((file) => file.path)).toEqual(['Decizie.docx']);
  });

  it('opens a zip inside a zip, but refuses one nested too deep and archives it cannot open', async () => {
    const innerMost = await zipBytes(zip({ 'adanc.pdf': 'x' }));
    const third = await zipBytes(zip({ 'nivel4.zip': innerMost, 'nivel3.pdf': 'x' }));
    const second = await zipBytes(
      zip({ 'nivel3.zip': third, 'mare.bin': megabytes(21), 'nivel2.pdf': 'x' })
    );
    const selection = await addToSelection(emptySelection, [
      { path: 'dosar.zip', blob: zip({ 'nivel2.zip': second, 'acte vechi.rar': 'x' }) },
    ]);

    expect(selection.files.map((file) => [file.path, file.group])).toEqual([
      ['dosar.zip/nivel2.zip/nivel2.pdf', 'dosar.zip'],
      ['dosar.zip/nivel2.zip/nivel3.zip/nivel3.pdf', 'dosar.zip'],
    ]);
    expect(selection.archives).toEqual(['acte vechi.rar', 'nivel4.zip']);
    expect(selection.setAside.map((file) => [file.name, file.reason])).toEqual([
      ['mare.bin', 'unsupported'],
    ]);
  });

  it('reads Romanian names from zips made on macOS and on Windows', async () => {
    const finder = await zipBytes(zip({ 'Fxxxxx.pdf': 'a', 'Bxxxxx/Decizie.pdf': 'b' }));
    const windows = await zipBytes(zip({ 'Fyyy.pdf': 'c', 'îngrijitor.pdf': 'd' }));
    const selection = await addToSelection(emptySelection, [
      {
        path: 'mac.zip',
        blob: new Blob([
          rename(rename(finder, 'Fxxxxx.pdf', 'Fișă.pdf'), 'Bxxxxx/', 'Brută/') as BlobPart,
        ]),
      },
      {
        path: 'windows.zip',
        blob: new Blob([rename(windows, 'Fyyy.pdf', [0x46, 0x69, 0xad, 0xc7]) as BlobPart]),
      },
    ]);

    expect(selection.files.map((file) => file.path)).toEqual([
      'mac.zip/Fișă.pdf',
      'mac.zip/Brută/Decizie.pdf',
      'windows.zip/Fișă.pdf',
      'windows.zip/îngrijitor.pdf',
    ]);
  });

  it('never lets a path climb out of the upload', () => {
    expect(cleanPath('../../etc/passwd.pdf')).toBeNull();
    expect(cleanPath('dosar.zip/./a\\b.pdf')).toBe('dosar.zip/a/b.pdf');
    expect(cleanPath('/Acte//x.pdf')).toBe('Acte/x.pdf');
  });

  it('counts against the caps of 150 files and 100 MB', async () => {
    const many = await addToSelection(
      emptySelection,
      Array.from({ length: 151 }, (_, index) => ({ path: `f${index}.pdf`, blob: blob() }))
    );
    expect(selectionTotals(many)).toMatchObject({ count: 151, overFiles: true, overBytes: false });

    const heavy = await addToSelection(
      emptySelection,
      Array.from({ length: 6 }, (_, index) => ({
        path: `f${index}.pdf`,
        blob: new Blob([new Uint8Array(18 * 1024 * 1024)]),
      }))
    );
    expect(selectionTotals(heavy)).toMatchObject({ count: 6, overFiles: false, overBytes: true });
  });
});

describe('choosing the photographs of an employee import', () => {
  it('takes photographs and PDFs only, a PDF or HEIC under 25 MB', async () => {
    const selection = await addToSelection(
      emptySelection,
      [
        { path: 'IMG_3101.HEIC', blob: blob() },
        { path: 'IMG_3102.jpg', blob: blob() },
        { path: 'contract munca Toma.docx', blob: blob() },
        { path: 'dosar personal Badea.pdf', blob: new Blob([megabytes(26)]) },
        { path: 'scan_016.pdf', blob: blob() },
        { path: 'IMG_3103.HEIC', blob: new Blob([megabytes(26)]) },
      ],
      'employees'
    );
    expect(selection.files.map((file) => file.path)).toEqual([
      'IMG_3101.HEIC',
      'IMG_3102.jpg',
      'scan_016.pdf',
    ]);
    expect(selection.setAside.map((file) => [file.path, file.reason])).toEqual([
      ['contract munca Toma.docx', 'unsupported'],
      ['dosar personal Badea.pdf', 'too_large'],
      ['IMG_3103.HEIC', 'too_large'],
    ]);
  });

  it('weighs a JPEG or PNG once shrunk, so a large one is not set aside', async () => {
    const large = [
      { path: 'IMG_4001.jpg', blob: new Blob([megabytes(30)]) },
      { path: 'scan.png', blob: new Blob([megabytes(30)]) },
    ];
    const employees = await addToSelection(
      emptySelection,
      [...large, { path: 'fise.zip', blob: zip({ 'IMG_4002.jpg': megabytes(30) }) }],
      'employees'
    );
    expect(employees.files.map((file) => file.path)).toEqual([
      'IMG_4001.jpg',
      'scan.png',
      'fise.zip/IMG_4002.jpg',
    ]);
    expect(employees.setAside).toEqual([]);

    const client = await addToSelection(emptySelection, large);
    expect(client.setAside.map((file) => file.reason)).toEqual(['too_large', 'too_large']);
  });

  it('counts each photograph it will shrink at about a megabyte against the 1 GB', async () => {
    const photos = await addToSelection(
      emptySelection,
      Array.from({ length: 250 }, (_, index) => ({
        path: `IMG_${index}.jpg`,
        blob: new Blob([megabytes(5)]),
      })),
      'employees'
    );
    expect(selectionTotals(photos, 'employees')).toMatchObject({
      count: 250,
      bytes: 250 * 1024 * 1024,
      estimated: true,
      overBytes: false,
    });
    expect(selectionTotals(photos)).toMatchObject({ bytes: 250 * 5 * 1024 * 1024 });

    const small = await addToSelection(
      emptySelection,
      [{ path: 'IMG_1.jpg', blob: blob() }],
      'employees'
    );
    expect(selectionTotals(small, 'employees')).toMatchObject({ bytes: 1, estimated: false });
  });

  it("counts a PDF's pages against the 500 photographs and pages", async () => {
    const pdf = `%PDF-1.4 ${'<< /Type /Page /Parent 2 0 R >> '.repeat(3)}<< /Type /Pages /Kids [] /Count 3 >>`;
    const selection = await addToSelection(
      emptySelection,
      [
        { path: 'fise.pdf', blob: blob(pdf) },
        ...Array.from({ length: 498 }, (_, index) => ({ path: `IMG_${index}.jpg`, blob: blob() })),
      ],
      'employees'
    );
    expect(selection.files[0]!.pages).toBe(3);
    expect(selectionTotals(selection, 'employees')).toMatchObject({
      count: 499,
      pages: 501,
      overFiles: true,
    });
    expect(
      selectionTotals(selection, 'employees', { count: 0, pages: 0, bytes: 2 * 1024 ** 3 })
    ).toMatchObject({ overBytes: true });
  });
});
