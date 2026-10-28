import { formatCui, importLimits } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Progress } from '@ssm-usor/ui/components/progress';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useBlocker } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  FileText,
  FileUp,
  FileX,
  Folder,
  FolderUp,
  Image as ImageIcon,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react';
import { type DragEvent, type FormEvent, type ReactNode, useRef, useState } from 'react';

import { Notice } from '@/components/notice';
import { hasFiles, useRefuseStrayDrops } from '@/features/client-files/use-file-drop';

import { filesLabel, formatFileSize, photosLabel } from './import-format';
import { pickedFromDrop, pickedFromInput } from './picked-files';
import {
  addToSelection,
  emptySelection,
  type PickedFile,
  removeFiles,
  removeGroup,
  type SelectedFile,
  type Selection,
  type SelectionRow,
  selectionRows,
  selectionTotals,
  type SetAsideFile,
} from './upload-selection';
import { type UploadPhase, useImportUpload } from './use-import-upload';

export type ImportClient = { id: string; legalName: string; cui: string; vatPayer: boolean };

export function ImportUploadDialog({
  open,
  client,
  onClose,
  onStarted,
}: {
  open: boolean;
  client?: ImportClient;
  onClose: () => void;
  onStarted: (importId: string) => void;
}) {
  return open ? <UploadForm client={client} onClose={onClose} onStarted={onStarted} /> : null;
}

const formats = ['PDF', 'DOC', 'DOCX', 'JPG', 'PNG', 'HEIC'];

const busySteps = new Set<UploadPhase['step']>(['hashing', 'uploading', 'starting']);

const heldSteps = new Set<UploadPhase['step']>(['stalled', 'unstarted', 'empty']);

