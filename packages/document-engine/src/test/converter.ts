// The tests job has no converter; CI's flows job starts one and sets GOTENBERG_URL.
export const converter = process.env.GOTENBERG_URL;

// LibreOffice in the converter now and then crashes on a file it converts the next time.
const attempts = 3;

export async function convert(docx: Uint8Array) {
  const form = new FormData();
  form.append('files', new Blob([new Uint8Array(docx)]), 'document.docx');
  // LibreOffice adds an empty page before a section that restarts at 1 on an even page.
  form.append('skipEmptyPages', 'true');
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
