import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Label } from '@ssm-usor/ui/components/label';
import { Progress } from '@ssm-usor/ui/components/progress';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Download, FileUp, Lock, MoreHorizontal, Pencil, Trash2, Upload, X } from 'lucide-react';
import { type DragEvent, useEffect, useRef, useState } from 'react';

import { useMe } from '../account/use-me';
import {
  type ClientFileListResponse,
  getClientFileDownload,
  getListClientFilesQueryKey,
  setClientFileOwnersOnly,
  useListClientFiles,
} from '../api/generated/api';
import type { Client } from '../clients/client-form-schema';
import { rowClickProps } from '../components/data-table/row-click';
import { Notice } from '../components/notice';
import { SectionCard } from '../components/section-card';
import { fileAddress, openDownload } from '../lib/save-file';
import { DeleteClientFileDialog, RenameClientFileDialog } from './client-file-dialogs';
import {
  type ClientFile,
  clientFileAccept,
  fileKind,
  formatFileSize,
  formatUploadDate,
  opensInTab,
} from './client-file-format';
import { type PendingUpload, useClientFileUploads } from './use-client-file-uploads';

const hasFiles = (event: { dataTransfer: DataTransfer | null }) =>
  Boolean(event.dataTransfer?.types.includes('Files'));

// `readOnly` is an archived company.
export function ClientFilesCard({
  client,
  userId,
  readOnly,
}: {
  client: Client;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const isOwner = useMe().data?.membership?.role === 'owner';
  const lead = client.stage === 'lead';
  const queryKey = [...getListClientFilesQueryKey(client.id), userId];
  const files = useListClientFiles(client.id, { request: apiRequest, query: { queryKey } });
  const { uploads, add, dismiss } = useClientFileUploads(client.id);
  const fileInput = useRef<HTMLInputElement>(null);
  const [ownersOnlyNext, setOwnersOnlyNext] = useState(false);
  const [renaming, setRenaming] = useState<ClientFile | null>(null);
  const [deleting, setDeleting] = useState<ClientFile | null>(null);
  const [switching, setSwitching] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  // Without this, a file dropped beside the card replaces the app with the file.
  useEffect(() => {
    const refuse = (event: globalThis.DragEvent) => {
      if (event.defaultPrevented || !hasFiles(event)) return;
      event.preventDefault();
      if (event.type === 'dragover') event.dataTransfer!.dropEffect = 'none';
    };
    window.addEventListener('dragover', refuse);
    window.addEventListener('drop', refuse);
    return () => {
      window.removeEventListener('dragover', refuse);
      window.removeEventListener('drop', refuse);
    };
  }, []);

  const uploadFiles = (list: FileList | null) =>
    add(Array.from(list ?? []), !lead && isOwner && ownersOnlyNext);

  const dropHandlers = readOnly
    ? {}
    : {
        onDragEnter: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        },
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          uploadFiles(event.dataTransfer.files);
        },
      };

  // A tab opened after the link arrives would be taken for a popup and blocked, so it opens
  // on the click and is pointed at the file once the link is there.
  async function openFile(file: ClientFile, how: 'open' | 'download') {
    setError(null);
    const tab = how === 'open' && opensInTab(file.mimeType) ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    try {
      const link = await getClientFileDownload(client.id, file.id, apiRequest);
      if (tab && link.disposition === 'inline') {
        tab.location.href = fileAddress(apiRequest.baseUrl, link, 'inline');
      } else {
        tab?.close();
        openDownload(apiRequest.baseUrl, link);
      }
    } catch {
      tab?.close();
      setError(`Nu am putut deschide „${file.name}”. Verifică conexiunea și încearcă din nou.`);
      await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(client.id) });
    }
  }

  async function setOwnersOnly(file: ClientFile, ownersOnly: boolean) {
    setError(null);
    setSwitching((current) => [...current, file.id]);
    queryClient.setQueryData<ClientFileListResponse>(queryKey, (current) =>
      current
        ? {
            items: current.items.map((item) =>
              item.id === file.id ? { ...item, ownersOnly } : item
            ),
          }
        : current
    );
    try {
      await setClientFileOwnersOnly(client.id, file.id, { ownersOnly }, apiRequest);
      toast.success(
        ownersOnly
          ? `„${file.name}” este acum doar pentru administratori.`
          : `„${file.name}” este acum vizibil pentru toată echipa.`
      );
    } catch {
      toast.error(`Nu am putut schimba cine vede „${file.name}”. Încearcă din nou.`);
    }
    setSwitching((current) => current.filter((id) => id !== file.id));
    await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(client.id) });
  }

  const items = files.data?.items ?? [];
  const canUpload = !readOnly;

  return (
    <SectionCard
      data-testid="client-files-card"
      title="Alte documente"
      className="relative"
      description={
        <>
          Fișierele despre client pe care aplicația nu le generează: certificatul de înregistrare,
          procese-verbale ITM, fișe de aptitudine, oferte. PDF, imagini, Word sau Excel, de cel mult
          20 MB fiecare.
          {lead && (
            <span data-testid="client-files-lead-hint">
              {' '}
              Până devine client, fișierele lui sunt vizibile doar administratorilor.
            </span>
          )}
        </>
      }
      action={
        canUpload && (
          <Button
            variant="outline"
            size="sm"
            data-testid="client-files-upload"
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden="true" />
            Încarcă fișiere
          </Button>
        )
      }
      {...dropHandlers}
    >
      {canUpload && isOwner && !lead && (
        <div className="flex items-start gap-2">
          <Checkbox
            id="client-files-owners-only"
            data-testid="client-files-owners-only"
            checked={ownersOnlyNext}
            onCheckedChange={(checked) => setOwnersOnlyNext(checked === true)}
            aria-describedby="client-files-owners-only-hint"
          />
          <div className="grid gap-1">
            <Label htmlFor="client-files-owners-only">Doar pentru administratori</Label>
            <p id="client-files-owners-only-hint" className="text-xs text-muted-foreground">
              Se aplică fișierelor pe care le încarci de acum. Specialiștii nu le vor vedea.
            </p>
          </div>
        </div>
      )}
      {uploads.length > 0 && <UploadList uploads={uploads} onDismiss={dismiss} />}
      {error && (
        <Notice variant="destructive" data-testid="client-files-error">
          {error}
        </Notice>
      )}
      {files.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : files.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={files.isFetching}
              onClick={() => void files.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca fișierele.
        </Notice>
      ) : items.length === 0 ? (
        canUpload ? (
          uploads.length === 0 && (
            <div
              data-testid="client-files-empty"
              className="grid justify-items-center gap-3 rounded-lg border border-dashed p-6 text-center"
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-muted-foreground">
                Niciun fișier încă. Trage fișierele aici sau alege-le de pe dispozitiv; poți încărca
                mai multe deodată.
              </p>
              <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                <Upload aria-hidden="true" />
                Alege fișiere
              </Button>
            </div>
          )
        ) : (
          <p data-testid="client-files-empty" className="text-sm text-muted-foreground">
            Nu a fost încărcat niciun fișier.
          </p>
        )
      ) : (
        <Table className="max-sm:block">
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              <TableHead>Nume</TableHead>
              <TableHead className="text-right">Mărime</TableHead>
              <TableHead>Încărcat</TableHead>
              <TableHead className="w-20">
                <span className="sr-only">Acțiuni</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block">
            {items.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                changeable={file.canChange && !readOnly}
                showOwnersOnly={!lead}
                canSwitch={isOwner && !lead && !readOnly}
                switching={switching.includes(file.id)}
                onOpen={() => void openFile(file, 'open')}
                onDownload={() => void openFile(file, 'download')}
                onRename={() => setRenaming(file)}
                onDelete={() => setDeleting(file)}
                onOwnersOnly={(ownersOnly) => void setOwnersOnly(file, ownersOnly)}
              />
            ))}
          </TableBody>
        </Table>
      )}
      {dragging && (
        <div
          aria-hidden="true"
          data-testid="client-files-drop"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/90"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <FileUp className="size-5 text-primary" aria-hidden="true" />
            Lasă fișierele aici ca să le încarci.
          </span>
        </div>
      )}
      {canUpload && (
        <input
          ref={fileInput}
          type="file"
          multiple
          data-testid="client-files-input"
          className="hidden"
          accept={clientFileAccept}
          onChange={(event) => {
            const list = event.target.files;
            uploadFiles(list);
            // Emptied, so that choosing the same file again is still a change.
            event.target.value = '';
          }}
        />
      )}
      <RenameClientFileDialog
        clientId={client.id}
        file={renaming}
        onClose={() => setRenaming(null)}
      />
      <DeleteClientFileDialog
        clientId={client.id}
        file={deleting}
        onClose={() => setDeleting(null)}
        onError={setError}
      />
    </SectionCard>
  );
}

