import PizZip from 'pizzip';
import { describe, expect, it } from 'vitest';

import { countArticles } from './modules';

const paragraph = (text: string, properties = '') =>
  `<w:p><w:pPr>${properties}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`;

const numbered = (text: string, numId: number, level = 0) =>
  paragraph(text, `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);

const styled = (text: string, style: string) => paragraph(text, `<w:pStyle w:val="${style}"/>`);

function docx(body: string, styles = '') {
  const zip = new PizZip();
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
  );
  zip.file(
    'word/styles.xml',
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi"/></w:rPr></w:rPrDefault></w:docDefaults>${styles}</w:styles>`
  );
  return zip.generate({ type: 'uint8array' });
}

describe('countArticles', () => {
  it('counts the top-level items of the most used list', () => {
    const file = docx(
      [
        paragraph('Title'),
        numbered('one', 3),
        numbered('a', 3, 1),
        numbered('b', 3, 1),
        numbered('two', 3),
        numbered('three', 3),
        numbered('bullet', 7),
      ].join('')
    );
    expect(countArticles(file)).toBe(3);
  });

  it('counts paragraphs numbered by their style', () => {
    const styles = `<w:style w:type="paragraph" w:styleId="Articol"><w:pPr><w:numPr><w:numId w:val="5"/></w:numPr></w:pPr></w:style>`;
    const file = docx(
      [styled('one', 'Articol'), styled('two', 'Articol'), styled('plain', 'Normal')].join(''),
      styles
    );
    expect(countArticles(file)).toBe(2);
  });

  it('is zero without a numbered list', () => {
    expect(countArticles(docx(paragraph('just text')))).toBe(0);
  });
});
