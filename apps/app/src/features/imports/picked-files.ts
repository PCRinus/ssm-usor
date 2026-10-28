import type { PickedFile } from './upload-selection';

// A folder chosen in the picker gives each file its path under the folder; a plain choice none.
export const pickedFromInput = (files: FileList | File[]): PickedFile[] =>
  Array.from(files).map((file) => ({ path: file.webkitRelativePath || file.name, blob: file }));

const fileOf = (entry: FileSystemFileEntry) =>
  new Promise<File>((resolve, reject) => entry.file(resolve, reject));

// readEntries answers in batches of about a hundred; an empty batch is the end.
async function childrenOf(directory: FileSystemDirectoryEntry) {
  const reader = directory.createReader();
  const children: FileSystemEntry[] = [];
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject)
    );
    if (batch.length === 0) return children;
    children.push(...batch);
  }
}

async function walk(entry: FileSystemEntry, into: PickedFile[]) {
  const path = entry.fullPath.replace(/^\/+/, '') || entry.name;
  if (entry.isFile) {
    into.push({ path, blob: await fileOf(entry as FileSystemFileEntry) });
    return;
  }
  if (entry.isDirectory) {
    for (const child of await childrenOf(entry as FileSystemDirectoryEntry)) {
      await walk(child, into);
    }
  }
}

// The entries are taken before the first await: the drop's DataTransfer empties once the event
// handler returns.
export async function pickedFromDrop(transfer: DataTransfer): Promise<PickedFile[]> {
  const entries = Array.from(transfer.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  if (entries.length === 0 || entries.some((entry) => entry === null)) {
    return pickedFromInput(transfer.files);
  }
  const picked: PickedFile[] = [];
  for (const entry of entries) await walk(entry!, picked);
  return picked;
}
