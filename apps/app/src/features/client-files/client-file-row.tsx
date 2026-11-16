import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  FolderArchive,
  FolderClosed,
  FolderOpen,
  LoaderCircle,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { type MouseEvent, type ReactNode, useState } from 'react';

import { replayMask } from '@/app/observability/replay-masking';
import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { roCount } from '@/features/employees/employee-format';

import { useClientFileList } from './client-file-context';
import {
  type ClientFile,
  fileCountLabel,
  fileKind,
  formatFileSize,
  formatUploadDate,
} from './client-file-format';
import {
  type ClientFileRow,
  folderBytes,
  folderTexts,
  type ImportFolder,
  pathLabel,
} from './client-file-list';
import type { FolderZips } from './import-folder';

export type FileAnchor = {
  href: string;
  target: string | undefined;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

const unreadReason = (reason: string) =>
  reason.charAt(0).toLowerCase() + reason.slice(1).replace(/\.$/, '');

// Each nesting level lines a row's name up under the name of the row it sits in.
const depthIndent = (depth: number) =>
  depth > 0 ? { paddingLeft: `${depth * 3.375}rem` } : undefined;

function ToggleButton({
  open,
  label,
  onToggle,
  testId,
}: {
  open: boolean;
  label: string;
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="-my-1 -ml-1.5 size-7 shrink-0"
      aria-expanded={open}
      aria-label={label}
      data-testid={testId}
      onClick={onToggle}
    >
      {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  );
}

// A long note opens in place, so it reads in full without the edit dialog, which only its
// uploader and owners get.
function FileFacts({
  trail,
  ownersOnly,
  note,
}: {
  trail: string | null;
  ownersOnly: boolean;
  note: string | null;
}) {
  const [open, setOpen] = useState(false);
  const parts: ReactNode[] = [
    trail && <span key="trail">{trail}</span>,
    ownersOnly && (
      <span
        key="owners"
        data-testid="client-file-owners-only"
        className="inline-flex items-center gap-1 align-[-1px]"
      >
        <Lock aria-hidden="true" className="size-3" />
        Doar admini
      </span>
    ),
    note && (
      <span key="note" data-testid="client-file-row-note" className="whitespace-pre-line">
        {note}
      </span>
    ),
  ].filter(Boolean);
  if (parts.length === 0) return null;
  const line = parts.flatMap((part, index) => (index === 0 ? [part] : [' · ', part]));
  const text = cn('text-left wrap-anywhere', !open && 'line-clamp-1');
  if (!note) {
    return (
      <CellNote data-testid="client-file-facts" className={text}>
        {line}
      </CellNote>
    );
  }
  return (
    <CellNote data-testid="client-file-facts">
      <button
        type="button"
        aria-expanded={open}
        data-testid="client-file-facts-toggle"
        className={cn(
          text,
          'w-full cursor-pointer rounded-sm outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50'
        )}
        onClick={() => setOpen(!open)}
      >
        {line}
        <span className="sr-only"> Arată toată nota</span>
      </button>
    </CellNote>
  );
}

function FileNameCell({
  file,
  depth,
  trail,
  showOwnersOnly,
  open,
}: {
  file: ClientFile;
  depth: number;
  trail: string | null;
  showOwnersOnly: boolean;
  open: FileAnchor;
}) {
  return (
    <div className="min-w-0" style={depthIndent(depth)}>
      <a
        data-testid="client-file-open"
        className="rounded-sm font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
        {...open}
      >
        {file.name}
      </a>
      <FileFacts trail={trail} ownersOnly={showOwnersOnly && file.ownersOnly} note={file.note} />
      {file.importRead === false && (
        <span
          data-testid="client-file-unread"
          className="mt-1 block text-xs font-medium text-warning-foreground"
        >
          {file.importReason
            ? `Necitit la import: ${unreadReason(file.importReason)}`
            : 'Necitit la import'}
        </span>
      )}
    </div>
  );
}

function FolderNameCell({
  folder,
  open,
  onToggle,
  zips,
}: {
  folder: ImportFolder;
  open: boolean;
  onToggle: () => void;
  zips: FolderZips;
}) {
  const inner = folder.subfolders.filter((subfolder) => subfolder.path !== '').length;
  const progress = zips.progress(folder.importId);
  return (
    <div className="flex min-w-0 items-start gap-2">
      <ToggleButton
        open={open}
        label={`${open ? 'Restrânge' : 'Deschide'} ${folder.title}`}
        onToggle={onToggle}
        testId="client-import-folder-toggle"
      />
      <FolderArchive className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <span className="font-medium" data-testid="client-import-folder-title">
          {folder.title}
        </span>
        <CellNote>
          {fileCountLabel(folder.files.length)}
          {inner > 0 &&
            (inner === 1 ? ' într-un folder' : ` în ${roCount(inner, 'folder', 'foldere')}`)}
        </CellNote>
        {progress && (
          <CellNote className="mt-1" aria-live="polite">
            Se pregătește arhiva: {progress.done} din {progress.total}
          </CellNote>
        )}
        {zips.failed(folder.importId) && (
          <span role="alert" className="mt-1 block text-xs text-destructive">
            Arhiva nu a putut fi făcută. Încearcă din nou.
          </span>
        )}
      </div>
    </div>
  );
}

function SubfolderNameCell({
  path,
  count,
  open,
  onToggle,
}: {
  path: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = open ? FolderOpen : FolderClosed;
  return (
    <div className="flex min-w-0 items-start gap-2" style={depthIndent(1)}>
      <ToggleButton
        open={open}
        label={`${open ? 'Restrânge' : 'Deschide'} folderul ${pathLabel(path)}`}
        onToggle={onToggle}
      />
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <span className="font-medium wrap-anywhere">{pathLabel(path)}</span>
        <CellNote>{fileCountLabel(count)}</CellNote>
      </div>
    </div>
  );
}

function MoreButton({
  depth,
  total,
  all,
  onToggle,
}: {
  depth: number;
  total: number;
  all: boolean;
  onToggle: () => void;
}) {
  return (
    <div style={depthIndent(depth)}>
      <Button
        variant="ghost"
        size="xs"
        className="-ml-2"
        data-testid="client-import-folder-more"
        onClick={onToggle}
      >
        {all ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
        {all ? 'Arată mai puține' : `Arată toate cele ${total}`}
      </Button>
    </div>
  );
}

const actionsRow = 'flex items-center justify-end gap-1';
// Keeps the download buttons in one column when a row has no menu.
const menuSpace = <span aria-hidden="true" className="size-9 shrink-0" />;

function FileActions({
  file,
  download,
  changeable,
  canSwitch,
  switching,
  onRename,
  onDelete,
  onOwnersOnly,
}: {
  file: ClientFile;
  download: FileAnchor;
  changeable: boolean;
  canSwitch: boolean;
  switching: boolean;
  onRename: () => void;
  onDelete: () => void;
  onOwnersOnly: (ownersOnly: boolean) => void;
}) {
  return (
    <div className={actionsRow}>
      <Button asChild variant="ghost" size="icon">
        <a data-testid="client-file-download" aria-label={`Descarcă ${file.name}`} {...download}>
          <Download aria-hidden="true" />
        </a>
      </Button>
      {changeable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="client-file-actions"
              aria-label={`Acțiuni pentru ${file.name}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem data-testid="client-file-rename" onSelect={onRename}>
              <Pencil aria-hidden="true" />
              Modifică numele și nota
            </DropdownMenuItem>
            {canSwitch && (
              <DropdownMenuCheckboxItem
                data-testid="client-file-owners-only-switch"
                checked={file.ownersOnly}
                disabled={switching}
                onCheckedChange={(checked) => onOwnersOnly(checked === true)}
              >
                Doar pentru admini
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-testid="client-file-delete"
              variant="destructive"
              onSelect={onDelete}
            >
              <Trash2 aria-hidden="true" />
              Șterge
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        menuSpace
      )}
    </div>
  );
}

function FolderActions({
  folder,
  clientId,
  zips,
  zipLabel,
}: {
  folder: ImportFolder;
  clientId: string;
  zips: FolderZips;
  zipLabel: string;
}) {
  const zipping = zips.progress(folder.importId) !== undefined;
  const fromEmployees = folder.first.importKind === 'employees';
  return (
    <div className={actionsRow}>
      <Button
        variant="ghost"
        size="icon"
        data-testid="client-import-folder-zip"
        aria-label={zipLabel}
        disabled={zipping}
        onClick={() => void zips.download(folder)}
      >
        {zipping ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Download aria-hidden="true" />
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            data-testid="client-import-folder-actions"
            aria-label={`Acțiuni pentru ${folder.title}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            {fromEmployees ? (
              <Link
                to="/clienti/$clientId/angajati/import/$importId"
                params={{ clientId, importId: folder.importId }}
                state={openedHere}
                data-testid="client-import-folder-view"
              >
                <ExternalLink aria-hidden="true" />
                Vezi importul
              </Link>
            ) : (
              <Link
                to="/clienti/import/$importId"
                params={{ importId: folder.importId }}
                state={openedHere}
                data-testid="client-import-folder-view"
              >
                <ExternalLink aria-hidden="true" />
                Vezi importul
              </Link>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Uploaded({ file }: { file: ClientFile }) {
  const uploader = file.uploadedBy ? (file.uploadedBy.fullName ?? 'Fără nume') : null;
  return (
    <>
      <span className="tabular-nums">{formatUploadDate(file.createdAt)}</span>
      {uploader && (
        <CellNote className="max-w-40 truncate" {...replayMask}>
          {uploader}
        </CellNote>
      )}
    </>
  );
}

export function NameCell({ row }: { row: ClientFileRow }) {
  const list = useClientFileList();
  if (row.kind === 'file') {
    return (
      <FileNameCell
        file={row.file}
        depth={row.depth}
        trail={row.trail}
        showOwnersOnly={list.showOwnersOnly}
        open={list.open(row.file)}
      />
    );
  }
  if (row.kind === 'folder') {
    return (
      <FolderNameCell
        folder={row.folder}
        open={row.open}
        zips={list.zips}
        onToggle={() => list.onToggle(row.key)}
      />
    );
  }
  if (row.kind === 'subfolder') {
    return (
      <SubfolderNameCell
        path={row.path}
        count={row.files.length}
        open={row.open}
        onToggle={() => list.onToggle(row.key)}
      />
    );
  }
  return (
    <MoreButton
      depth={row.depth}
      total={row.total}
      all={row.all}
      onToggle={() => list.onShowAll(row.path)}
    />
  );
}

export function TypeCell({ row }: { row: ClientFileRow }) {
  if (row.kind === 'more') return null;
  const [label, bytes] =
    row.kind === 'file'
      ? [fileKind(row.file.mimeType).label, row.file.sizeBytes]
      : row.kind === 'folder'
        ? ['Dosar', row.folder.bytes]
        : ['Folder', folderBytes(row.files)];
  return (
    <>
      <span data-testid="client-file-kind">{label}</span>
      <CellNote className="tabular-nums">{formatFileSize(bytes)}</CellNote>
    </>
  );
}

export function UploadedCell({ row }: { row: ClientFileRow }) {
  if (row.kind === 'file') return <Uploaded file={row.file} />;
  if (row.kind === 'folder') return <Uploaded file={row.folder.first} />;
  return null;
}

export function ActionsCell({ row }: { row: ClientFileRow }) {
  const list = useClientFileList();
  if (row.kind === 'file') {
    const { file } = row;
    return (
      <FileActions
        file={file}
        download={list.download(file)}
        changeable={file.canChange && !list.readOnly}
        canSwitch={list.canSwitch}
        switching={list.switching.includes(file.id)}
        onRename={() => list.onRename(file)}
        onDelete={() => list.onDelete(file)}
        onOwnersOnly={(ownersOnly) => list.onOwnersOnly(file, ownersOnly)}
      />
    );
  }
  if (row.kind === 'folder') {
    return (
      <FolderActions
        folder={row.folder}
        clientId={list.clientId}
        zips={list.zips}
        zipLabel={folderTexts[row.folder.kind].zip}
      />
    );
  }
  return null;
}
