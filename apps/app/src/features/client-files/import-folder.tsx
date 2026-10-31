import { Button } from '@ssm-usor/ui/components/button';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Download, FileArchive, Folder } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { getClientFileDownload } from '@/api/generated/api';
import { filesLabel, photosLabel } from '@/features/imports/import-format';
import { saveFile } from '@/lib/save-file';

import { type ClientFile, formatFileSize, formatUploadDate } from './client-file-format';
import { zipFiles } from './zip-files';

type Folder = { path: string; files: ClientFile[] };

const byName = new Intl.Collator('ro', { numeric: true });

function foldersOf(files: ClientFile[]) {
  const folders = new Map<string, ClientFile[]>();
  for (const file of files) {
    const path = file.importPath ?? '';
    folders.set(path, [...(folders.get(path) ?? []), file]);
  }
  return [...folders.entries()]
    .map(([path, list]): Folder => ({
      path,
      files: list.sort((a, b) => byName.compare(a.name, b.name)),
    }))
    .sort((a, b) => byName.compare(a.path, b.path));
}

const bytesOf = (files: ClientFile[]) => files.reduce((total, file) => total + file.sizeBytes, 0);

const shownPerFolder = 5;

const kinds = {
  client: {
    title: (date: string, count: number) => `Dosar importat pe ${date} · ${filesLabel(count)}`,
    description: 'Fișierele din care a fost creat clientul, în folderele în care au fost încărcate',
    toggle: (open: boolean) => (open ? 'Restrânge dosarul importat' : 'Deschide dosarul importat'),
    zip: 'Descarcă tot dosarul (ZIP)',
    zipName: (date: string) => `Dosar importat ${date}.zip`,
    openAtFirst: false,
  },
  employee: {
    title: (date: string, count: number) => `Fișe importate pe ${date} · ${photosLabel(count)}`,
    description:
      'Fotografiile din care au fost transcrise instruirile. Originalele pe hârtie rămân la client.',
    toggle: (open: boolean) => (open ? 'Restrânge fișele importate' : 'Deschide fișele importate'),
    zip: 'Descarcă fișele (ZIP)',
    zipName: (date: string) => `Fișe importate ${date}.zip`,
    openAtFirst: true,
  },
  sheets: {
    title: (date: string, count: number) => `Fișe importate pe ${date} · ${filesLabel(count)}`,
    description:
      'Fișele scanate din care au fost transcrise instruirile. Fiecare angajat are la fișierele sale doar paginile lui.',
    toggle: (open: boolean) => (open ? 'Restrânge fișele importate' : 'Deschide fișele importate'),
    zip: 'Descarcă fișele (ZIP)',
    zipName: (date: string) => `Fișe importate ${date}.zip`,
    openAtFirst: false,
  },
} as const;

