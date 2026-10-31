import {
  importFileExtensions,
  type ImportFileType,
  type ImportKind,
  importLimits,
  isSystemPath,
  sheetFileTypes,
} from '@ssm-usor/contracts';
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
  // The pages a PDF holds, each read on its own in an employee import; 1 for a photograph.
  pages: number;
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

const maxZipBytes: Record<ImportKind, number> = {
  client: 4 * importLimits.client.totalBytes,
  employees: importLimits.employees.totalBytes,
};

// An employee import reads only photographs and PDFs of the training sheets.
const acceptedTypes: Record<ImportKind, readonly ImportFileType[] | null> = {
  client: null,
  employees: sheetFileTypes,
};

const maxZipDepth = 3;

// The browser shrinks these before the upload (ADR 032), so the byte caps wait for their new size.
export const shrinksBeforeUpload = (kind: ImportKind, mimeType: ImportFileType) =>
  kind === 'employees' && (mimeType === 'image/jpeg' || mimeType === 'image/png');

// About what a photograph weighs once shrunk; the upload weighs the real one.
const shrunkPhotoBytes = 1024 * 1024;

const extensionOf = (name: string) => /\.([^./]+)$/.exec(name)?.[1]?.toLowerCase() ?? '';

export function importTypeOf(name: string, kind: ImportKind = 'client'): ImportFileType | null {
  const extension = extensionOf(name);
  if (!Object.hasOwn(importFileExtensions, extension)) return null;
  const type = importFileExtensions[extension as keyof typeof importFileExtensions][0];
  const accepted = acceptedTypes[kind];
  return accepted && !accepted.includes(type) ? null : type;
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

function sortOne(
  kind: ImportKind,
  path: string,
  blob: Blob,
  group: string,
  into: Selection,
  zips: PickedFile[]
) {
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
  const mimeType = importTypeOf(name, kind);
  const reason = !mimeType
    ? 'unsupported'
    : blob.size === 0
      ? 'empty'
      : blob.size > importLimits[kind].fileBytes && !shrinksBeforeUpload(kind, mimeType)
        ? 'too_large'
        : name.length > 255
          ? 'name_too_long'
          : null;
  if (reason || !mimeType) {
    into.setAside.push({ key: nextKey(), path, name, reason: reason ?? 'unsupported', group });
    return;
  }
  into.files.push({ key: nextKey(), path, name, blob, size: blob.size, mimeType, group, pages: 1 });
}

async function openZips(kind: ImportKind, zips: Zip[], into: Selection) {
  const limits = importLimits[kind];
  while (zips.length > 0) {
    const zip = zips.shift()!;
    const name = zip.path.split('/').at(-1)!;
    const group = topGroup(zip.path);
    const { budget } = zip;
    const spent = { ...budget };
    const found = nothingFound();
    const inner: PickedFile[] = [];
    try {
      if (zip.blob.size > maxZipBytes[kind]) throw new OverBudget();
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
          const type = importTypeOf(entryName, kind);
          if (isSystemPath(path)) found.systemFiles.push(path);
          else if (
            unopenedArchives.has(extension) ||
            (extension === 'zip' && zip.depth + 1 >= maxZipDepth)
          ) {
            found.archives.push(entryName);
          } else if (extension !== 'zip' && !type) {
            found.setAside.push({
              key: nextKey(),
              path,
              name: entryName,
              reason: 'unsupported',
              group,
            });
          } else if (
            extension !== 'zip' &&
            entry.originalSize > limits.fileBytes &&
            !(type && shrinksBeforeUpload(kind, type))
          ) {
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
            if (budget.bytes > limits.totalBytes || budget.files > limits.files) {
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
        const type = importTypeOf(path, kind) ?? undefined;
        sortOne(kind, path, new Blob([content as BlobPart], { type }), group, found, inner);
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

export async function openPicked(picked: PickedFile[], kind: ImportKind = 'client') {
  const added = nothingFound();
  for (const { path, blob } of picked) {
    const clean = cleanPath(path);
    const zips: PickedFile[] = [];
    if (clean) sortOne(kind, clean, blob, topGroup(clean), added, zips);
    await openZips(
      kind,
      zips.map((zip) => ({ ...zip, depth: 0, budget: { bytes: 0, files: 0 } })),
      added
    );
  }
  if (kind === 'employees') {
    for (const file of added.files) {
      if (file.mimeType === 'application/pdf') file.pages = await countPdfPages(file.blob);
    }
  }
  return added;
}

const pageObject = /\/Type\s*\/Page(?![A-Za-z])/g;
const pageCount = /\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g;

// An estimate for the counter only: a PDF whose pages sit in compressed object streams shows
// neither, and counts as one until the import reads it.
export async function countPdfPages(blob: Blob) {
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer());
  const objects = text.match(pageObject)?.length ?? 0;
  const declared = Math.max(0, ...[...text.matchAll(pageCount)].map((match) => Number(match[1])));
  return Math.max(1, objects, declared);
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

export const addToSelection = async (
  current: Selection,
  picked: PickedFile[],
  kind: ImportKind = 'client'
) => mergeSelection(current, await openPicked(picked, kind));

export const removeGroup = (selection: Selection, group: string): Selection => ({
  ...selection,
  files: selection.files.filter((file) => file.group !== group),
  setAside: selection.setAside.filter((file) => file.group !== group),
});

export const removeFiles = (selection: Selection, keys: string[]): Selection => ({
  ...selection,
  files: selection.files.filter((file) => !keys.includes(file.key)),
});

export function selectionTotals(
  selection: Selection,
  kind: ImportKind = 'client',
  // Photographs and pages added from elsewhere, as the documentation's found sheets.
  extra: { count: number; pages: number; bytes: number } = { count: 0, pages: 0, bytes: 0 }
) {
  const shrunk = (file: SelectedFile) => shrinksBeforeUpload(kind, file.mimeType);
  const bytes = selection.files.reduce(
    (total, file) => total + (shrunk(file) ? Math.min(file.size, shrunkPhotoBytes) : file.size),
    extra.bytes
  );
  const pages = selection.files.reduce((total, file) => total + file.pages, extra.pages);
  const count = selection.files.length + extra.count;
  const limits = importLimits[kind];
  return {
    count,
    bytes,
    pages,
    estimated: selection.files.some((file) => shrunk(file) && file.size > shrunkPhotoBytes),
    overFiles: kind === 'employees' ? pages > limits.scannedPages : count > limits.files,
    overBytes: bytes > limits.totalBytes,
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
