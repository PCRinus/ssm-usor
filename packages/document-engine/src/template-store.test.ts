import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { manifestEntries } from './template-store';

const root = mkdtempSync(join(tmpdir(), 'template-store-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const resolved = { act: 'oug-195-2002', consolidatedOn: '2026-11-06' };
const manifest = (folder: string, templates: object[]) => {
  mkdirSync(join(root, folder), { recursive: true });
  writeFileSync(join(root, folder, 'manifest.json'), JSON.stringify({ templates }));
};
manifest('', [
  {
    typeKey: 'decision_training',
    title: 'Decizia',
    file: '1.1_decision_training.docx',
    change: { kind: 'legal', note: 'Art. 36.', resolves: resolved },
  },
]);
manifest('fire', [
  {
    typeKey: 'fire_copy',
    title: 'Copia',
    file: 'copy.docx',
    change: { kind: 'legal', note: 'Art. 36.', resolves: [resolved, resolved] },
  },
]);
manifest('other', [
  {
    typeKey: 'service_contract',
    title: 'Contract',
    file: 'service_contract.docx',
    change: { kind: 'correction', note: 'Prima versiune.' },
  },
]);

describe('the entries of the manifests', () => {
  const entries = manifestEntries(pathToFileURL(`${root}/`));

  it('name each set and the path of each file in the templates folder', () => {
    expect(entries.map(({ set, file, path }) => [set, file, path])).toEqual([
      ['ssm', '1.1_decision_training.docx', '1.1_decision_training.docx'],
      ['fire', 'copy.docx', 'fire/copy.docx'],
      ['other', 'service_contract.docx', 'other/service_contract.docx'],
    ]);
  });

  it('list the changes resolved, whether the manifest names one or several', () => {
    expect(entries.map((entry) => entry.change)).toEqual([
      { kind: 'legal', note: 'Art. 36.', resolves: [resolved] },
      { kind: 'legal', note: 'Art. 36.', resolves: [resolved, resolved] },
      { kind: 'correction', note: 'Prima versiune.' },
    ]);
  });
});
