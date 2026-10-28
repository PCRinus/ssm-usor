import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { DocxReadError, docxToText } from './docx';

const namespaces =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"';

const paragraph = (...runs: string[]) =>
  `<w:p>${runs.map((run) => `<w:r>${run}</w:r>`).join('')}</w:p>`;
const text = (value: string) => `<w:t xml:space="preserve">${value}</w:t>`;
const cell = (...paragraphs: string[]) => `<w:tc><w:tcPr/>${paragraphs.join('')}</w:tc>`;
const row = (...cells: string[]) => `<w:tr>${cells.join('')}</w:tr>`;

function docx(parts: Record<string, string>) {
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/media/image1.png': new Uint8Array([137, 80, 78, 71]),
    ...Object.fromEntries(
      Object.entries(parts).map(([name, body]) => [
        name,
        strToU8(`<?xml version="1.0" encoding="UTF-8"?>${body}`),
      ])
    ),
  });
}

const header = `<w:hdr ${namespaces}>${paragraph(text('BRUTĂRIA FICTIVĂ S.R.L. – CUI 12345674'))}</w:hdr>`;

describe('docxToText', () => {
  it('renders paragraphs, tables as rows of cells, then the header first and the footer last', () => {
    const document = `<w:document ${namespaces}><w:body>
      ${paragraph(text('DECIZIA nr. 3'), '<w:tab/>', text('din 12.01.2025'))}
      ${paragraph(text('Cod CAEN: '), text('0111'), '<w:br/>', text('Telefon: 0721000000'))}
      <w:tbl>
        <w:tblPr/>
        ${row(cell(paragraph(text('Post'))), cell(paragraph(text('Echipament'))))}
        ${row(cell(paragraph(text('Brutar'))), cell(paragraph(text('Mănuși')), paragraph(text('Bonetă | șorț'))))}
        ${row(cell(paragraph()), cell(paragraph()))}
      </w:tbl>
      ${paragraph(text('Întocmit'))}
      <w:sectPr/>
    </w:body></w:document>`;
    const footer = `<w:ftr ${namespaces}>${paragraph(text('Pagina '), '<w:fldChar w:fldCharType="begin"/>', '<w:instrText> PAGE </w:instrText>', text('1'))}</w:ftr>`;

    expect(
      docxToText(
        docx({
          'word/document.xml': document,
          'word/header1.xml': header,
          'word/header2.xml': header,
          'word/footer1.xml': footer,
        })
      )
    ).toBe(
      [
        'BRUTĂRIA FICTIVĂ S.R.L. – CUI 12345674',
        '',
        'DECIZIA nr. 3 din 12.01.2025',
        'Cod CAEN: 0111 Telefon: 0721000000',
        '| Post | Echipament |',
        '| Brutar | Mănuși / Bonetă / șorț |',
        '',
        'Întocmit',
        '',
        'Pagina 1',
      ].join('\n')
    );
  });

  it('reads a text box once, without the fallback that repeats it', () => {
    const document = `<w:document ${namespaces}><w:body><w:p><w:r><mc:AlternateContent>
      <mc:Choice Requires="wps"><w:drawing><w:txbxContent>${paragraph(text('Punct de lucru Depozit'))}</w:txbxContent></w:drawing></mc:Choice>
      <mc:Fallback><w:pict><w:txbxContent>${paragraph(text('Punct de lucru Depozit'))}</w:txbxContent></w:pict></mc:Fallback>
    </mc:AlternateContent></w:r></w:p></w:body></w:document>`;

    expect(docxToText(docx({ 'word/document.xml': document }))).toBe('Punct de lucru Depozit');
  });

  it('keeps entities and leaves tracked deletions out', () => {
    const document = `<w:document ${namespaces}><w:body>${paragraph(
      text('Brutăria &amp; Cofetăria'),
      `<w:delText>Vechi</w:delText>`
    )}</w:body></w:document>`;

    expect(docxToText(docx({ 'word/document.xml': document }))).toBe('Brutăria & Cofetăria');
  });

  it('refuses a document whose text would inflate past the cap, before inflating it', () => {
    const bytes = docx({ 'word/document.xml': `<w:document ${namespaces}/>` });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const name = strToU8('word/document.xml');
    for (let offset = 0; offset < bytes.length - 46; offset++) {
      if (view.getUint32(offset, true) !== 0x02014b50) continue;
      const nameLength = view.getUint16(offset + 28, true);
      const entry = bytes.subarray(offset + 46, offset + 46 + nameLength);
      if (entry.every((byte, index) => byte === name[index]) && nameLength === name.length) {
        view.setUint32(offset + 24, 0xfffffff0, true);
      }
    }

    expect(() => docxToText(bytes)).toThrow('The Word document is too large to read.');
  });

  it('refuses a file that is not a Word document', () => {
    expect(() => docxToText(new Uint8Array([1, 2, 3]))).toThrow(DocxReadError);
    expect(() => docxToText(zipSync({ 'other.txt': strToU8('x') }))).toThrow(DocxReadError);
  });
});