function UploadForm({
  client,
  onClose,
  onStarted,
}: {
  client: ImportClient | undefined;
  onClose: () => void;
  onStarted: (importId: string) => void;
}) {
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [opening, setOpening] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const openingImport = useRef(false);
  const { phase, upload, retry, continueWithout, abandon } = useImportUpload(client?.id, (id) => {
    openingImport.current = true;
    onStarted(id);
  });
  const busy = busySteps.has(phase.step);
  const choosing = phase.step === 'choosing' || phase.step === 'failed';
  const totals = selectionTotals(selection);
  const over = totals.overFiles || totals.overBytes;
  useRefuseStrayDrops();

  async function add(picked: Promise<PickedFile[]> | PickedFile[]) {
    setOpening(true);
    try {
      const files = await picked;
      setSelection(await addToSelection(selection, files));
    } finally {
      setOpening(false);
    }
  }

  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!opening) void add(pickedFromDrop(event.dataTransfer));
    },
  };

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (totals.count === 0 || over || opening) return;
    void upload(selection.files);
  }

  // No closing while files go up: the import would stay half uploaded.
  const holdOpen = (event: Event) => {
    if (busy) event.preventDefault();
  };

  useBlocker({
    shouldBlockFn: () => {
      if (openingImport.current || (!busy && !heldSteps.has(phase.step))) return false;
      if (
        busy &&
        !window.confirm('Fișierele încă se încarcă. Dacă pleci acum, renunți la import. Pleci?')
      ) {
        return true;
      }
      leave();
      return false;
    },
    enableBeforeUnload: () => busy,
  });

  // Elsewhere an import still uploading can only be abandoned, so leaving it here ends it.
  function leave() {
    if (busy || heldSteps.has(phase.step)) abandon();
    onClose();
  }

  const archives = selection.archives.filter((name) => !dismissed.includes(name));
  const brokenZips = selection.brokenZips.filter((name) => !dismissed.includes(name));

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && leave()}>
      <DialogContent
        data-testid="import-upload-dialog"
        className="sm:max-w-[620px]"
        showCloseButton={!busy}
        onEscapeKeyDown={holdOpen}
        onInteractOutside={holdOpen}
      >
        <form onSubmit={onSubmit} aria-busy={busy} noValidate>
          <DialogHeader>
            <DialogTitle>
              {client ? 'Completează din documentație' : 'Client nou din documente'}
            </DialogTitle>
            <DialogDescription>
              Încarcă documentația SSM și PSI a unei singure firme. O citim și îți propunem datele
              clientului. Nu salvăm nimic până nu le verifici.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4">
            <Notice variant="info" data-testid="import-upload-one-client">
              {client ? (
                <>
                  <strong className="font-semibold">
                    Documentele trebuie să fie ale firmei {client.legalName} (CUI{' '}
                    {formatCui(client.cui, client.vatPayer)}).
                  </strong>{' '}
                  Dacă sunt ale altei firme, nu le citim.
                </>
              ) : (
                <>
                  <strong className="font-semibold">Un import creează un singur client.</strong>{' '}
                  Dacă printre documente apare și altă firmă, îți spunem, iar documentele ei le
                  încarci separat.
                </>
              )}
            </Notice>
            {choosing && (
              <div
                data-testid="import-upload-drop"
                className={cn(
                  'grid justify-items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-info-border bg-muted/30 p-5 text-center transition-colors',
                  dragging && 'border-primary bg-primary/5'
                )}
                {...dropHandlers}
              >
                {opening ? (
                  <LoaderCircle
                    className="size-6 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
                <p className="text-sm font-medium">
                  {opening
                    ? 'Deschidem fișierele…'
                    : 'Trage aici fișierele, un folder sau o arhivă ZIP'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    data-testid="import-choose-files"
                    onClick={() => filesInput.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Alege fișiere
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    data-testid="import-choose-folder"
                    onClick={() => folderInput.current?.click()}
                  >
                    <FolderUp aria-hidden="true" />
                    Alege un folder
                  </Button>
                </div>
                <div
                  className="flex flex-wrap justify-center gap-1.5"
                  aria-label="Fișiere pe care le citim"
                >
                  {formats.map((format) => (
                    <span
                      key={format}
                      className="rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    >
                      {format}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Arhivele ZIP le deschidem aici, înainte de încărcare.
                </p>
                <input
                  ref={filesInput}
                  type="file"
                  multiple
                  className="hidden"
                  data-testid="import-files-input"
                  onChange={(event) => {
                    void add(pickedFromInput(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                <input
                  ref={folderInput}
                  type="file"
                  className="hidden"
                  data-testid="import-folder-input"
                  {...{ webkitdirectory: '' }}
                  onChange={(event) => {
                    void add(pickedFromInput(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </div>
            )}
            {archives.map((name) => (
              <Notice
                key={name}
                variant="warning"
                data-testid="import-archive-refused"
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Închide mesajul"
                    onClick={() => setDismissed((current) => [...current, name])}
                  >
                    <X aria-hidden="true" />
                  </Button>
                }
              >
                <strong className="font-semibold">{name}</strong> nu se poate deschide aici.
                Dezarhivează-l și trage folderul aici.
              </Notice>
            ))}
            {brokenZips.map((name) => (
              <Notice
                key={name}
                variant="warning"
                data-testid="import-zip-broken"
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Închide mesajul"
                    onClick={() => setDismissed((current) => [...current, name])}
                  >
                    <X aria-hidden="true" />
                  </Button>
                }
              >
                <strong className="font-semibold">{name}</strong> nu s-a putut deschide.
                Dezarhivează-l și trage folderul aici.
              </Notice>
            ))}
            {over && (
              <Notice variant="destructive" data-testid="import-upload-over">
                Un import ia cel mult {importLimits.files} de fișiere și 100 MB. Ai ales{' '}
                {filesLabel(totals.count)}, {formatFileSize(totals.bytes)}. Scoate câteva și încarcă
                restul într-un import separat.
              </Notice>
            )}
            {totals.count > 0 && (
              <ChosenList
                selection={selection}
                removable={choosing}
                onRemoveGroup={(group) => setSelection(removeGroup(selection, group))}
                onRemoveFiles={(keys) => setSelection(removeFiles(selection, keys))}
              />
            )}
            <SetAsideList setAside={selection.setAside} systemFiles={selection.systemFiles} />
            <UploadProgress phase={phase} onRetry={retry} onContinue={continueWithout} />
          </DialogBody>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" disabled={busy} onClick={leave}>
              Renunță
            </Button>
            <Button
              type="submit"
              data-testid="import-upload-submit"
              disabled={!choosing || totals.count === 0 || over || opening}
            >
              {busy ? 'Se încarcă…' : 'Încarcă și citește'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadProgress({
  phase,
  onRetry,
  onContinue,
}: {
  phase: UploadPhase;
  onRetry: () => void;
  onContinue: () => void;
}) {
  if (phase.step === 'failed') {
    return (
      <Notice variant="destructive" data-testid="import-upload-error">
        {phase.error}
      </Notice>
    );
  }
  if (phase.step === 'stalled') {
    return (
      <Notice
        variant="destructive"
        data-testid="import-upload-stalled"
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Încearcă din nou
            </Button>
            {phase.uploaded > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={onContinue}>
                Citește fără ele
              </Button>
            )}
          </div>
        }
      >
        {phase.uploaded === 0
          ? 'Niciun fișier nu s-a încărcat. Verifică conexiunea și încearcă din nou.'
          : phase.failed === 1
            ? 'Un fișier nu s-a încărcat.'
            : `${filesLabel(phase.failed)} nu s-au încărcat.`}
      </Notice>
    );
  }
  if (phase.step === 'unstarted') {
    return (
      <Notice
        variant="destructive"
        data-testid="import-upload-stalled"
        action={
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            Încearcă din nou
          </Button>
        }
      >
        {phase.error}
      </Notice>
    );
  }
  if (phase.step === 'empty') {
    return (
      <Notice variant="destructive" data-testid="import-upload-empty">
        Niciun fișier nu a ajuns la noi, așa că nu avem ce citi. Renunță la import și încarcă
        documentele din nou.
      </Notice>
    );
  }
  if (phase.step === 'choosing') return null;
  const [label, value] =
    phase.step === 'hashing'
      ? [`Pregătim fișierele: ${phase.done} din ${phase.total}`, (phase.done / phase.total) * 100]
      : phase.step === 'uploading'
        ? [
            `Se încarcă: ${formatFileSize(phase.sentBytes)} din ${formatFileSize(phase.totalBytes)}`,
            (phase.sentBytes / Math.max(1, phase.totalBytes)) * 100,
          ]
        : ['Pornim citirea…', 100];
  return (
    <div className="grid gap-2" data-testid="import-upload-progress" role="status">
      <p className="text-sm tabular-nums">{label}</p>
      <Progress value={value} className="h-1.5" aria-label="Încărcarea fișierelor" />
    </div>
  );
}

const zipLabel = (count: number) => `Deschisă: ${filesLabel(count)}`;
const folderLabel = (count: number) => `Folder: ${filesLabel(count)}`;

const kindLabel = (file: SelectedFile) =>
  file.mimeType === 'application/pdf'
    ? 'PDF'
    : file.mimeType.startsWith('image/')
      ? 'Fotografie'
      : 'Word';

function ChosenList({
  selection,
  removable,
  onRemoveGroup,
  onRemoveFiles,
}: {
  selection: Selection;
  removable: boolean;
  onRemoveGroup: (group: string) => void;
  onRemoveFiles: (keys: string[]) => void;
}) {
  const totals = selectionTotals(selection);
  const rows = selectionRows(selection.files);
  return (
    <section
      aria-labelledby="import-chosen-heading"
      data-testid="import-chosen"
      className="overflow-hidden rounded-lg border"
    >
      <div className="flex justify-between gap-3 border-b bg-muted/40 px-3 py-2.5 text-sm">
        <span id="import-chosen-heading" className="font-medium">
          {totals.count === 1 ? 'Un fișier ales' : `${filesLabel(totals.count)} alese`}
        </span>
        <span className="text-muted-foreground tabular-nums">{formatFileSize(totals.bytes)}</span>
      </div>
      <ul className="divide-y">
        {rows.map((row) => (
          <ChosenRow
            key={row.kind === 'photos' ? 'photos' : row.group}
            row={row}
            removable={removable}
            onRemove={() =>
              row.kind === 'photos'
                ? onRemoveFiles(row.files.map((file) => file.key))
                : onRemoveGroup(row.group)
            }
          />
        ))}
      </ul>
    </section>
  );
}

function RowShell({
  icon,
  name,
  detail,
  bytes,
  removable,
  removeLabel,
  onRemove,
  children,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  bytes: number;
  removable: boolean;
  removeLabel: string;
  onRemove: () => void;
  children?: ReactNode;
}) {
  return (
    <li data-testid="import-chosen-row" className="grid gap-2 px-3 py-2.5">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto_1.75rem] items-center gap-3">
        {icon}
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted-foreground">{detail}</span>
        </span>
        <span className="text-sm text-muted-foreground tabular-nums">{formatFileSize(bytes)}</span>
        {removable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-7"
            aria-label={removeLabel}
            onClick={onRemove}
          >
            <X aria-hidden="true" />
          </Button>
        ) : (
          <span />
        )}
      </div>
      {children}
    </li>
  );
}

const iconBox = (icon: ReactNode) => (
  <span className="grid size-8 place-items-center rounded-md bg-secondary" aria-hidden="true">
    {icon}
  </span>
);

const shownInFolder = 3;

function ChosenRow({
  row,
  removable,
  onRemove,
}: {
  row: SelectionRow;
  removable: boolean;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (row.kind === 'file') {
    return (
      <RowShell
        icon={iconBox(
          row.file.mimeType.startsWith('image/') ? (
            <ImageIcon className="size-4" />
          ) : (
            <FileText className="size-4" />
          )
        )}
        name={row.file.name}
        detail={kindLabel(row.file)}
        bytes={row.file.size}
        removable={removable}
        removeLabel={`Scoate ${row.file.name}`}
        onRemove={onRemove}
      />
    );
  }
  const bytes = row.files.reduce((total, file) => total + file.size, 0);
  if (row.kind === 'photos') {
    const first = row.files[0]!.name;
    const last = row.files.at(-1)!.name;
    return (
      <RowShell
        icon={<LocalThumb file={row.files[0]!} className="size-8" />}
        name={photosLabel(row.files.length)}
        detail={`${first} până la ${last}`}
        bytes={bytes}
        removable={removable}
        removeLabel={`Scoate cele ${photosLabel(row.files.length)}`}
        onRemove={onRemove}
      >
        <div className="flex flex-wrap gap-1.5 pl-11" aria-label="Fotografiile alese">
          {row.files.map((file) => (
            <LocalThumb key={file.key} file={file} className="size-9" />
          ))}
        </div>
      </RowShell>
    );
  }
  const prefix = `${row.group}/`;
  const shown = expanded ? row.files : row.files.slice(0, shownInFolder);
  return (
    <RowShell
      icon={iconBox(row.zip ? <FileArchive className="size-4" /> : <Folder className="size-4" />)}
      name={row.group}
      detail={row.zip ? zipLabel(row.files.length) : folderLabel(row.files.length)}
      bytes={bytes}
      removable={removable}
      removeLabel={`Scoate ${row.group}`}
      onRemove={onRemove}
    >
      <div
        className="ml-11 grid border-l-2 border-secondary pl-3"
        aria-label={row.zip ? 'Conținutul arhivei' : 'Conținutul folderului'}
      >
        {shown.map((file) => (
          <span key={file.key} className="truncate py-0.5 text-[13px] text-muted-foreground">
            {file.path.startsWith(prefix) ? file.path.slice(prefix.length) : file.path}
          </span>
        ))}
        {row.files.length > shownInFolder && (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="mt-1 w-fit"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
            {expanded ? 'Arată mai puține' : `Arată toate cele ${row.files.length}`}
          </Button>
        )}
      </div>
    </RowShell>
  );
}

// A HEIC photograph has no preview in most browsers until the import turns it into a JPEG.
function LocalThumb({ file, className }: { file: SelectedFile; className: string }) {
  const previewable = file.mimeType === 'image/jpeg' || file.mimeType === 'image/png';
  if (previewable) {
    return (
      <img
        alt=""
        className={cn('shrink-0 rounded-md bg-secondary object-cover', className)}
        ref={(image) => {
          if (!image) return;
          const objectUrl = URL.createObjectURL(file.blob);
          image.src = objectUrl;
          return () => URL.revokeObjectURL(objectUrl);
        }}
      />
    );
  }
  return (
    <span
      className={cn('grid shrink-0 place-items-center rounded-md bg-secondary', className)}
      aria-hidden="true"
    >
      <ImageIcon className="size-4 text-muted-foreground" />
    </span>
  );
}

const setAsideReasons: Record<SetAsideFile['reason'], string> = {
  unsupported: 'tip de fișier pe care nu-l citim',
  too_large: 'are peste 20 MB',
  empty: 'fișierul e gol',
  name_too_long: 'numele are peste 255 de caractere',
};

function SetAsideList({
  setAside,
  systemFiles,
}: {
  setAside: SetAsideFile[];
  systemFiles: string[];
}) {
  if (setAside.length === 0 && systemFiles.length === 0) return null;
  const systemNames = [
    ...new Set(
      systemFiles.map((path) =>
        path.split('/').includes('__MACOSX') ? '__MACOSX' : path.split('/').at(-1)!
      )
    ),
  ];
  return (
    <section
      aria-labelledby="import-set-aside-heading"
      data-testid="import-set-aside"
      className="grid gap-1.5 rounded-lg border-[1.5px] border-dashed bg-muted/30 px-3 py-2.5"
    >
      <h3 id="import-set-aside-heading" className="text-sm font-medium">
        Puse deoparte, nu se încarcă
      </h3>
      <ul className="grid gap-1.5">
        {setAside.map((file) => (
          <li
            key={file.key}
            data-testid="import-set-aside-row"
            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-[13px] leading-snug text-muted-foreground"
          >
            <FileX className="mt-0.5 size-4" aria-hidden="true" />
            <span className="wrap-anywhere">
              <span className="font-medium text-foreground">{file.path}</span>,{' '}
              {setAsideReasons[file.reason]}
            </span>
          </li>
        ))}
        {systemFiles.length > 0 && (
          <li
            data-testid="import-system-files"
            className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 text-[13px] leading-snug text-muted-foreground"
          >
            <FileX className="mt-0.5 size-4" aria-hidden="true" />
            <span>
              <span className="font-medium text-foreground">{systemNames.join(', ')}</span>,{' '}
              {systemFiles.length === 1
                ? 'un fișier de sistem'
                : `${filesLabel(systemFiles.length)} de sistem`}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
