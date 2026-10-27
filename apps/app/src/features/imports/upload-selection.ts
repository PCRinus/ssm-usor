import { importFileExtensions, type ImportFileType, importLimits } from '@ssm-usor/contracts';
import { unzipSync } from 'fflate';

export type PickedFile = {
  // Its folders inside the upload and its name, with / between them.
  path: string;
  blob: Blob;
};

export type SelectedFile = {
  key: string;
  path: string;
  name: string;
  blob: Blob;
  size: number;
  mimeType: ImportFileType;
  // The zip, the folder or the loose file it came with, which the list groups by.
  group: string;
};

export type SetAsideFile = {
  key: string;
  path: string;
  name: string;
  reason: 'unsupported' | 'too_large' | 'empty' | 'name_too_long';
  group: string;
};

export type Selection = {
  files: SelectedFile[];
  setAside: SetAsideFile[];
  systemFiles: string[];
  // .7z, .rar and the like, which the browser cannot open.
  archives: string[];
  brokenZips: string[];
};

export const emptySelection: Selection = {
  files: [],
  setAside: [],
  systemFiles: [],
  archives: [],
  brokenZips: [],
};

const unopenedArchives = new Set(['7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zipx', 'cab']);

const maxZipBytes = 4 * importLimits.totalBytes;

const extensionOf = (name: string) => /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

export function importTypeOf(name: string): ImportFileType | null {
  const extension = extensionOf(name);
  if (!Object.hasOwn(importFileExtensions, extension)) return null;
  return importFileExtensions[extension as keyof typeof importFileExtensions][0];
}

export function isSystemPath(path: string) {
  const parts = path.split('/');
  const name = parts.at(-1) ?? '';
  return (
    parts.some((part) => part === '__MACOSX') ||
    name === '.DS_Store' ||
    name.toLowerCase() === 'thumbs.db' ||
    name.toLowerCase() === 'desktop.ini' ||
    name.startsWith('._') ||
    name.startsWith('~$')
  );
}

// Zip entries may carry backslashes, "./" and "../"; none of them may leave the upload's folder.
export function cleanPath(path: string) {
  const parts = path
    .replaceAll('\\', '/')
    .split('/')
    .filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) return null;
  return parts.length > 0 ? parts.join('/') : null;
}

let lastKey = 0;
const nextKey = () => `import-file-${(lastKey += 1)}`;

function topGroup(path: string) {
  const slash = path.indexOf('/');
  return slash === -1 ? path : path.slice(0, slash);
}

type Zip = { path: string; blob: Blob };

function sortOne(path: string, blob: Blob, group: string, into: Selection, zips: Zip[]) {
  const name = path.split('/').at(-1)!;
  if (isSystemPath(path)) {
    into.systemFiles.push(path);
    return;
  }
  const extension = extensionOf(name);
  if (unopenedArchives.has(extension)) {
    into.archives.push(name);
    return;
  }
  if (extension === 'zip') {
    zips.push({ path, blob });
    return;
  }
  const mimeType = importTypeOf(name);
  const reason = !mimeType
    ? 'unsupported'
    : blob.size === 0
      ? 'empty'
      : blob.size > importLimits.fileBytes
        ? 'too_large'
        : name.length > 255
          ? 'name_too_long'
          : null;
  if (reason || !mimeType) {
    into.setAside.push({ key: nextKey(), path, name, reason: reason ?? 'unsupported', group });
    return;
  }
  into.files.push({ key: nextKey(), path, name, blob, size: blob.size, mimeType, group });
}

