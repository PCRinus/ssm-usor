import { importLimits } from '@ssm-usor/contracts';
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
  BriefcaseBusiness,
  Camera,
  FileText,
  FolderUp,
  LoaderCircle,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';

import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { useRefuseStrayDrops } from '@/features/client-files/use-file-drop';
import { roCount } from '@/features/employees/employee-format';
import { useJobPositionOptions } from '@/features/job-positions/use-job-position-options';

import { formatFileSize, photosLabel } from '../import-format';
import { LocalThumb, SetAsideList, UploadProgress } from '../import-upload-dialog';
import { LocalPhotoView, PhotoPreviewDialog, type PreviewPhoto } from '../photo-preview-dialog';
import { pickedFromInput } from '../picked-files';
import {
  emptySelection,
  mergeSelection,
  openPicked,
  type PickedFile,
  removeFiles,
  type SelectedFile,
  type Selection,
  selectionTotals,
  type SetAsideFile,
} from '../upload-selection';
import { useImportDrop } from '../use-import-drop';
import { busySteps, heldSteps, useImportUpload } from '../use-import-upload';
import { type FoundBatch, foundIn, foundOn, useFoundSheets } from './found-sheets';
import { FoundSheetView, FoundStrip, FoundThumb } from './found-strip';

const limits = importLimits.employees;
const formats = ['JPG', 'PNG', 'HEIC', 'PDF scanat'];
const shownThumbs = 15;
// Far below the caps the meters only repeat the count and size the card already shows.
const metersFrom = 0.8;

const setAsideReasons: Record<SetAsideFile['reason'], string> = {
  unsupported: 'nu e o fotografie sau o scanare',
  too_large: 'are peste 25 MB, cât primim pentru un fișier. Împarte-l în fișiere mai mici',
  empty: 'fișierul e gol',
  name_too_long: 'numele are peste 255 de caractere',
};

