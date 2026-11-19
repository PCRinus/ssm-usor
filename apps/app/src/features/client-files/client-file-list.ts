import { FilePlus2, FileType } from 'lucide-react';

import type { DataTableSort } from '@/components/data-table/columns';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import {
  filterSearchSchema,
  listFilterSearch,
  listQuerySearchSchema,
} from '@/components/list-filters/url';
import { listSortSearchSchema } from '@/components/list-filters/use-list-search';
import { normalizeSearch } from '@/lib/normalize-search';

import {
  type ClientFile,
  fileKind,
  fileKindKeys,
  fileKindLabels,
  formatUploadDate,
} from './client-file-format';

export const clientFileSortKeys = ['name', 'uploaded'] as const;
export type ClientFileSortKey = (typeof clientFileSortKeys)[number];

export const defaultClientFileSort: DataTableSort & { sort: ClientFileSortKey } = {
  sort: 'uploaded',
  order: 'desc',
};

const addedWays = ['uploaded', 'imported'] as const;

export const clientFileFilterKeys = ['type', 'added'] as const;
export type ClientFileFilterKey = (typeof clientFileFilterKeys)[number];

// Every file is read whole, so the list sorts, searches and filters here; the address keeps the
// choice as on every list.
export const clientFileListSearch = {
  q: listQuerySearchSchema,
  ...listSortSearchSchema(clientFileSortKeys).shape,
  type: filterSearchSchema(fileKindKeys),
  added: filterSearchSchema(addedWays),
};

export type ClientFileListSearch = {
  q?: string;
  sort?: ClientFileSortKey;
  order?: DataTableSort['order'];
  type?: (typeof fileKindKeys)[number][];
  added?: (typeof addedWays)[number][];
};

// "Sursa" already names an import's file and passage (ADR 030), so the group is named otherwise.
export const clientFileFacets: ListFilterFacet<ClientFileFilterKey>[] = [
  {
    key: 'type',
    label: 'Tip',
    icon: FileType,
    column: 'left',
    options: fileKindKeys.map((key) => ({ value: key, label: fileKindLabels[key] })),
  },
  {
    key: 'added',
    label: 'Mod de adăugare',
    icon: FilePlus2,
    column: 'right',
    options: [
      { value: 'uploaded', label: 'Încărcate' },
      { value: 'imported', label: 'Importate' },
    ],
  },
];

export const clientFileFilters = (search: ClientFileListSearch) =>
  listFilterSearch({ keys: clientFileFilterKeys, facets: clientFileFacets, search });

export type FolderKind = 'client' | 'employee' | 'sheets';

export const folderTexts = {
  client: {
    title: (date: string) => `Dosar importat pe ${date}`,
    zip: 'Descarcă tot dosarul (ZIP)',
    zipName: (date: string) => `Dosar importat ${date}.zip`,
    openAtFirst: false,
  },
  employee: {
    title: (date: string) => `Fișe importate pe ${date}`,
    zip: 'Descarcă fișele (ZIP)',
    zipName: (date: string) => `Fișe importate ${date}.zip`,
    openAtFirst: true,
  },
  sheets: {
    title: (date: string) => `Fișe importate pe ${date}`,
    zip: 'Descarcă fișele (ZIP)',
    zipName: (date: string) => `Fișe importate ${date}.zip`,
    openAtFirst: false,
  },
} as const satisfies Record<FolderKind, unknown>;

export interface ImportFolder {
  importId: string;
  kind: FolderKind;
  files: ClientFile[];
  // The first file in, whose date and uploader stand for the import's.
  first: ClientFile;
  date: string;
  title: string;
  bytes: number;
  subfolders: { path: string; files: ClientFile[] }[];
}

export type ClientFileRow =
  | {
      kind: 'file';
      key: string;
      file: ClientFile;
      depth: number;
      // Where a file found through a search or filter sat: its folder and the folders inside it.
      trail: string | null;
    }
  | { kind: 'folder'; key: string; folder: ImportFolder; open: boolean }
  | {
      kind: 'subfolder';
      key: string;
      folder: ImportFolder;
      path: string;
      files: ClientFile[];
      open: boolean;
    }
  | { kind: 'more'; key: string; path: string; total: number; all: boolean; depth: number };

const byName = new Intl.Collator('ro', { numeric: true, sensitivity: 'base' });

export const pathLabel = (path: string) => path.split('/').join(' › ');

const bytesOf = (files: ClientFile[]) => files.reduce((total, file) => total + file.sizeBytes, 0);