async function openZips(zips: Zip[], into: Selection) {
  while (zips.length > 0) {
    const { path, blob } = zips.shift()!;
    const name = path.split('/').at(-1)!;
    if (blob.size > maxZipBytes) {
      into.brokenZips.push(name);
      continue;
    }
    let entries: Record<string, Uint8Array>;
    const oversized: string[] = [];
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      entries = unzipSync(bytes, {
        // Entries past the per-file limit are never inflated: a declared size is all they cost.
        filter: (entry) => {
          if (entry.name.endsWith('/')) return false;
          if (entry.originalSize > importLimits.fileBytes) {
            oversized.push(entry.name);
            return false;
          }
          return true;
        },
      });
    } catch {
      into.brokenZips.push(name);
      continue;
    }
    for (const entry of oversized) {
      const inner = cleanPath(`${path}/${entry}`);
      if (!inner || isSystemPath(inner)) continue;
      into.setAside.push({
        key: nextKey(),
        path: inner,
        name: inner.split('/').at(-1)!,
        reason: importTypeOf(inner) ? 'too_large' : 'unsupported',
        group: topGroup(path),
      });
    }
    for (const [entry, content] of Object.entries(entries)) {
      const inner = cleanPath(`${path}/${entry}`);
      if (!inner) continue;
      const type = importTypeOf(inner) ?? undefined;
      sortOne(inner, new Blob([content as BlobPart], { type }), topGroup(path), into, zips);
    }
  }
}

function uniquePath(path: string, taken: Set<string>) {
  if (!taken.has(path)) return path;
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  const [stem, extension] = dot > slash + 1 ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
  for (let copy = 2; ; copy += 1) {
    const candidate = `${stem} (${copy})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function addToSelection(current: Selection, picked: PickedFile[]) {
  const added: Selection = {
    files: [],
    setAside: [],
    systemFiles: [],
    archives: [],
    brokenZips: [],
  };
  const zips: Zip[] = [];
  for (const { path, blob } of picked) {
    const clean = cleanPath(path);
    if (clean) sortOne(clean, blob, topGroup(clean), added, zips);
    await openZips(zips, added);
  }
  const taken = new Set(current.files.map((file) => file.path));
  const files = added.files.map((file) => {
    const path = uniquePath(file.path, taken);
    taken.add(path);
    return path === file.path ? file : { ...file, path };
  });
  return {
    files: [...current.files, ...files],
    setAside: [...current.setAside, ...added.setAside],
    systemFiles: [...current.systemFiles, ...added.systemFiles],
    archives: [...new Set([...current.archives, ...added.archives])],
    brokenZips: [...new Set([...current.brokenZips, ...added.brokenZips])],
  } satisfies Selection;
}

export const removeGroup = (selection: Selection, group: string): Selection => ({
  ...selection,
  files: selection.files.filter((file) => file.group !== group),
  setAside: selection.setAside.filter((file) => file.group !== group),
});

export const removeFiles = (selection: Selection, keys: string[]): Selection => ({
  ...selection,
  files: selection.files.filter((file) => !keys.includes(file.key)),
});

export function selectionTotals(selection: Selection) {
  const bytes = selection.files.reduce((total, file) => total + file.size, 0);
  return {
    count: selection.files.length,
    bytes,
    overFiles: selection.files.length > importLimits.files,
    overBytes: bytes > importLimits.totalBytes,
  };
}

export const isPhoto = (file: Pick<SelectedFile, 'mimeType'>) => file.mimeType.startsWith('image/');

export type SelectionRow =
  | { kind: 'folder'; group: string; zip: boolean; files: SelectedFile[] }
  | { kind: 'file'; group: string; file: SelectedFile }
  | { kind: 'photos'; groups: string[]; files: SelectedFile[] };

export function selectionRows(files: SelectedFile[]): SelectionRow[] {
  const rows: SelectionRow[] = [];
  const folders = new Map<string, SelectedFile[]>();
  const photos: SelectedFile[] = [];
  for (const file of files) {
    if (file.path !== file.group) {
      const list = folders.get(file.group);
      if (list) list.push(file);
      else {
        const created = [file];
        folders.set(file.group, created);
        rows.push({ kind: 'folder', group: file.group, zip: false, files: created });
      }
    } else if (isPhoto(file)) {
      photos.push(file);
    } else {
      rows.push({ kind: 'file', group: file.group, file });
    }
  }
  for (const row of rows) {
    if (row.kind === 'folder') row.zip = extensionOf(row.group) === 'zip';
  }
  if (photos.length === 1) rows.push({ kind: 'file', group: photos[0]!.group, file: photos[0]! });
  else if (photos.length > 1) {
    rows.push({ kind: 'photos', groups: photos.map((file) => file.group), files: photos });
  }
  return rows;
}
