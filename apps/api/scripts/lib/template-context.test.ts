import { readFileSync } from 'node:fs';

import { documentTypeKeys, packDocumentTypeKeys, uploadedDocumentTypes } from '@ssm-usor/contracts';
import { documentText, renderDocument } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import { buildDocumentContext, documentData } from '../../src/modules/documents/context';
import { facts } from '../../src/modules/documents/context.fixture';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the templates, merged with the context the API builds.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
  templates: { typeKey: string; title: string; file: string; contentPending?: boolean }[];
};

describe('the built-in templates', () => {
  const ready = manifest.templates.filter((entry) => !entry.contentPending);

  it('are the document types of the contracts, in the same order', () => {
    expect(ready.map((entry) => entry.typeKey)).toEqual([...documentTypeKeys]);
  });

  it('leave the rest of the pack to be uploaded, under the titles the templates will carry', () => {
    expect(manifest.templates.map((entry) => entry.typeKey)).toEqual([...packDocumentTypeKeys]);
    const pending = manifest.templates.filter((entry) => entry.contentPending);
    expect(Object.fromEntries(pending.map((entry) => [entry.typeKey, entry.title]))).toEqual(
      uploadedDocumentTypes
    );
  });

  // The engine throws on a placeholder without a value, so this proves the context covers
  // everything the templates ask for.
  it.each(ready.map((entry) => [entry.typeKey, entry.file] as const))(
    '%s renders from the context with nothing missing',
    (typeKey, file) => {
      const context = buildDocumentContext(facts);
      const output = renderDocument(
        readFileSync(new URL(file, templatesUrl)),
        documentData(context, typeKey as (typeof documentTypeKeys)[number])
      );
      const text = documentText(output);
      expect(text).not.toContain('{{');
      expect(text).toContain('PIPETECH');
      if (typeKey !== 'event_registers' && !typeKey.startsWith('cover_')) {
        expect(text).toContain('Document generat cu SSM Ușor');
      }
    },
    30_000
  );
});

describe('the training themes', () => {
  it('print a block per position, with its trainer, its modules and a row per session', () => {
    const entry = manifest.templates.find((template) => template.typeKey === 'training_themes')!;
    const text = documentText(
      renderDocument(
        readFileSync(new URL(entry.file, templatesUrl)),
        documentData(buildDocumentContext(facts), 'training_themes')
      )
    );
    expect(text).toContain('Florin Cristian TALOȘ – conducător loc de muncă');
    expect(text).toContain('S.C. SERVICIU EXTERN DEMO S.R.L. – Dan MARIN');
    expect(text).toContain(
      'IPSSM Art. 1 – 294; I.P.S.S.M. Activități de birou, Art. 1 – 12; I.P.S.S.M. Sudură oxiacetilenică, Art. 1 – 31;'
    );
    expect(text).toContain('I.P.S.S.M. Activități de birou; I.P.S.S.M. Sudură oxiacetilenică');
    expect(text.match(/Testare\.$/gm)).toHaveLength(2);
    expect(text).toContain('I.P.S.S.M. Art. 241 – 294;');
  }, 30_000);
});