export function importFolders(items: readonly ClientFile[], employee: boolean) {
  const grouped = new Map<string, ClientFile[]>();
  for (const file of items) {
    if (file.importId) grouped.set(file.importId, [...(grouped.get(file.importId) ?? []), file]);
  }
  return [...grouped.entries()].map(([importId, files]): ImportFolder => {
    const kind: FolderKind = employee
      ? 'employee'
      : files[0]!.importKind === 'employees'
        ? 'sheets'
        : 'client';
    const first = files.reduce((earliest, file) =>
      file.createdAt < earliest.createdAt ? file : earliest
    );
    const date = formatUploadDate(first.createdAt);
    const paths = new Map<string, ClientFile[]>();
    for (const file of files) {
      const path = file.importPath ?? '';
      paths.set(path, [...(paths.get(path) ?? []), file]);
    }
    return {
      importId,
      kind,
      files,
      first,
      date,
      title: folderTexts[kind].title(date),
      bytes: bytesOf(files),
      subfolders: [...paths.entries()]
        .map(([path, list]) => ({
          path,
          files: [...list].sort((a, b) => byName.compare(a.name, b.name)),
        }))
        .sort((a, b) => byName.compare(a.path, b.path)),
    };
  });
}

export const folderBytes = bytesOf;

export const shownPerFolder = 5;

export interface FolderState {
  // Folders and subfolders switched from how they start, by key.
  switched: readonly string[];
  showAll: readonly string[];
}

export const folderKey = (importId: string) => `folder:${importId}`;
export const subfolderKey = (importId: string, path: string) => `folder:${importId}:${path}`;

function matches(file: ClientFile, search: ClientFileListSearch) {
  const term = normalizeSearch(search.q?.trim() ?? '');
  if (term && !normalizeSearch(`${file.name}\n${file.note ?? ''}`).includes(term)) return false;
  const kind = fileKind(file.mimeType).key;
  if (search.type && (!kind || !search.type.includes(kind))) return false;
  if (search.added && !search.added.includes(file.importId ? 'imported' : 'uploaded')) {
    return false;
  }
  return true;
}

function compare(
  sort: ClientFileSortKey,
  order: DataTableSort['order'],
  a: { name: string; createdAt: string },
  b: { name: string; createdAt: string }
) {
  const direction = order === 'asc' ? 1 : -1;
  const names = byName.compare(a.name, b.name);
  if (sort === 'name') return names * direction;
  return (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) * direction || names;
}

// Searched or filtered, the list turns flat, so a match deep in an import folder is not hidden
// behind a closed row.
export function clientFileRows(
  items: readonly ClientFile[],
  search: ClientFileListSearch,
  folders: FolderState,
  employee: boolean
) {
  const sort = search.sort ?? defaultClientFileSort.sort;
  const order = search.order ?? defaultClientFileSort.order;
  const narrowed = Boolean(search.q?.trim()) || clientFileFilters(search).applied;
  const imported = importFolders(items, employee);
  const isSwitched = (key: string) => folders.switched.includes(key);

  if (narrowed) {
    const titles = new Map(imported.map((folder) => [folder.importId, folder.title]));
    const found = items
      .filter((file) => matches(file, search))
      .sort((a, b) => compare(sort, order, a, b));
    return {
      narrowed,
      count: found.length,
      rows: found.map((file): ClientFileRow => ({
        kind: 'file',
        key: file.id,
        file,
        depth: 0,
        trail: file.importId
          ? [titles.get(file.importId), file.importPath && pathLabel(file.importPath)]
              .filter(Boolean)
              .join(' › ')
          : null,
      })),
    };
  }

  const top = [
    ...items
      .filter((file) => !file.importId)
      .map((file) => ({ name: file.name, createdAt: file.createdAt, file, folder: null })),
    ...imported.map((folder) => ({
      name: folder.title,
      createdAt: folder.first.createdAt,
      file: null,
      folder,
    })),
  ].sort((a, b) => compare(sort, order, a, b));

  const rows: ClientFileRow[] = [];
  for (const entry of top) {
    if (entry.file) {
      rows.push({ kind: 'file', key: entry.file.id, file: entry.file, depth: 0, trail: null });
      continue;
    }
    const folder = entry.folder;
    const key = folderKey(folder.importId);
    const open = folderTexts[folder.kind].openAtFirst !== isSwitched(key);
    rows.push({ kind: 'folder', key, folder, open });
    if (!open) continue;
    for (const subfolder of folder.subfolders) {
      const inner = subfolder.path !== '';
      const subKey = subfolderKey(folder.importId, subfolder.path);
      const subOpen = !inner || isSwitched(subKey);
      if (inner) {
        rows.push({
          kind: 'subfolder',
          key: subKey,
          folder,
          path: subfolder.path,
          files: subfolder.files,
          open: subOpen,
        });
      }
      if (!subOpen) continue;
      const depth = inner ? 2 : 1;
      const all = folders.showAll.includes(subKey);
      const shown = all ? subfolder.files : subfolder.files.slice(0, shownPerFolder);
      for (const file of shown) rows.push({ kind: 'file', key: file.id, file, depth, trail: null });
      if (subfolder.files.length > shownPerFolder) {
        rows.push({
          kind: 'more',
          key: `more:${subKey}`,
          path: subKey,
          total: subfolder.files.length,
          all,
          depth,
        });
      }
    }
  }
  return { narrowed, count: items.length, rows };
}

export const withFilters = (
  search: ClientFileListSearch,
  values: ListFilterValues<ClientFileFilterKey>
): ClientFileListSearch => ({
  ...search,
  ...(clientFileFilters(search).searchOf(values) as Pick<ClientFileListSearch, 'type' | 'added'>),
});
