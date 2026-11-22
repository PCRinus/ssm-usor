import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  type PatchInput,
  PendingChangeError,
  replaceLegalQuote,
} from '@ssm-usor/document-engine/legal-quote';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { quoteToolAt, templatesAt } from './workspace';

vi.mock('@ssm-usor/document-engine/legal-quote', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ssm-usor/document-engine/legal-quote')>()),
  replaceLegalQuote: vi.fn(),
  releasedManifestAt: vi.fn(() => () => null),
}));

const input: PatchInput = {
  citation: {
    file: '2.1_general_training_material.docx',
    paragraph: 2048,
    act: 'oug-195-2002',
    locator: 'Art. 36 alin. (2)',
    text: 'Motocicliștii poartă casca.',
  },
  changes: [{ old: 'casca', new: 'pe cap cască', unit: 'Art. 36 alin. (2)' }],
};
const tool = quoteToolAt(new URL('file:///templates/'));
const failing = (error: unknown) =>
  vi.mocked(replaceLegalQuote).mockImplementation(() => {
    throw error;
  });

beforeEach(() => {
  vi.mocked(replaceLegalQuote).mockReset();
});

describe('the quote tool of the scheduled fix', () => {
  it('returns what the engine applied', () => {
    const result = { status: 'nothing-to-apply' as const, notes: [], markdown: '' };
    vi.mocked(replaceLegalQuote).mockReturnValue(result);

    expect(tool(input)).toBe(result);
  });

  it('keeps a pending-change conflict one, its message clipped to 1,000 characters', () => {
    failing(new PendingChangeError(`the change joined to the pending one: ${'x'.repeat(2_000)}`));

    let thrown: unknown;
    try {
      tool(input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PendingChangeError);
    expect((thrown as Error).message).toHaveLength(1_000);
    expect((thrown as Error).message).toMatch(/^the change joined to the pending one: x+$/);
  });

  it('names the template on any other failure, its message clipped to 1,000 characters', () => {
    failing(new Error('y'.repeat(2_000)));

    let thrown: unknown;
    try {
      tool(input);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).not.toBeInstanceOf(PendingChangeError);
    expect((thrown as Error).message).toBe(
      `replace-quote failed on 2.1_general_training_material.docx: ${'y'.repeat(1_000)}`
    );
  });
});

describe('the templates of the scheduled fix', () => {
  const root = mkdtempSync(join(tmpdir(), 'legislation-fix-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ['', 'fire', 'other']) {
    mkdirSync(join(root, folder), { recursive: true });
    writeFileSync(join(root, folder, 'manifest.json'), '{ "templates": [] }');
  }
  writeFileSync(
    join(root, 'fire/manifest.json'),
    JSON.stringify({ templates: [{ typeKey: 'fire_copy', title: 'Copia', file: 'copy.docx' }] })
  );

  it('name the entry that has no change when asked what an entry resolves', () => {
    expect(() =>
      templatesAt(pathToFileURL(`${root}/`)).resolves('oug-195-2002', '2026-11-06')
    ).toThrow('fire/copy.docx has no change in its manifest entry.');
  });
});
