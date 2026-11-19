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
import {
  ChevronDown,
  ChevronUp,
  FileArchive,
  FileText,
  FileUp,
  Folder,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { useEmployeesBlocked } from '@/features/subscription/employees-over-step';
import { EmployeesOverStepNotice } from '@/features/subscription/employees-over-step-notice';

import {
  CreditsLine,
  CreditsShortNotice,
  GiftHint,
  NoCreditsFooter,
  NoCreditsNotices,
} from './credits-notices';
import { startCreditsOf, usesSentence } from './import-credits';
import { filesLabel, formatFileSize, photosLabel } from './import-format';
import { LocalThumb, SetAsideList, UploadDropZone, UploadProgress } from './upload-parts';
import {
  isPhoto,
  removeGroup,
  removeLoosePhotos,
  type SelectedFile,
  type Selection,
  type SelectionRow,
  selectionRows,
  selectionTotals,
} from './upload-selection';
import { useUploadForm } from './use-upload-form';

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

function UploadForm({
  client,
  onClose,
  onStarted,
}: {
  client: ImportClient | undefined;
  onClose: () => void;
  onStarted: (importId: string) => void;
}) {
  const employeesBlocked = useEmployeesBlocked();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const form = useUploadForm({
    kind: 'client',
    clientId: client?.id,
    onStarted,
    onClose,
    leaveWhileBusy: 'Fișierele încă se încarcă. Dacă pleci acum, renunți la import. Pleci?',
    creditsNeeded: (selection) =>
      startCreditsOf('client', { photos: selection.files.filter(isPhoto).length, pages: 0 }),
  });
  const { selection, totals, over, opening, busy, choosing, refusal, balance, isOwner, leave } =
    form;
  const photos = selection.files.filter(isPhoto).length;

  const zipNotices = [
    ...selection.archives.map((name) => ({
      name,
      testId: 'import-archive-refused',
      text: 'nu se poate deschide aici. Dezarhivează-l și trage folderul aici.',
    })),
    ...selection.brokenZips.map((name) => ({
      name,
      testId: 'import-zip-broken',
      text: 'nu s-a putut deschide. Dezarhivează-l și trage folderul aici.',
    })),
    ...selection.largeZips.map((name) => ({
      name,
      testId: 'import-zip-large',
      text: `e prea mare pentru un singur import, care ia cel mult ${importLimits.client.files} de fișiere și 100 MB. Dezarhivează-l și împarte documentele în mai multe importuri.`,
    })),
  ].filter((notice) => !dismissed.includes(notice.name));

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && leave()}>
      <DialogContent
        data-testid="import-upload-dialog"
        className="sm:max-w-[620px]"
        showCloseButton={!busy}
        onEscapeKeyDown={form.holdOpen}
        onInteractOutside={form.holdOpen}
      >
        <form onSubmit={form.onSubmit} aria-busy={busy} noValidate>
          <DialogHeader>
            <DialogTitle>
              {client ? 'Completează din documentație' : 'Client nou din documente'}
            </DialogTitle>
            <DialogDescription>
              <span className="block">
                Citim documentația SSM și SU a firmei și îți propunem datele clientului.
              </span>
              <span className="block">
                Clientul se creează sau se completează doar când confirmi.{' '}
                <HelpLink topic="import.client">Află mai mult</HelpLink>
              </span>
            </DialogDescription>
          </DialogHeader>
          {refusal?.kind === 'none' ? (
            <>
              <DialogBody className="mt-4 grid gap-3.5">
                <NoCreditsNotices kind="client" balance={balance} />
              </DialogBody>
              <DialogFooter className="mt-6">
                <NoCreditsFooter isOwner={isOwner} onClose={leave} />
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogBody className="mt-4 grid gap-4">
                {employeesBlocked && <EmployeesOverStepNotice context="clientImport" />}
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
                  <UploadDropZone
                    drop={form.drop}
                    opening={opening}
                    icon={<FileUp className="size-6 text-muted-foreground" aria-hidden="true" />}
                    prompt="Trage aici fișierele, un folder sau o arhivă ZIP"
                    openingText="Deschidem fișierele…"
                    chooseFilesLabel="Alege fișiere"
                    formats={formats}
                    testIds={{
                      zone: 'import-upload-drop',
                      filesInput: 'import-files-input',
                      folderInput: 'import-folder-input',
                      chooseFiles: 'import-choose-files',
                      chooseFolder: 'import-choose-folder',
                    }}
                    onPicked={(picked) => void form.add(picked)}
                  />
                )}
                {refusal?.kind === 'short' && (
                  <CreditsShortNotice
                    kind="client"
                    refusal={refusal}
                    balance={balance}
                    isOwner={isOwner}
                  />
                )}
                {form.unreadable && (
                  <Notice variant="warning" data-testid="import-unreadable">
                    Nu am putut deschide fișierele alese. Încearcă din nou sau alege-le cu „Alege
                    fișiere” ori „Alege un folder”.
                  </Notice>
                )}
                {zipNotices.map((notice) => (
                  <Notice
                    key={`${notice.testId}:${notice.name}`}
                    variant="warning"
                    data-testid={notice.testId}
                    action={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Închide mesajul"
                        onClick={() => setDismissed((current) => [...current, notice.name])}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    }
                  >
                    <strong className="font-semibold">{notice.name}</strong> {notice.text}
                  </Notice>
                ))}
                {over && (
                  <Notice variant="destructive" data-testid="import-upload-over">
                    Un import ia cel mult {importLimits.client.files} de fișiere și 100 MB. Ai ales{' '}
                    {filesLabel(totals.count)}, {formatFileSize(totals.bytes)}. Scoate câteva și
                    încarcă restul într-un import separat.
                  </Notice>
                )}
                {totals.count > 0 && (
                  <ChosenList
                    selection={selection}
                    removable={choosing}
                    onRemoveGroup={(group) => {
                      form.forgetShort();
                      form.setChosen((current) => removeGroup(current, group));
                    }}
                    onRemovePhotos={() => {
                      form.forgetShort();
                      form.setChosen(removeLoosePhotos);
                    }}
                  />
                )}
                <SetAsideList setAside={selection.setAside} systemFiles={selection.systemFiles} />
                <UploadProgress
                  phase={form.phase}
                  onRetry={form.retry}
                  onContinue={form.continueWithout}
                />
                {!refusal && <GiftHint balance={balance} />}
              </DialogBody>
              <DialogFooter className="mt-6 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                <CreditsLine
                  className="sm:flex-1"
                  uses={usesSentence('client', { photos, pages: 0, pdfs: 0 })}
                  balance={balance}
                  short={refusal !== null}
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button type="button" variant="outline" disabled={busy} onClick={leave}>
                    Renunță
                  </Button>
                  <Button
                    type="submit"
                    data-testid="import-upload-submit"
                    disabled={
                      !choosing || totals.count === 0 || over || opening || refusal !== null
                    }
                  >
                    {busy ? 'Se încarcă…' : 'Încarcă și citește'}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
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
  onRemovePhotos,
}: {
  selection: Selection;
  removable: boolean;
  onRemoveGroup: (group: string) => void;
  onRemovePhotos: () => void;
}) {
  const totals = selectionTotals(selection);
  const rows = selectionRows(selection.files);
  return (
    // Clip, not hidden: a hidden card is a scroll container, so the dialog body's grid squeezes
    // it below its content and cuts off the list instead of letting the body scroll.
    <section
      aria-labelledby="import-chosen-heading"
      data-testid="import-chosen"
      className="overflow-clip rounded-lg border"
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
            onRemove={() => (row.kind === 'photos' ? onRemovePhotos() : onRemoveGroup(row.group))}
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
