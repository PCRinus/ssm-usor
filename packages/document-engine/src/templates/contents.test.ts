import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { setSamples } from '../../tools/set-samples';
import { textWidth } from '../content-widths';
import { renderDocument } from '../render';
import { fillTableOfContents } from '../toc';
import { documentTextOf, read } from './read';

const partOf = (bytes: Uint8Array, part: string) => new PizZip(bytes).file(part)!.asText();
const styleOf = (styles: string, id: string) =>
  new RegExp(`<w:style\\b[^>]*w:styleId="${id}"[^>]*>[\\s\\S]*?</w:style>`).exec(styles)![0];
const entriesOf = (document: string) =>
  /<w:sdtContent>([\s\S]*?)<\/w:sdtContent>/.exec(document)![1]!.match(/<w:p>[\s\S]*?<\/w:p>/g)!;
const runsOf = (xml: string) => xml.match(/<w:r>[\s\S]*?<\/w:r>/g) ?? [];
const label = /^((?:sub)?capitolul [IVXLC]+\.(?:[IVXLC]+\.)?|anexa(?: nr\.)? \d+\.)$/i;

describe.each([
  '2.2_general_training_material.docx',
  '3.2_own_instructions.docx',
  '9_risk_assessment.docx',
  '11.1_employer_briefing.docx',
])('the contents of %s', (name) => {
  const styles = partOf(read(name), 'word/styles.xml');
  const sample = setSamples.find((each) => each.label === 'long')!.data;
  const merged = partOf(renderDocument(read(name), sample), 'word/document.xml');

  const geometry = (level: number) => {
    const style = styleOf(styles, `ContentsLabels${level}`);
    const indent = /<w:ind\b[^>]*\/>/.exec(style)![0];
    const left = Number(/w:left="(\d+)"/.exec(indent)![1]);
    const hanging = Number(/w:hanging="(\d+)"/.exec(indent)![1]);
    const tab = Number(/<w:tab w:val="left" w:pos="(\d+)"\/>/.exec(style)![1]);
    return { start: left - hanging, title: left, tab };
  };

  it('is headed „Cuprins”, as every contents of the set is', () => {
    const body = partOf(read(name), 'word/document.xml');
    const control = body.lastIndexOf('<w:sdt>', body.indexOf('Table of Contents'));
    const title = body
      .slice(0, control)
      .match(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)!
      .at(-1)!;
    expect(documentTextOf(title)).toBe('Cuprins');
  });

  it('wraps an entry under its title, a subchapter one tier in', () => {
    const chapter = geometry(1);
    const subchapter = geometry(2);
    expect(chapter.start).toBe(0);
    expect(subchapter.start).toBe(567);
    for (const level of [chapter, subchapter]) expect(level.tab).toBe(level.title);
  });

  // LibreOffice writes the PDF's entries again in these styles from the headings' plain text:
  // a label column there would take a title without its label, or a page number, to it.
  it('keeps the column off the entry styles the PDF conversion lays its entries out in', () => {
    for (const level of [1, 2]) {
      expect(styleOf(styles, `TOC${level}`)).not.toContain('<w:tab w:val="left"');
    }
  });

  it('sets each labelled entry on its column', () => {
    for (const entry of entriesOf(merged)) {
      const level = Number(/TOC(\d)/.exec(entry)![1]);
      if (!entry.includes('<w:tab/>')) continue;
      const { title } = geometry(level);
      expect(entry).toContain(`<w:tab w:val="left" w:pos="${title}"/>`);
      expect(entry).toMatch(new RegExp(`<w:ind w:left="${title}"`));
    }
  });

  it('prints every label in bold, a tab, then the title in regular', () => {
    const entries = entriesOf(merged);
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      const runs = runsOf(
        entry.replace(/<w:r><w:fldChar[^>]*\/><\/w:r>|<w:r><w:instrText[\s\S]*?<\/w:r>/g, '')
      );
      const text = documentTextOf(entry);
      if (text === 'Bibliografie') continue;
      expect(runs, text).toHaveLength(3);
      const [bold, tab, title] = runs as [string, string, string];
      expect(documentTextOf(bold)).toMatch(label);
      expect(bold).toContain('<w:b/>');
      expect(tab).toBe('<w:r><w:tab/></w:r>');
      expect(title).not.toContain('<w:b/>');
    }
  });

  it('leaves room in each column for the widest label it lists', () => {
    for (const entry of entriesOf(merged)) {
      const level = Number(/TOC(\d)/.exec(entry)![1]);
      const bold = runsOf(entry).find((run) => run.includes('<w:b/>'));
      if (!bold) continue;
      const { start, title } = geometry(level);
      expect(start + textWidth(documentTextOf(bold), 20, true)).toBeLessThan(title);
    }
  });
});

