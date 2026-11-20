import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import PizZip from 'pizzip';

// LibreOffice was seen to leave out a whole table, about 2,400 words, without an error, when
// rows that cannot split and are taller than a page sat in a run of paragraphs kept with the
// next. The page count does not show it; only the words do.

export type WordCounts = Map<string, number>;

const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const words = (text: string) =>
  text
    .normalize('NFKC')
    .replaceAll('­', '')
    .toLowerCase()
    .match(/\p{L}+|\p{N}+/gu) ?? [];

const counted = (list: readonly string[]): WordCounts =>
  list.reduce((counts, word) => counts.set(word, (counts.get(word) ?? 0) + 1), new Map());

// The body only: a header prints on every page, so the PDF holds its words many times anyway.
// A text box is saved twice, for Word and as a fallback for older readers, and a formula is
// laid out as an equation, not as words.
export function docxWords(docx: Uint8Array): WordCounts {
  const xml = new PizZip(docx)
    .file('word/document.xml')!
    .asText()
    .replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '')
    .replace(/<m:oMath(Para)?[ >][\s\S]*?<\/m:oMath\1>/g, '');
  const text = [
    ...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>|<\/w:p>|<w:(?:tab|br|cr|noBreakHyphen)\/>/g),
  ]
    .map((match) => match[1] ?? ' ')
    .join('')
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name]!);
  return counted(words(text));
}

export async function pdfWords(pdf: Uint8Array): Promise<WordCounts> {
  const loading = getDocument({ data: pdf.slice(), useSystemFonts: false });
  const document = await loading.promise;
  const lines: string[] = [];
  try {
    for (let number = 1; number <= document.numPages; number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      let line = '';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      lines.push(line);
    }
  } finally {
    await loading.destroy();
  }
  const text = lines.join('\n');
  // LibreOffice hyphenates at the end of a line, and in a cell too narrow for a word breaks it
  // without a hyphen ("Deces" over "e"). Both halves stay counted, so the word across two
  // lines is only ever counted in addition.
  const joined = [...text.matchAll(/(\p{L}+)[-\u00ad\u2010]?[ \t]*\n\s*(?=(\p{L}+))/gu)].flatMap(
    (match) => words(`${match[1]}${match[2]}`)
  );
  return counted([...words(text), ...joined]);
}

// Each word of the .docx as often as the .docx has it. The PDF may hold more: headers, page
// numbers, list labels, a table's header row repeated on every page, a table of contents.
export async function wordsMissingFromPdf(docx: Uint8Array, pdf: Uint8Array) {
  const printed = await pdfWords(pdf);
  return [...docxWords(docx)]
    .filter(([word, count]) => (printed.get(word) ?? 0) < count)
    .map(([word, count]) => ({ word, missing: count - (printed.get(word) ?? 0) }));
}
