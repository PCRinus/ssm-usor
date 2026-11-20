import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { signingTypeKeys } from '../signing';
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

  it('gives every signer of the set the space: the decisions, the covers and the blocks of 6, 10, 11, 12', () => {
    const signers = Object.fromEntries(
      setFiles.map((name) => [
        name,
        paragraphsOf(bodyOf(name)).filter((paragraph) => documentTextOf(paragraph) === label)
          .length,
      ])
    );
    expect(Object.entries(signers).filter(([, count]) => count > 0)).toEqual(
      setFiles
        .filter((name) => /_decision_|_cover_|^(6|10|11|12)_/.test(name))
        .map((name) => [name, decisionFiles.includes(name) ? 1 : 2])
    );
  });

  // A form signs in a row of its own: the row keeps the same 25 mm as its least height.
  it.each([
    ['8_control_report.docx', /^Semnătura celui care a întocmit referatul/, 1],
    ['9_risk_assessment.docx', /^[12]\.(Întocmit|Aprobat)\{\{/, 2],
  ] as const)('%s leaves 25 mm in the rows where a person signs', (name, starts, count) => {
    const rows = rowsOf(bodyOf(name)).filter((row) => starts.test(documentTextOf(row)));
    expect(rows).toHaveLength(count);
    for (const row of rows) expect(row).toContain('<w:trHeight w:val="1417" w:hRule="atLeast"/>');
  });
});

describe("the decisions' page numbers and running header", () => {
  it.each(decisionFiles)('%s numbers every page and names itself from the second', (name) => {
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
    expect(documentTextOf(target('first'))).toBe('');
    const header = target('default');
    expect(documentTextOf(header)).toBe(
      'Decizia nr. {{decisionNumber}} SSM din {{issueDate}} · {{client.legalName}}Pag. 1 din 1'
    );
    expect(header).toContain('<w:bottom w:val="single" w:sz="4" w:space="0" w:color="555555"/>');
    expect(header).toContain('<w:tblInd w:w="0" w:type="dxa"/>');
    const footers = Object.keys(zip.files).filter((part) => /^word\/footer\d*\.xml$/.test(part));
    expect(footers.length).toBeGreaterThan(0);
    for (const part of [...footers, 'header']) {
      const xml = part === 'header' ? header : zip.file(part)!.asText();
      const codes = [...xml.matchAll(/<w:instrText[^>]*>([^<]*)<\/w:instrText>/g)].map((match) =>
        match[1]!.trim()
      );
      expect(codes, part).toEqual(['PAGE', 'NUMPAGES']);
    }
    for (const part of footers) {
      const first = paragraphsOf(zip.file(part)!.asText())[0]!;
      expect(documentTextOf(first)).toBe('Pag. 1 din 1');
      expect(first).toContain('<w:jc w:val="right"/>');
    }
  });
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
