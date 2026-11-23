import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { previewDocuments } from '../../tools/preview-samples';
import { signingTypeKeys } from '../signing';
import { templatesUrl } from '../template-store';
import { convert, converter } from '../test/converter';
import { bodyOf, decisionFiles, documentTextOf, entries, read } from './read';

// tools/import/signatures.py and tools/import/decision_pages.py say why.
const ssmFiles = entries
  .filter((entry) => entry.set === 'ssm' && entry.typeKey !== signingTypeKeys.agreement)
  .map((entry) => entry.path);
// The sheets name their trainee in a cell, and the signing annex (ADR 023) is not one of the set's
// documents.
const setFiles = entries
  .filter(
    (entry) =>
      entry.set === 'ssm' && !entry.perEmployee && entry.typeKey !== signingTypeKeys.regulationAnnex
  )
  .map((entry) => entry.path);
const label = 'semnătura și ștampila';
const paragraphsOf = (xml: string) => xml.match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g) ?? [];
const rowsOf = (xml: string) => xml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? [];
const signer = /^\{\{[\w.]+\.(representativeName|name)\}\}$/;

describe('one signing space for every signature of the occupational safety set', () => {
  it.each(setFiles)('%s leaves 25 mm, labelled, above every name that signs', (name) => {
    // A hand-over block's cells count their padding towards the space.
    const blocks = (bodyOf(name).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? []).map((table) => ({
      xml: table,
      padding: [
        ...(/<w:tblCellMar>[\s\S]*?<\/w:tblCellMar>/.exec(table)?.[0] ?? '').matchAll(
          /<w:(?:top|bottom) w:w="(\d+)"/g
        ),
      ].reduce((sum, match) => sum + Number(match[1]), 0),
    }));
    const outside = blocks.reduce((xml, block) => xml.replace(block.xml, ''), bodyOf(name));
    for (const { xml, padding } of [...blocks, { xml: outside, padding: 0 }]) {
      const paragraphs = paragraphsOf(xml);
      for (const [at, paragraph] of paragraphs.entries()) {
        if (!signer.test(documentTextOf(paragraph))) continue;
        const above = paragraphs[at - 1]!;
        expect(documentTextOf(above), name).toBe(label);
        // 25 mm, 1417 twips, of which the label's own line takes 184.
        expect(Number(/<w:spacing [^>]*w:before="(\d+)"/.exec(above)![1]) + padding).toBe(1233);
        expect(above).toMatch(/<w:keepNext w:val="true"\/>/);
        expect(above).toContain('<w:color w:val="8A8A8A"/>');
        expect(above).toContain('<w:sz w:val="16"/>');
      }
    }
  });

  it.each(setFiles)('%s lines up the two signers of a hand-over block', (name) => {
    for (const row of rowsOf(bodyOf(name))) {
      const labels = paragraphsOf(row).filter((paragraph) => documentTextOf(paragraph) === label);
      if (labels.length > 0) expect(labels).toHaveLength(2);
    }
  });

  it('gives every signer of the set the space: the decisions, the covers and the blocks of 6, 9.2, 10, 11.1, 12', () => {
    const signers = Object.fromEntries(
      setFiles.map((name) => [
        name,
        paragraphsOf(bodyOf(name)).filter((paragraph) => documentTextOf(paragraph) === label)
          .length,
      ])
    );
    expect(Object.entries(signers).filter(([, count]) => count > 0)).toEqual(
      setFiles
        .filter((name) => /_decision_|_cover_|^(6|9\.2|10|11\.1|12)_/.test(name))
        .map((name) => [name, decisionFiles.includes(name) ? 1 : 2])
    );
  });

  // A form signs in a row of its own: the row keeps the same 25 mm as its least height.
  it.each([
    ['8_control_report.docx', /^Semnătura celui care a întocmit referatul/, 1],
    ['9.1_risk_assessment.docx', /^[12]\.(Întocmit|Aprobat)\{\{/, 2],
  ] as const)('%s leaves 25 mm in the rows where a person signs', (name, starts, count) => {
    const rows = rowsOf(bodyOf(name)).filter((row) => starts.test(documentTextOf(row)));
    expect(rows).toHaveLength(count);
    for (const row of rows) expect(row).toContain('<w:trHeight w:val="1417" w:hRule="atLeast"/>');
  });
});

const mergedDecisions = previewDocuments(templatesUrl)
  .documents.filter(({ name }) => decisionFiles.includes(name))
  .map(({ name, label: sample, docx }) => ({ decision: `${name} (${sample})`, docx }));
const wordsOf = (text: string) => text.toLowerCase().match(/\p{L}+|\p{N}+/gu) ?? [];

// The line a decision signs under, once merged: a loop's tags are gone by then.
function signedLine(docx: Uint8Array) {
  const paragraphs = paragraphsOf(new PizZip(docx).file('word/document.xml')!.asText());
  const at = paragraphs.findIndex((paragraph) => documentTextOf(paragraph) === label);
  return { kept: paragraphs.slice(at - 3, at), line: documentTextOf(paragraphs[at - 3]!) };
}

async function pageTexts(pdf: Uint8Array) {
  const loading = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const document = await loading.promise;
  const pages: string[] = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const content = await (await document.getPage(number)).getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? `${item.str} ` : '')).join(''));
    }
  } finally {
    await loading.destroy();
  }
  return pages;
}

