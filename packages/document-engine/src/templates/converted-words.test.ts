import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import {
  ssmAnnexData,
  ssmAnnexSample,
  suAnnexData,
  suAnnexSample,
} from '../../tools/annex-samples';
import { previewDocuments } from '../../tools/preview-samples';
import { appendAnnexes, renderAnnex } from '../annex';
import { templatesUrl } from '../template-store';
import { convert, converter } from '../test/converter';
import { wordsMissingFromPdf } from '../test/pdf-words';
import { read } from './read';

const preview = previewDocuments(templatesUrl);
const documents = [
  ...preview.documents.map(({ name, label, docx }) => ({ document: `${name} (${label})`, docx })),
  { document: 'annex', docx: renderAnnex('ssm', ssmAnnexSample, ssmAnnexData) },
  { document: 'fire annex', docx: renderAnnex('su', suAnnexSample, suAnnexData) },
  {
    document: 'own instructions with annexes',
    docx: appendAnnexes(read('3.1_own_instructions.docx'), [
      renderAnnex('ssm', ssmAnnexSample, ssmAnnexData),
    ]),
  },
];

// The first table of the body, the tables nested in its cells included.
function withoutFirstTable(xml: string) {
  const start = xml.indexOf('<w:tbl>');
  let depth = 0;
  for (const tag of xml.slice(start).matchAll(/<w:tbl>|<\/w:tbl>/g)) {
    depth += tag[0] === '<w:tbl>' ? 1 : -1;
    if (depth === 0) return xml.slice(0, start) + xml.slice(start + tag.index + tag[0].length);
  }
  throw new Error('A table that never closes.');
}

it('merges every sample of every template, so the converter checks them all', () => {
  expect(preview.skipped).toEqual([]);
});

describe.skipIf(!converter)('the converter', () => {
  it('is caught leaving out a table', async () => {
    const docx = documents.find(({ document }) => document.startsWith('1.1_'))!.docx;
    const zip = new PizZip(docx);
    zip.file('word/document.xml', withoutFirstTable(zip.file('word/document.xml')!.asText()));
    const withoutTable = await convert(zip.generate({ type: 'uint8array' }));
    expect(await wordsMissingFromPdf(docx, withoutTable)).toContainEqual({
      word: 'semnătura',
      missing: 1,
    });
  }, 60_000);

  it.each(documents)(
    'prints every word of $document',
    async ({ docx }) => {
      expect(await wordsMissingFromPdf(docx, await convert(docx))).toEqual([]);
    },
    60_000
  );
});
