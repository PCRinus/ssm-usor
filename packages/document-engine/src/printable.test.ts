import PizZip from 'pizzip';
import { describe, expect, it, vi } from 'vitest';

import { printableDocx } from './printable';
import { read } from './templates/read';
import { printedContents } from './toc';

vi.mock('./toc', async (original) => {
  const actual = await original<typeof import('./toc')>();
  return { ...actual, printedContents: vi.fn(actual.printedContents) };
});

const documentOf = (docx: Uint8Array) => new PizZip(docx).file('word/document.xml')!.asText();

describe('the file a contents is printed from', () => {
  it('writes the contents of the occupational safety set as entries with page references', () => {
    const printed = documentOf(printableDocx(read('2.2_general_training_material.docx')));
    expect(printed).not.toContain('Table of Contents');
    expect(printed).not.toMatch(/<w:instrText[^>]*> TOC /);
    const references = [...printed.matchAll(/PAGEREF (_Toc\d+) \\h/g)].map((match) => match[1]);
    expect(references).toHaveLength(19);
    for (const name of references) expect(printed).toContain(`w:name="${name}"`);
  });

  it('leaves a file without a label column, as the fire-safety set has, as it is', () => {
    const fire = read('fire/2.1_fire_own_instructions.docx');
    expect(printableDocx(fire)).toBe(fire);
  });

  it('leaves a file without contents, or that is no Word file, as it is', () => {
    const decision = read('1.1_decision_training.docx');
    expect(printableDocx(decision)).toBe(decision);
    const notWord = new TextEncoder().encode('%PDF-1.7');
    expect(printableDocx(notWord)).toBe(notWord);
  });

  it('converts a file as it is when a reference would not find its heading', () => {
    vi.mocked(printedContents).mockImplementationOnce((document) =>
      document.replace(
        '<w:body>',
        '<w:body><w:p><w:r><w:instrText xml:space="preserve"> PAGEREF _TocMissing \\h </w:instrText></w:r></w:p>'
      )
    );
    const docx = read('2.2_general_training_material.docx');
    expect(printableDocx(docx)).toBe(docx);
  });

  it('converts a file as it is when a reference would find its bookmark only in a text box', () => {
    vi.mocked(printedContents).mockImplementationOnce((document) =>
      document.replace(
        '<w:body>',
        '<w:body><w:p><w:r><w:instrText xml:space="preserve"> PAGEREF _TocBoxed \\h </w:instrText></w:r></w:p>' +
          '<w:p><w:r><mc:AlternateContent><mc:Fallback><w:txbxContent><w:p><w:bookmarkStart w:id="1" w:name="_TocBoxed"/>' +
          '<w:bookmarkEnd w:id="1"/></w:p></w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>'
      )
    );
    const docx = read('2.2_general_training_material.docx');
    expect(printableDocx(docx)).toBe(docx);
  });

  it('lists no heading of a text box, so no bookmark lands in a copy LibreOffice skips', () => {
    const zip = new PizZip(read('2.2_general_training_material.docx'));
    const xml = zip.file('word/document.xml')!.asText();
    const heading =
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Capitolul XX. Din casetă</w:t></w:r></w:p>';
    const box = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:txbxContent>${heading}</w:txbxContent></mc:Choice><mc:Fallback><w:txbxContent>${heading}</w:txbxContent></mc:Fallback></mc:AlternateContent></w:r></w:p>`;
    zip.file('word/document.xml', xml.replace('</w:body>', `${box}</w:body>`));
    const printed = documentOf(printableDocx(zip.generate({ type: 'uint8array' })));
    expect(printed).not.toContain('Din casetă</w:t></w:r></w:hyperlink>');
    expect(printed.match(/PAGEREF _Toc/g)).toHaveLength(19);
  });

  it('reads a label column and a field code as the in-app editor saves them', () => {
    const zip = new PizZip(read('2.2_general_training_material.docx'));
    const styles = zip
      .file('word/styles.xml')!
      .asText()
      .replace(/<w:tab w:val="left" w:pos="(\d+)"\/>/g, '<w:tab w:pos="$1" w:val="left"/>');
    const xml = zip.file('word/document.xml')!.asText().replace('\\o "1-2"', '\\o &quot;1-2&quot;');
    zip.file('word/styles.xml', styles);
    zip.file('word/document.xml', xml);
    const printed = documentOf(printableDocx(zip.generate({ type: 'uint8array' })));
    expect(printed.match(/PAGEREF _Toc/g)).toHaveLength(19);
    expect(printed).toContain('<w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Capitolul I.</w:t>');
  });
});
