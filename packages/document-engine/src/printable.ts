import PizZip from 'pizzip';

import { printedContents } from './toc';

/**
 * The file to convert to PDF in place of `docx`: its contents written for print
 * (`printedContents`), or `docx` itself when it has none to rewrite. The Word file a member
 * downloads keeps its contents field.
 */
export function printableDocx(docx: Uint8Array): Uint8Array {
  let zip: PizZip;
  try {
    zip = new PizZip(docx);
  } catch {
    return docx;
  }
  const document = zip.file('word/document.xml')?.asText();
  const styles = zip.file('word/styles.xml')?.asText();
  if (!document || !styles) return docx;
  const printed = printedContents(document, styles);
  if (printed === document) return docx;
  // Every reference must find its bookmark, or LibreOffice prints an error where the number
  // goes; a file that fails this converts as it is, its contents rebuilt without the labels.
  const marks = new Set(
    [...printed.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"/g)].map((m) => m[1])
  );
  const references = [...printed.matchAll(/PAGEREF (\S+)/g)].map((m) => m[1]);
  if (references.some((name) => !marks.has(name))) return docx;
  zip.file('word/document.xml', printed);
  return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
}