describe('a decision is never signed on a page of its own', () => {
  it.each(mergedDecisions)('$decision keeps its last line with the signature', ({ docx }) => {
    const { kept, line } = signedLine(docx);
    expect(line).not.toMatch(/\{\{/);
    for (const paragraph of kept) expect(paragraph).toContain('<w:keepNext w:val="true"/>');
  });

  it.skipIf(!converter).each(mergedDecisions)(
    '$decision prints its last line on the page it is signed on',
    async ({ docx }) => {
      const pages = (await pageTexts(await convert(docx))).map(wordsOf);
      const signed = pages.find((words) => words.join(' ').includes('semnătura și ștampila'))!;
      const ending = wordsOf(signedLine(docx).line).slice(-4).join(' ');
      expect(signed.join(' ')).toContain(ending);
    },
    60_000
  );
});

describe("the decisions' page numbers and running header", () => {
  it.each(decisionFiles)(
    '%s numbers every page in its top corner and names itself from the second',
    (name) => {
      const zip = new PizZip(read(name));
      const section = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(bodyOf(name))![0];
      expect(section).toContain('<w:titlePg/>');
      const relationships = zip.file('word/_rels/document.xml.rels')!.asText();
      const target = (type: string) => {
        const id = new RegExp(`<w:headerReference w:type="${type}" r:id="([^"]+)"/>`).exec(
          section
        )![1];
        const file = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(relationships)![1];
        return zip.file(`word/${file}`)!.asText();
      };
      const first = target('first');
      const running = target('default');
      expect(documentTextOf(first)).toBe('Pag. 1 din 1');
      expect(documentTextOf(running)).toBe(
        'Decizia nr. {{decisionNumber}} SSM din {{issueDate}} · {{client.legalName}}Pag. 1 din 1'
      );
      const pageCell = (xml: string) => (xml.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? []).at(-1)!;
      expect(pageCell(first)).toBe(pageCell(running));
      expect(first.replace(/<w:tc>[\s\S]*?<\/w:tc>/g, '')).toBe(
        running
          .replace(/<w:tc>[\s\S]*?<\/w:tc>/g, '')
          .replace(/<w:tblBorders>[\s\S]*?<\/w:tblBorders>/, '')
      );
      expect(running).toContain('<w:bottom w:val="single" w:sz="4" w:space="0" w:color="555555"/>');
      expect(running).toContain('<w:tblInd w:w="0" w:type="dxa"/>');
      for (const xml of [first, running]) {
        const codes = [...xml.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((match) =>
          match[1]!.trim()
        );
        expect(codes).toEqual(['PAGE', 'NUMPAGES']);
      }
      for (const part of Object.keys(zip.files).filter((file) =>
        /^word\/footer\d*\.xml$/.test(file)
      )) {
        expect(zip.file(part)!.asText()).not.toContain('<w:instrText');
      }
    }
  );
});

describe('Romanian quotation marks', () => {
  it.each(ssmFiles)('%s quotes with „…” and writes „și/sau”', (name) => {
    const zip = new PizZip(read(name));
    for (const part of Object.keys(zip.files).filter((file) =>
      /^word\/(document|header\d*|footer\d*)\.xml$/.test(file)
    )) {
      const text = paragraphsOf(zip.file(part)!.asText()).map(documentTextOf).join('\n');
      expect(text, part).not.toMatch(/[«»“]/);
      expect(text, part).not.toMatch(/(?<!\p{L})(și|si)\/\s+sau/iu);
    }
  });
});
