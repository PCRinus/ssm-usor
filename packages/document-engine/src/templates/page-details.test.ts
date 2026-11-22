import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { bodyOf, documentTextOf, read } from './read';

const paragraphs = (xml: string) => xml.match(/<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/g) ?? [];
const part = (name: string, path: string) => new PizZip(read(name)).file(path)!.asText();
const covers = [
  '1.0_cover_decisions.docx',
  '2.0_cover_general_training_material.docx',
  '3.0_cover_own_instructions.docx',
  '4.0_cover_training_themes.docx',
  '5.0_cover_tests.docx',
  '7.0_cover_event_registers.docx',
  '11.0_cover_employer_briefing.docx',
];

describe('the details of the occupational safety set’s pages', () => {
  it.each(covers)(
    '%s links its client with „pentru” alone, and hangs its items from a tab',
    (name) => {
      const texts = paragraphs(bodyOf(name)).map(documentTextOf);
      expect(texts).toContain('pentru');
      expect(texts.filter((text) => /^\d\. /.test(text))).toEqual([]);
    }
  );

  it.each(['2.2_general_training_material.docx'])(
    '%s keeps „introductiv-generală” whole in the header box',
    (name) => {
      for (const header of ['word/header1.xml', 'word/header2.xml', 'word/header3.xml']) {
        expect(part(name, header)).toContain('introductiv</w:t><w:noBreakHyphen/><w:t>generală');
      }
    }
  );

  it.each([
    '2.2_general_training_material.docx',
    '3.2_own_instructions.docx',
    '9_risk_assessment.docx',
    '11.1_employer_briefing.docx',
  ])('%s keeps a contents entry’s words clear of its page number', (name) => {
    for (const level of [1, 2]) {
      const style = part(name, 'word/styles.xml').match(
        new RegExp(`<w:style\\b[^>]*w:styleId="TOC${level}"[\\s\\S]*?</w:style>`)
      )![0];
      expect(style).toMatch(/<w:ind\b[^>]*w:right="567"/);
    }
  });

  it('gives every row of the four registers one height', () => {
    const tables = bodyOf('7.2_event_registers.docx').match(/<w:tbl>[\s\S]*?<\/w:tbl>/g)!;
    expect(tables).toHaveLength(4);
    for (const table of tables) {
      const rows = (table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? []).filter((row) =>
        /<w:t>\d+\.<\/w:t>/.test(row)
      );
      expect(new Set(rows.map((row) => /<w:trHeight w:val="(\d+)"/.exec(row)?.[1]))).toEqual(
        new Set(['616'])
      );
    }
  });

  it.each([
    '1.1_decision_training.docx',
    '1.2_decision_risk_evaluation_team.docx',
    '1.3_decision_first_aid.docx',
    '1.4_decision_imminent_danger.docx',
    '1.5_decision_workers_representative.docx',
    '5.1_test_hiring.docx',
  ])('%s gives each hand signature a row of at least 15 mm', (name) => {
    const tables = bodyOf(name).match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
    const signed = tables.flatMap((table) => {
      const rows = table.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) ?? [];
      if (
        rows.some((row) => row.includes('<w:tblHeader/>') && row.includes('Semnătura de primire'))
      ) {
        return rows.filter((row) => !row.includes('<w:tblHeader/>'));
      }
      return rows.filter((row) => row.includes('Semnătura persoanei testate'));
    });
    expect(signed.length).toBeGreaterThan(0);
    for (const row of signed) {
      expect(Number(/<w:trHeight w:val="(\d+)"/.exec(row)?.[1])).toBeGreaterThanOrEqual(850);
    }
  });

  it('names the control report over its form', () => {
    expect(documentTextOf(paragraphs(bodyOf('8_control_report.docx'))[0]!)).toBe(
      'REFERAT DE CONTROL'
    );
  });

  it('prints 100 % in the total of the risk assessment’s shares', () => {
    const body = bodyOf('9_risk_assessment.docx');
    const total = body.slice(
      body.indexOf('{{factorCount}}'),
      body.indexOf('</w:tr>', body.indexOf('{{factorCount}}'))
    );
    expect(total).toContain('100,00 %');
  });

  it('explains the marks of the control schedule under it', () => {
    const body = bodyOf('12_control_regulation.docx');
    const after = body.slice(body.indexOf('</w:tbl>', body.indexOf('Tabel 1.')));
    expect(documentTextOf(paragraphs(after)[0]!)).toMatch(/^Legendă: „x” – /);
  });
});
