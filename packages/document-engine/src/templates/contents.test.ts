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
  '11_employer_briefing.docx',
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
      if (/^BIBLIOGRAFIE$/.test(text)) continue;
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
