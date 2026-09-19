import { readFileSync } from 'node:fs';

import { documentTypeKeys } from '@ssm-usor/contracts';
import { documentText, renderDocument } from '@ssm-usor/document-engine';
import { describe, expect, it } from 'vitest';

import { buildDocumentContext, documentData } from '../../src/modules/documents/context';
import { facts } from '../../src/modules/documents/context.fixture';

// Lives with the scripts because it reads the repository's files, which the Worker's own
// code cannot: the templates, merged with the context the API builds.

const templatesUrl = new URL('../../../../packages/document-engine/templates/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', templatesUrl), 'utf8')) as {
  templates: { typeKey: string; file: string; contentPending?: boolean }[];
};

describe('the built-in templates', () => {
  const ready = manifest.templates.filter((entry) => !entry.contentPending);

  it('are the document types of the contracts, in the same order', () => {
    expect(ready.map((entry) => entry.typeKey)).toEqual([...documentTypeKeys]);
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
