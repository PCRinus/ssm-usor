import { Zip, ZipPassThrough } from 'fflate';

// Stored, not compressed: the files are PDFs, Word files and photographs, which do not shrink,
// and each one leaves memory as a chunk of the archive as soon as it is added.
export async function zipFiles(
  files: { path: string; load: () => Promise<Uint8Array> }[],
  onProgress: (done: number) => void
): Promise<Blob> {
  const chunks: BlobPart[] = [];
  let failure: Error | null = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk as BlobPart);
  });
  const used = new Set<string>();
  let done = 0;
  for (const file of files) {
    let path = file.path;
    for (let copy = 2; used.has(path); copy += 1)
      path = file.path.replace(/(\.[^./]+)?$/, ` (${copy})$1`);
    used.add(path);
    const entry = new ZipPassThrough(path);
    zip.add(entry);
    entry.push(await file.load(), true);
    done += 1;
    onProgress(done);
    if (failure) throw failure;
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, { type: 'application/zip' });
}