const gigabytes = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });
const sizeLabel = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${gigabytes.format(bytes / 1024 ** 3)} GB` : formatFileSize(bytes);

const pagesAndPhotos = (count: number) =>
  count === 1 ? 'o fotografie sau pagină' : roCount(count, '', 'fotografii și pagini');

const listJoin = (parts: string[]) =>
  parts.length > 1 ? `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}` : (parts[0] ?? '');

export type EmployeeUploadClient = { id: string; legalName: string };

export function EmployeeUploadDialog({
  open,
  client,
  withFound = false,
  onClose,
  onStarted,
  onImportDocumentation,
}: {
  open: boolean;
  client: EmployeeUploadClient;
  withFound?: boolean;
  onClose: () => void;
  onStarted: (importId: string) => void;
  onImportDocumentation?: () => void;
}) {
  return open ? (
    <UploadForm
      client={client}
      withFound={withFound}
      onClose={onClose}
      onStarted={onStarted}
      onImportDocumentation={onImportDocumentation}
    />
  ) : null;
}

function UploadForm({
  client,
  withFound,
  onClose,
  onStarted,
  onImportDocumentation,
}: {
  client: EmployeeUploadClient;
  withFound: boolean;
  onClose: () => void;
  onStarted: (importId: string) => void;
  onImportDocumentation?: () => void;
}) {
  const [selection, setSelection] = useState<Selection>(emptySelection);
  const [added, setAdded] = useState<string[] | null>(withFound ? null : []);
  const [opening, setOpening] = useState(false);
  const [unreadable, setUnreadable] = useState(false);
  const [noPostsDismissed, setNoPostsDismissed] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const openingImport = useRef(false);
  const found = useFoundSheets(client.id);
  const { session } = useAuth();
  const positions = useJobPositionOptions(client.id, session?.user.id ?? '');
  const batches = found.data?.items ?? [];
  // `null` until the list arrives, when a dialog opened with them takes every batch.
  const addedIds = added ?? batches.flatMap((batch) => batch.sheets.map((sheet) => sheet.id));
  const addedSheets = batches.flatMap((batch) =>
    batch.sheets.filter((sheet) => addedIds.includes(sheet.id))
  );
  const { phase, upload, retry, continueWithout, abandon } = useImportUpload(
    client.id,
    (id) => {
      openingImport.current = true;
      onStarted(id);
    },
    'employees'
  );
  const busy = busySteps.has(phase.step);
  const choosing = phase.step === 'choosing' || phase.step === 'failed';
  const totals = selectionTotals(selection, 'employees', {
    count: addedSheets.length,
    pages: addedSheets.length,
    bytes: addedSheets.reduce((total, sheet) => total + sheet.sizeBytes, 0),
  });
  const over = totals.overFiles || totals.overBytes;
  const bytesLabel = `${totals.estimated ? 'cam ' : ''}${sizeLabel(totals.bytes)}`;
  const noPosts = positions.isSuccess && (positions.data?.items ?? []).length === 0;
  const nearLimits =
    totals.pages >= metersFrom * limits.scannedPages ||
    totals.bytes >= metersFrom * limits.totalBytes;
  useRefuseStrayDrops();

  async function add(picked: Promise<PickedFile[]> | PickedFile[]) {
    setOpening(true);
    setUnreadable(false);
    try {
      const chosen = await openPicked(await picked, 'employees');
      setSelection((current) => mergeSelection(current, chosen));
    } catch {
      setUnreadable(true);
    } finally {
      setOpening(false);
    }
  }

  const { dragging, handlers } = useImportDrop((picked) => {
    if (!opening) void add(picked);
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (totals.count === 0 || over || opening) return;
    void upload(selection.files, {
      ids: addedSheets.map((sheet) => sheet.id),
      bytes: addedSheets.reduce((total, sheet) => total + sheet.sizeBytes, 0),
    });
  }

  const holdOpen = (event: Event) => {
    if (busy) event.preventDefault();
  };

  useBlocker({
    shouldBlockFn: () => {
      if (openingImport.current || (!busy && !heldSteps.has(phase.step))) return false;
      if (
        busy &&
        !window.confirm('Fotografiile încă se încarcă. Dacă pleci acum, renunți la import. Pleci?')
      ) {
        return true;
      }
      leave();
      return false;
    },
    enableBeforeUnload: () => busy,
  });

  function leave() {
    if (busy || heldSteps.has(phase.step)) abandon();
    onClose();
  }

  const fromFound = batches
    .map((batch) => ({
      batch,
      sheets: batch.sheets.filter((sheet) => addedIds.includes(sheet.id)),
    }))
    .filter((each) => each.sheets.length > 0);
  const offered = batches.filter((batch) =>
    batch.sheets.some((sheet) => !addedIds.includes(sheet.id))
  );

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && leave()}>
      <DialogContent
        data-testid="employee-upload-dialog"
        className="sm:max-w-[760px]"
        showCloseButton={!busy}
        onEscapeKeyDown={holdOpen}
        onInteractOutside={holdOpen}
      >
        <form onSubmit={onSubmit} aria-busy={busy} noValidate>
          <DialogHeader>
            <DialogTitle>Angajați din fișele de instruire</DialogTitle>
            <DialogDescription>
              <span className="block">
                Citim fișele de instruire de la {client.legalName} și îți propunem angajații.
              </span>
              <span className="block">Nu creăm niciun angajat până nu confirmi.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-3.5">
            {choosing && noPosts && !noPostsDismissed && (
              <Notice
                variant="warning"
                icon={<BriefcaseBusiness aria-hidden="true" />}
                title="Clientul nu are încă posturi de lucru"
                data-testid="employee-upload-no-posts"
              >
                <p>
                  Fiecare angajat intră pe un post al clientului. Îți recomandăm să imporți întâi
                  documentația clientului: aduce posturile, iar angajații din fișe intră direct pe
                  ele. Dacă mergi mai departe acum, adaugi posturile pe parcurs, câte unul pentru
                  fiecare post scris pe fișe.
                </p>
                <span className="mt-2 flex flex-wrap gap-2">
                  {onImportDocumentation && (
                    <Button type="button" size="sm" onClick={onImportDocumentation}>
                      Importă documentația clientului
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="bg-card"
                    onClick={() => setNoPostsDismissed(true)}
                  >
                    Continuă fără posturi
                  </Button>
                </span>
              </Notice>
            )}
            {choosing &&
              offered.map((batch) => (
                <FoundOffer
                  key={batch.importId}
                  clientId={client.id}
                  batch={batch}
                  addedIds={addedIds}
                  onAdd={(ids) => setAdded([...addedIds, ...ids])}
                />
              ))}
            {choosing && (
              <div
                data-testid="employee-upload-drop"
                className={cn(
                  'grid justify-items-center gap-2.5 rounded-lg border-[1.5px] border-dashed border-info-border bg-muted/30 p-5 text-center transition-colors',
                  dragging && 'border-primary bg-primary/5'
                )}
                {...handlers}
              >
                {opening ? (
                  <LoaderCircle
                    className="size-6 animate-spin text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <Camera className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
                <p className="text-sm font-medium">
                  {opening
                    ? 'Deschidem fotografiile…'
                    : 'Trage aici fotografiile fișelor, un folder sau o arhivă ZIP'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={() => filesInput.current?.click()}
                  >
                    <Upload aria-hidden="true" />
                    Alege fotografii
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={opening}
                    onClick={() => folderInput.current?.click()}
                  >
                    <FolderUp aria-hidden="true" />
                    Alege un folder
                  </Button>
                </div>
                <div
                  className="flex flex-wrap items-center justify-center gap-1.5"
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
                  <HelpLink topic="import.ce-fotografiezi" label="Ajutor: ce fotografiezi" />
                </div>
                <input
                  ref={filesInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.heif,.zip"
                  className="hidden"
                  data-testid="employee-upload-files-input"
                  onChange={(event) => {
                    void add(pickedFromInput(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
                <input
                  ref={folderInput}
                  type="file"
                  className="hidden"
                  data-testid="employee-upload-folder-input"
                  {...{ webkitdirectory: '' }}
                  onChange={(event) => {
                    void add(pickedFromInput(event.target.files ?? []));
                    event.target.value = '';
                  }}
                />
              </div>
            )}
            {unreadable && (
              <Notice variant="warning" data-testid="employee-upload-unreadable">
                Nu am putut deschide fișierele alese. Încearcă din nou sau alege-le cu „Alege
                fotografii” ori „Alege un folder”.
              </Notice>
            )}
            {[...selection.largeZips, ...selection.brokenZips, ...selection.archives].map(
              (name) => (
                <Notice key={name} variant="warning" data-testid="employee-upload-zip">
                  <strong className="font-semibold">{name}</strong> nu se poate deschide aici.
                  Dezarhivează-l și trage folderul aici, sau împarte fotografiile în mai multe
                  importuri.
                </Notice>
              )
            )}
            {over && (
              <Notice
                variant="destructive"
                title="Sunt prea multe pentru un singur import"
                data-testid="employee-upload-over"
              >
                Ai ales {pagesAndPhotos(totals.pages)}, cu {bytesLabel} în total. Într-un import
                intră cel mult {limits.scannedPages} și 1 GB. Scoate o parte și păstreaz-o pentru un
                import următor, cu toate fotografiile unei persoane în același import. Importul
                următor completează angajații creați de acesta.
              </Notice>
            )}
            {totals.count > 0 && (
              <ChosenPhotos
                files={selection.files}
                found={fromFound}
                clientId={client.id}
                pages={totals.pages}
                onlyPhotos={selection.files.every((file) => file.mimeType !== 'application/pdf')}
                bytes={bytesLabel}
                removable={choosing}
                onRemoveFile={(key) => setSelection((current) => removeFiles(current, [key]))}
                onRemoveFound={(id) => setAdded(addedIds.filter((each) => each !== id))}
                onClear={() => {
                  setSelection((current) => ({ ...current, files: [] }));
                  setAdded([]);
                }}
              />
            )}
            <SetAsideList
              setAside={selection.setAside}
              systemFiles={selection.systemFiles}
              reasons={setAsideReasons}
              title="Puse deoparte, nu le citim"
            />
            <UploadProgress phase={phase} onRetry={retry} onContinue={continueWithout} />
          </DialogBody>
          <DialogFooter
            className={cn(
              'mt-6 items-center',
              nearLimits ? 'sm:justify-between' : 'sm:justify-end'
            )}
          >
            {nearLimits && (
              <div className="flex min-w-[min(100%,18rem)] flex-1 items-center gap-3">
                <div
                  className="grid flex-1 gap-4 sm:grid-cols-2"
                  aria-label="Cât intră într-un import"
                  data-testid="employee-upload-limits"
                >
                  <Meter
                    value={totals.pages}
                    max={limits.scannedPages}
                    label={`${totals.pages}`}
                    of={`din ${limits.scannedPages} de fotografii și pagini`}
                  />
                  <Meter
                    value={totals.bytes}
                    max={limits.totalBytes}
                    label={bytesLabel}
                    of="din 1 GB"
                  />
                </div>
                <HelpLink topic="import.limite" label="Ajutor: cât intră într-un import" />
              </div>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={leave}>
                Renunță
              </Button>
              <Button
                type="submit"
                data-testid="employee-upload-submit"
                disabled={!choosing || totals.count === 0 || over || opening}
              >
                {busy ? 'Se încarcă…' : 'Încarcă și citește'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Meter({
  value,
  max,
  label,
  of,
}: {
  value: number;
  max: number;
  label: string;
  of: string;
}) {
  const over = value > max;
  return (
    <span className="grid gap-1.5" data-over={over || undefined}>
      <span className="text-[13px]">
        <b className="font-semibold tabular-nums">{label}</b>{' '}
        <span className={over ? 'text-destructive' : 'text-muted-foreground'}>{of}</span>
      </span>
      <Progress
        value={Math.min(100, (value / max) * 100)}
        aria-hidden="true"
        className={cn('h-1.5', over && '[&>*]:bg-destructive')}
      />
    </span>
  );
}

function FoundOffer({
  clientId,
  batch,
  addedIds,
  onAdd,
}: {
  clientId: string;
  batch: FoundBatch;
  addedIds: string[];
  onAdd: (ids: string[]) => void;
}) {
  const sheets = batch.sheets.filter((sheet) => !addedIds.includes(sheet.id));
  const where = foundIn(batch.sheets);
  return (
    <section
      aria-labelledby={`found-${batch.importId}`}
      data-testid="employee-upload-found"
      className="grid items-center gap-4 rounded-lg border bg-card px-3.5 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <FoundStrip clientId={clientId} sheets={sheets} />
      <span className="grid min-w-0 gap-0.5">
        <span id={`found-${batch.importId}`} className="text-sm font-semibold">
          Din documentația importată pe {foundOn(batch)}
        </span>
        <span className="text-[13px] text-muted-foreground">
          {photosLabel(sheets.length)} de fișe de instruire
          {where ? `, găsite în ${where}` : ''}
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="employee-upload-found-add"
        onClick={() => onAdd(sheets.map((sheet) => sheet.id))}
      >
        <Plus aria-hidden="true" />
        Adaugă-le
      </Button>
    </section>
  );
}

function ChosenPhotos({
  files,
  found,
  clientId,
  pages,
  onlyPhotos,
  bytes,
  removable,
  onRemoveFile,
  onRemoveFound,
  onClear,
}: {
  files: SelectedFile[];
  found: { batch: FoundBatch; sheets: FoundBatch['sheets'] }[];
  clientId: string;
  pages: number;
  onlyPhotos: boolean;
  bytes: string;
  removable: boolean;
  onRemoveFile: (key: string) => void;
  onRemoveFound: (sheetId: string) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const shown = expanded ? files : files.slice(0, shownThumbs);
  const foundSheets = found.flatMap(({ batch, sheets }) =>
    sheets.map((sheet) => ({ batch, sheet }))
  );
  const photos: PreviewPhoto[] = [
    ...foundSheets.map(({ batch, sheet }) => ({
      key: foundKey(sheet.id),
      name: sheet.fileName,
      detail: `Din documentația importată pe ${foundOn(batch)}`,
      view: <FoundSheetView clientId={clientId} sheet={sheet} />,
    })),
    ...files.map((file) => ({
      key: file.key,
      name: file.name,
      detail: localDetail(file),
      view: <LocalPhotoView file={file} />,
    })),
  ];
  const remove = (key: string) =>
    key.startsWith(foundPrefix) ? onRemoveFound(key.slice(foundPrefix.length)) : onRemoveFile(key);
  const sources = [
    ...(files.length > 0 ? [`${files.length} alese de tine`] : []),
    ...found.map(
      ({ batch, sheets }) =>
        `${sheets.length} din ${foundIn(batch.sheets) ?? `documentația din ${foundOn(batch)}`}`
    ),
  ];
  return (
    // Clip, not hidden: a hidden card is a scroll container, so the dialog body's grid squeezes
    // it below its content and cuts off the photos instead of letting the body scroll.
    <section
      aria-labelledby="employee-upload-chosen"
      data-testid="employee-upload-chosen"
      className="overflow-clip rounded-lg border"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/40 px-3 py-2.5 text-sm">
        <span className="grid">
          <span id="employee-upload-chosen" className="font-medium">
            {onlyPhotos
              ? `${pages === 1 ? 'O fotografie' : photosLabel(pages)} de citit`
              : `${pagesAndPhotos(pages)} de citit`}
          </span>
          {sources.length > 1 && (
            <span className="text-[13px] text-muted-foreground">{listJoin(sources)}</span>
          )}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground tabular-nums">{bytes}</span>
          {removable && (
            <Button type="button" variant="ghost" size="xs" onClick={onClear}>
              Scoate toate
            </Button>
          )}
        </span>
      </div>
      <ul
        className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-3 px-3 pt-3.5 pb-3"
        aria-label="Fotografiile alese"
      >
        {foundSheets.map(({ sheet }) => (
          <ChosenThumb
            key={sheet.id}
            name={sheet.fileName}
            label={sheet.fileName}
            removable={removable}
            onOpen={() => setPreviewing(foundKey(sheet.id))}
            onRemove={() => onRemoveFound(sheet.id)}
          >
            <FoundThumb clientId={clientId} sheet={sheet} />
          </ChosenThumb>
        ))}
        {shown.map((file) => (
          <ChosenThumb
            key={file.key}
            name={file.name}
            label={file.name.replace(/\.[^.]+$/, '')}
            removable={removable}
            onOpen={() => setPreviewing(file.key)}
            onRemove={() => onRemoveFile(file.key)}
          >
            {file.mimeType === 'application/pdf' ? (
              <span className="grid h-[51px] w-10 place-items-center rounded-sm bg-secondary">
                <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
              </span>
            ) : (
              <LocalThumb file={file} className="h-[51px] w-10 rounded-sm" />
            )}
          </ChosenThumb>
        ))}
        {files.length > shownThumbs && !expanded && (
          <li className="grid justify-items-center gap-1">
            <Button
              type="button"
              variant="outline"
              className="h-[51px] w-auto flex-col gap-0 px-2 text-xs"
              onClick={() => setExpanded(true)}
            >
              <span className="tabular-nums">{files.length - shownThumbs}</span>
              <span className="text-muted-foreground">încă</span>
            </Button>
            <span className="text-[11.5px] text-muted-foreground">Arată toate</span>
          </li>
        )}
      </ul>
      <PhotoPreviewDialog
        photos={photos}
        current={previewing}
        onCurrent={setPreviewing}
        onClose={() => setPreviewing(null)}
        onRemove={removable ? remove : undefined}
      />
    </section>
  );
}

const foundPrefix = 'found:';
const foundKey = (sheetId: string) => `${foundPrefix}${sheetId}`;

function localDetail(file: SelectedFile) {
  const folder = file.path.slice(0, -file.name.length - 1);
  return [folder && `Din ${folder}`, formatFileSize(file.size)].filter(Boolean).join(' · ');
}

function ChosenThumb({
  name,
  label,
  removable,
  onOpen,
  onRemove,
  children,
}: {
  name: string;
  label: string;
  removable: boolean;
  onOpen: () => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <li className="grid justify-items-center gap-1" data-testid="employee-upload-thumb">
      <span className="group relative">
        <button
          type="button"
          aria-label={`Deschide ${name}`}
          title={name}
          onClick={onOpen}
          className="flex rounded-sm outline-none hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {children}
        </button>
        {removable && (
          // A touch screen has no hover to reveal it, so there it always shows.
          <button
            type="button"
            aria-label={`Scoate ${name}`}
            onClick={onRemove}
            className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-sm outline-none transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 before:absolute before:-inset-1.5 before:content-[''] hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none pointer-coarse:opacity-100 [@media(hover:none)]:opacity-100"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </span>
      <span className="max-w-full truncate text-[11.5px] text-muted-foreground">{label}</span>
    </li>
  );
}
