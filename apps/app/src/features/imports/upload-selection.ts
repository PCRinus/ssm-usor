import { importFileExtensions, type ImportFileType, importLimits } from '@ssm-usor/contracts';
import { unzipSync } from 'fflate';

import { zipNameFixes } from './zip-names';

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
  // Zips holding more than one import takes.
  largeZips: string[];
};

const nothingFound = (): Selection => ({
  files: [],
  setAside: [],
  systemFiles: [],
  archives: [],
  brokenZips: [],
  largeZips: [],
});

export const emptySelection = nothingFound();

const unopenedArchives = new Set(['7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zipx', 'cab']);

const maxZipBytes = 4 * importLimits.totalBytes;

const maxZipDepth = 3;

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

// What a zip and the zips inside it have inflated so far.
type Budget = { bytes: number; files: number };

type Zip = PickedFile & { depth: number; budget: Budget };

class OverBudget extends Error {}

function sortOne(path: string, blob: Blob, group: string, into: Selection, zips: PickedFile[]) {
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
    const zip = zips.shift()!;
    const name = zip.path.split('/').at(-1)!;
    const group = topGroup(zip.path);
    const { budget } = zip;
    const spent = { ...budget };
    const found = nothingFound();
    const inner: PickedFile[] = [];
    try {
      if (zip.blob.size > maxZipBytes) throw new OverBudget();
      const bytes = new Uint8Array(await zip.blob.arrayBuffer());
      const fixes = zipNameFixes(bytes);
      const named = (entry: string) => fixes.get(entry) ?? entry;
      const entries = unzipSync(bytes, {
        // fflate allocates each entry's declared size, so only what may be uploaded is inflated,
        // and a zip stops as soon as it holds more than one import takes.
        filter: (entry) => {
          const path = cleanPath(`${zip.path}/${named(entry.name)}`);
          if (!path || entry.name.endsWith('/')) return false;
          const entryName = path.split('/').at(-1)!;
          const extension = extensionOf(entryName);
          if (isSystemPath(path)) found.systemFiles.push(path);
          else if (
            unopenedArchives.has(extension) ||
            (extension === 'zip' && zip.depth + 1 >= maxZipDepth)
          ) {
            found.archives.push(entryName);
          } else if (extension !== 'zip' && !importTypeOf(entryName)) {
            found.setAside.push({
              key: nextKey(),
              path,
              name: entryName,
              reason: 'unsupported',
              group,
            });
          } else if (extension !== 'zip' && entry.originalSize > importLimits.fileBytes) {
            found.setAside.push({
              key: nextKey(),
              path,
              name: entryName,
              reason: 'too_large',
              group,
            });
          } else {
            budget.bytes += entry.originalSize;
            if (extension !== 'zip') budget.files += 1;
            if (budget.bytes > importLimits.totalBytes || budget.files > importLimits.files) {
              throw new OverBudget();
            }
            return true;
          }
          return false;
        },
      });
      for (const [entry, content] of Object.entries(entries)) {
        const path = cleanPath(`${zip.path}/${named(entry)}`);
        if (!path) continue;
        const type = importTypeOf(path) ?? undefined;
        sortOne(path, new Blob([content as BlobPart], { type }), group, found, inner);
      }
    } catch (cause) {
      Object.assign(budget, spent);
      if (cause instanceof OverBudget) into.largeZips.push(name);
      else into.brokenZips.push(name);
      continue;
    } finally {
      // A zip inside another counted once as an entry; its own entries count from here on.
      if (zip.depth > 0) budget.bytes -= zip.blob.size;
    }
    into.files.push(...found.files);
    into.setAside.push(...found.setAside);
    into.systemFiles.push(...found.systemFiles);
    into.archives.push(...found.archives);
    zips.push(...inner.map((each) => ({ ...each, depth: zip.depth + 1, budget })));
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

export async function openPicked(picked: PickedFile[]) {
  const added = nothingFound();
  for (const { path, blob } of picked) {
    const clean = cleanPath(path);
    const zips: PickedFile[] = [];
    if (clean) sortOne(clean, blob, topGroup(clean), added, zips);
    await openZips(
      zips.map((zip) => ({ ...zip, depth: 0, budget: { bytes: 0, files: 0 } })),
      added
    );
  }
  return added;
}

export function mergeSelection(current: Selection, added: Selection): Selection {
  const taken = new Set(current.files.map((file) => file.path));
  const files = added.files.map((file) => {
    const path = uniquePath(file.path, taken);
    taken.add(path);
    if (path === file.path) return file;
    return { ...file, path, group: file.group === file.path ? path : file.group };
  });
  return {
    files: [...current.files, ...files],
    setAside: [...current.setAside, ...added.setAside],
    systemFiles: [...current.systemFiles, ...added.systemFiles],
    archives: [...new Set([...current.archives, ...added.archives])],
    brokenZips: [...new Set([...current.brokenZips, ...added.brokenZips])],
    largeZips: [...new Set([...current.largeZips, ...added.largeZips])],
  };
}

export const addToSelection = async (current: Selection, picked: PickedFile[]) =>
  mergeSelection(current, await openPicked(picked));

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