describe('the headings of 9', () => {
  it("read in sentence case, as 2.2's, and so do its contents", () => {
    const headings = (
      partOf(read('9_risk_assessment.docx'), 'word/document.xml').match(
        /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?<w:pStyle w:val="Heading[12]"\/>[\s\S]*?<\/w:p>/g
      ) ?? []
    ).map(documentTextOf);
    expect(headings).toEqual([
      'Capitolul I. Introducere în sistemul de evaluare d.p.d.v. al securității și sănătății în muncă',
      'Capitolul II. Prezentarea metodei elaborate de I.N.C.D.P.M. București pentru evaluarea riscurilor de accidentare și îmbolnăvire profesională',
      'Subcapitolul II.I. Premise teoretice',
      'Subcapitolul II.II. Descrierea metodei',
      'Subcapitolul II.III. Aplicarea metodei',
      'Capitolul III. Prezentarea unității',
      'Capitolul IV. Formarea echipelor (colectivului) de evaluare a riscurilor de accidentare și/sau îmbolnăvire profesională pentru {{client.legalName}}',
      'Anexa Nr. 1.Lista de identificare a factorilor de risc',
      'Anexa Nr. 2.Lista de consecințe posibile ale acțiunii factorilor de risc asupra organismului uman',
      'Anexa Nr. 3.Scala de cotare a gravității și probabilității consecințelor acțiunii factorilor de risc asupra organismului uman',
      'Anexa Nr. 4.Grila de evaluare a riscurilor (combinație între gravitatea consecințelor și probabilitatea producerii lor)',
      'Anexa Nr. 5.Scala de încadrare a nivelurilor de risc/ securitate',
      'Anexa Nr. 6.Ordinea ierarhică a măsurilor de prevenire',
      'Bibliografie',
      'Capitolul V. Utilizarea metodei elaborate de I.N.C.D.P.M. București pentru evaluarea riscurilor de accidentare și îmbolnăvire profesională la {{client.legalName}}',
      'Subcapitolul V.{{roman}}. Evaluarea riscurilor de accidentare și îmbolnăvire profesională pentru {{subject}}',
      'Capitolul VI. Concluzii generale',
      'Subcapitolul VI.I. Concluziile evaluării',
      'Subcapitolul VI.II. Recomandări',
      'Subcapitolul VI.III. Consultarea lucrătorilor și revizuirea evaluării',
    ]);
  });
});

describe('the annex lines under the contents of 3.2', () => {
  it('hang like the entries, the label bold', () => {
    const body = partOf(read('3.2_own_instructions.docx'), 'word/document.xml');
    const line = (body.match(
      /<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Anexa \{\{number\}\}\.[\s\S]*?<\/w:p>/g
    ) ?? [])[0]!;
    const styles = partOf(read('3.2_own_instructions.docx'), 'word/styles.xml');
    const column = /<w:tab w:val="left" w:pos="(\d+)"\/>/.exec(
      styleOf(styles, 'ContentsLabels1')
    )![1];
    expect(line).toContain(`<w:ind w:left="${column}" w:hanging="${column}"/>`);
    expect(line).toContain(`<w:tab w:val="left" w:pos="${column}"/>`);
    const runs = runsOf(line);
    expect(runs[0]).toContain('<w:b/>');
    expect(documentTextOf(runs[0]!)).toBe('Anexa {{number}}.');
    expect(runs.at(-1)).not.toContain('<w:b/>');
  });
});

describe('the contents of the fire-safety own instructions', () => {
  it('keeps one run per entry, the hang of its own style', () => {
    const bytes = read('fire/2.1_fire_own_instructions.docx');
    const styles = partOf(bytes, 'word/styles.xml');
    expect(styles).not.toContain('ContentsLabels');
    const entries = entriesOf(fillTableOfContents(partOf(bytes, 'word/document.xml'), styles));
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(entry).not.toContain('<w:tab/>');
      expect(entry).not.toContain('<w:b/>');
    }
  });
});