export function ImportFolderRows({
  clientId,
  kind,
  files,
  renderFile,
}: {
  clientId: string;
  kind: keyof typeof kinds;
  files: ClientFile[];
  renderFile: (file: ClientFile, depth: number) => ReactNode;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const text = kinds[kind];
  const [open, setOpen] = useState<boolean>(text.openAtFirst);
  const [openFolders, setOpenFolders] = useState<string[]>([]);
  const [showAll, setShowAll] = useState<string[]>([]);
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const first = files.reduce((earliest, file) =>
    file.createdAt < earliest.createdAt ? file : earliest
  );
  const date = formatUploadDate(first.createdAt);
  const uploader = first.uploadedBy?.fullName ?? null;
  const folders = foldersOf(files);

  async function downloadAll() {
    setFailed(false);
    setZipping({ done: 0, total: files.length });
    try {
      const blob = await zipFiles(
        files.map((file) => ({
          path: [file.importPath, file.originalFileName].filter(Boolean).join('/'),
          load: async () => {
            const link = await getClientFileDownload(clientId, file.id, apiRequest);
            const response = await fetch(link.url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return new Uint8Array(await response.arrayBuffer());
          },
        })),
        (done) => setZipping({ done, total: files.length })
      );
      saveFile(blob, text.zipName(date));
    } catch {
      setFailed(true);
    } finally {
      setZipping(null);
    }
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((each) => each !== value) : [...list, value];

  return (
    <>
      <TableRow
        data-testid="client-import-folder"
        className="bg-muted/40 hover:bg-muted/60 max-sm:grid max-sm:grid-cols-1 max-sm:gap-y-2 max-sm:py-3"
      >
        <TableCell className="whitespace-normal max-sm:py-0">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="-my-1 size-7"
              aria-expanded={open}
              aria-label={text.toggle(open)}
              data-testid="client-import-folder-toggle"
              onClick={() => setOpen(!open)}
            >
              {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </Button>
            <FileArchive
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="grid min-w-0 gap-0.5">
              <span className="font-medium" data-testid="client-import-folder-title">
                {text.title(date, files.length)}
              </span>
              <span className="text-xs text-muted-foreground">{text.description}</span>
              {failed && (
                <span role="alert" className="text-xs text-destructive">
                  Arhiva nu a putut fi făcută. Încearcă din nou.
                </span>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right align-top tabular-nums max-sm:hidden">
          {formatFileSize(bytesOf(files))}
        </TableCell>
        <TableCell className="align-top max-sm:hidden">
          <span className="tabular-nums">{date}</span>
          {uploader && (
            <span className="mt-0.5 block max-w-48 truncate text-xs text-muted-foreground">
              {uploader}
            </span>
          )}
        </TableCell>
        <TableCell className="align-top max-sm:py-0 max-sm:pl-17">
          <Button
            variant="outline"
            size="sm"
            data-testid="client-import-folder-zip"
            disabled={zipping !== null}
            onClick={() => void downloadAll()}
          >
            <Download aria-hidden="true" />
            {zipping ? `Se pregătește: ${zipping.done} din ${zipping.total}` : text.zip}
          </Button>
        </TableCell>
      </TableRow>
      {open &&
        folders.map((folder) => {
          const isOpen = folder.path === '' || openFolders.includes(folder.path);
          const all = showAll.includes(folder.path);
          const shown = all ? folder.files : folder.files.slice(0, shownPerFolder);
          const depth = folder.path === '' ? 1 : 2;
          return [
            folder.path !== '' && (
              <TableRow
                key={`folder-${folder.path}`}
                data-testid="client-import-subfolder"
                className="max-sm:grid max-sm:grid-cols-1"
              >
                <TableCell className="whitespace-normal">
                  <div className="flex min-w-0 items-center gap-2 pl-6">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="-my-1 size-7"
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen
                          ? `Restrânge folderul ${folder.path}`
                          : `Deschide folderul ${folder.path}`
                      }
                      onClick={() => setOpenFolders(toggle(openFolders, folder.path))}
                    >
                      {isOpen ? (
                        <ChevronDown aria-hidden="true" />
                      ) : (
                        <ChevronRight aria-hidden="true" />
                      )}
                    </Button>
                    <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 font-medium wrap-break-word">{folder.path}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {filesLabel(folder.files.length)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground tabular-nums max-sm:hidden">
                  {formatFileSize(bytesOf(folder.files))}
                </TableCell>
                <TableCell className="max-sm:hidden" />
                <TableCell className="max-sm:hidden" />
              </TableRow>
            ),
            ...(isOpen ? shown.map((file) => renderFile(file, depth)) : []),
            isOpen && folder.files.length > shownPerFolder && (
              <TableRow key={`more-${folder.path}`}>
                <TableCell colSpan={4} className={cn(depth === 2 ? 'pl-14' : 'pl-8')}>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setShowAll(toggle(showAll, folder.path))}
                  >
                    {all ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
                    {all ? 'Arată mai puține' : `Arată toate cele ${folder.files.length}`}
                  </Button>
                </TableCell>
              </TableRow>
            ),
          ];
        })}
    </>
  );
}
