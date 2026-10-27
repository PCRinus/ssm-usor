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

const zip = (entries: Record<string, string>) =>
  new Blob([
    zipSync(
      Object.fromEntries(Object.entries(entries).map(([name, text]) => [name, strToU8(text)]))
    ) as BlobPart,
  ]);

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