function UploadList({
  uploads,
  onDismiss,
}: {
  uploads: PendingUpload[];
  onDismiss: (key: string) => void;
}) {
  return (
    <ul className="grid gap-2" aria-label="Încărcări">
      {uploads.map((upload) => (
        <li
          key={upload.key}
          data-testid="client-file-upload"
          data-state={upload.state}
          className={cn(
            'grid gap-2 rounded-lg border p-3',
            upload.state === 'failed' && 'border-destructive/50'
          )}
        >
          <div className="flex items-start gap-3">
            <span className="min-w-0 flex-1 text-sm font-medium wrap-anywhere">
              {upload.fileName}
            </span>
            {upload.state === 'failed' ? (
              <Button
                variant="ghost"
                size="icon-sm"
                className="-my-1.5 -mr-1.5"
                data-testid="client-file-upload-dismiss"
                aria-label={`Închide mesajul pentru ${upload.fileName}`}
                onClick={() => onDismiss(upload.key)}
              >
                <X aria-hidden="true" />
              </Button>
            ) : (
              <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                {upload.state === 'waiting'
                  ? 'În așteptare'
                  : upload.percent < 100
                    ? `${upload.percent}%`
                    : 'Se verifică…'}
              </span>
            )}
          </div>
          {upload.state === 'failed' ? (
            <p
              data-testid="client-file-upload-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {upload.error}
            </p>
          ) : (
            <Progress
              value={upload.percent}
              className="h-1.5"
              aria-label={`Se încarcă ${upload.fileName}`}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

function FileRow({
  file,
  changeable,
  showOwnersOnly,
  canSwitch,
  switching,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onOwnersOnly,
}: {
  file: ClientFile;
  changeable: boolean;
  showOwnersOnly: boolean;
  canSwitch: boolean;
  switching: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOwnersOnly: (ownersOnly: boolean) => void;
}) {
  const kind = fileKind(file.mimeType);
  const Icon = kind.icon;
  const size = formatFileSize(file.sizeBytes);
  const date = formatUploadDate(file.createdAt);
  const uploader = file.uploadedBy ? (file.uploadedBy.fullName ?? 'Fără nume') : null;
  return (
    <TableRow
      data-testid="client-file-row"
      {...rowClickProps(onOpen)}
      className="cursor-pointer max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:py-3"
    >
      <TableCell className="whitespace-normal max-sm:p-0">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="grid min-w-0 gap-1">
            <button
              type="button"
              data-testid="client-file-open"
              className="w-fit rounded-sm text-left font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={onOpen}
            >
              {file.name}
            </button>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span data-testid="client-file-kind">{kind.label}</span>
              <span className="sm:hidden">· {size}</span>
              <span className="sm:hidden">
                · {date}
                {uploader && `, ${uploader}`}
              </span>
              {showOwnersOnly && file.ownersOnly && (
                <Badge variant="secondary" data-testid="client-file-owners-only">
                  <Lock aria-hidden="true" />
                  Doar administratori
                </Badge>
              )}
            </div>
            {file.note && (
              <p
                data-testid="client-file-row-note"
                className="text-xs whitespace-pre-line text-muted-foreground wrap-anywhere"
              >
                {file.note}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right align-top tabular-nums max-sm:hidden">{size}</TableCell>
      <TableCell className="align-top max-sm:hidden">
        <span className="tabular-nums">{date}</span>
        {uploader && (
          <span className="mt-0.5 block max-w-48 truncate text-xs text-muted-foreground">
            {uploader}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0">
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            data-testid="client-file-download"
            aria-label={`Descarcă ${file.name}`}
            title="Descarcă"
            onClick={onDownload}
          >
            <Download aria-hidden="true" />
          </Button>
          {changeable && (
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
                  Redenumește
                </DropdownMenuItem>
                {canSwitch && (
                  <DropdownMenuCheckboxItem
                    data-testid="client-file-owners-only-switch"
                    checked={file.ownersOnly}
                    disabled={switching}
                    onCheckedChange={(checked) => onOwnersOnly(checked === true)}
                  >
                    Doar pentru administratori
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
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
