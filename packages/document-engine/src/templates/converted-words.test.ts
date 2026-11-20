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

const documents = converter
  ? [
      ...previewDocuments(templatesUrl).map(({ name, label, docx }) => ({
        document: `${name} (${label})`,
        docx,
      })),
      { document: 'annex', docx: renderAnnex('ssm', ssmAnnexSample, ssmAnnexData) },
      { document: 'fire annex', docx: renderAnnex('su', suAnnexSample, suAnnexData) },
      {
        document: 'own instructions with annexes',
        docx: appendAnnexes(read('3.2_own_instructions.docx'), [
          renderAnnex('ssm', ssmAnnexSample, ssmAnnexData),
        ]),
      },
    ]
  : [];

describe.skipIf(!converter)('the converter', () => {
  it('is caught leaving out a table', async () => {
    const docx = documents.find(({ document }) => document.startsWith('1.1_'))!.docx;
    const zip = new PizZip(docx);
    zip.file(
      'word/document.xml',
      zip
        .file('word/document.xml')!
        .asText()
        .replace(/<w:tbl>[\s\S]*?<\/w:tbl>/, '')
    );
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
