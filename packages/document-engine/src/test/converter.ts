import { printableDocx } from '../printable';

// The tests job has no converter; CI's flows job starts one and sets GOTENBERG_URL.
export const converter = process.env.GOTENBERG_URL;

// As production asks for it (apps/api/src/lib/pdf.ts and apps/pdf/src/convert.ts, which this
// package cannot import): the file as `printableDocx` writes it, the archival PDF/A flavour with
// the contents' page numbers written in, two attempts, since LibreOffice in the converter now
// and then crashes on a file it converts the next time.
const attempts = 2;

export async function convert(docx: Uint8Array, { skipEmptyPages = false } = {}) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(printableDocx(docx))]), 'document.docx');
  form.append('updateIndexes', 'true');
  form.append('pdfa', 'PDF/A-2b');
  // LibreOffice adds an empty page before a section that restarts at 1 on an even page.
  if (skipEmptyPages) form.append('skipEmptyPages', 'true');
  let status = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetch(`${converter}/forms/libreoffice/convert`, {
      method: 'POST',
      body: form,
    });
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    status = response.status;
    if (status < 500) break;
  }
  throw new Error(`The converter answered ${status}.`);
}
