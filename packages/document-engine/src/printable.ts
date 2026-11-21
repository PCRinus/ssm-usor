import PizZip from 'pizzip';

import { boxPattern, printedContents } from './toc';

/**
 * The file to convert to PDF in place of `docx`: its contents written for print
 * (`printedContents`), or `docx` itself when it has none to rewrite. The Word file a member
 * downloads keeps its contents field.
 */
export function printableDocx(docx: Uint8Array): Uint8Array {
  try {
    const zip = new PizZip(docx);
    const document = zip.file('word/document.xml')?.asText();
    const styles = zip.file('word/styles.xml')?.asText();
    if (!document || !styles) return docx;
    const printed = printedContents(document, styles);
    if (printed === document) return docx;
    // A reference whose bookmark LibreOffice does not lay out prints "Error: Reference source
    // not found" in place of the number; such a file converts as it is, with plain contents.
    const laidOut = printed.replace(boxPattern, '');
    const marks = new Set(
      [...laidOut.matchAll(/<w:bookmarkStart\b[^>]*w:name="([^"]+)"/g)].map((match) => match[1])
    );
    const references = [...printed.matchAll(/PAGEREF (\S+)/g)].map((match) => match[1]);
    if (references.some((name) => !marks.has(name))) return docx;
    zip.file('word/document.xml', printed);
    return zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
  } catch {
    return docx;
  }
}
