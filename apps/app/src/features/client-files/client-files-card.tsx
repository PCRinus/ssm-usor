import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
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
import { useRouteContext } from '@tanstack/react-router';
import { Download, FileUp, Lock, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { type MouseEvent, useEffect, useState } from 'react';

import {
  type ClientFileListResponse,
  getListClientFilesQueryKey,
  setClientFileOwnersOnly,
  useListClientFiles,
} from '@/api/generated/api';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useMe } from '@/features/account/use-me';
import type { Client } from '@/features/clients/client-form-schema';
import { type Disposition, linkTarget, openAddress, renewalMs } from '@/lib/file-link';
import { fileAddress } from '@/lib/save-file';

import { DeleteClientFileDialog, RenameClientFileDialog } from './client-file-dialogs';
import {
  type ClientFile,
  type ClientFileEmployee,
  fileKind,
  formatFileSize,
  formatUploadDate,
} from './client-file-format';
import { UploadClientFilesDialog } from './client-file-upload-dialog';
import { hasFiles, useFileDrop } from './use-file-drop';

// `readOnly` is an archived company.
export function ClientFilesCard({
  client,
  employee,
  userId,
  readOnly,
}: {
  client: Client;
  employee?: ClientFileEmployee;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const isOwner = useMe().data?.membership?.role === 'owner';
  const lead = client.stage === 'lead';
  const params = employee ? { employeeId: employee.id } : undefined;
  const queryKey = [...getListClientFilesQueryKey(client.id, params), userId];
  // Every file comes with a signed link, so the list fetches itself again before they expire.
  const files = useListClientFiles(client.id, params, {
    request: apiRequest,
    query: {
      queryKey,
      staleTime: (current) => renewalMs(current.state.data?.items[0]?.link.expiresInSeconds),
      refetchInterval: (current) => renewalMs(current.state.data?.items[0]?.link.expiresInSeconds),
    },
  });
  const [uploading, setUploading] = useState<File[] | null>(null);
  const [renaming, setRenaming] = useState<ClientFile | null>(null);
  const [deleting, setDeleting] = useState<ClientFile | null>(null);
  const [switching, setSwitching] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const drop = useFileDrop((dropped) => {
    if (dropped.length > 0) setUploading(dropped);
  });

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

  const addressOf = (file: ClientFile, how: 'open' | 'download') => {
    const disposition: Disposition =
      how === 'open' && file.link.disposition === 'inline' ? 'inline' : 'attachment';
    return { href: fileAddress(apiRequest.baseUrl, file.link, disposition), disposition };
  };

  // A phone that slept may keep a link past its expiry before the list fetches itself again, so
  // a tap past that point asks for the list first.
  const linksStaleAt =
    files.dataUpdatedAt + ((files.data?.items[0]?.link.expiresInSeconds ?? 0) - 30) * 1_000;

  async function openFile(file: ClientFile, how: 'open' | 'download') {
    setError(null);
    const { data } = await files.refetch();
    const fresh = data?.items.find((item) => item.id === file.id);
    if (!fresh) {
      setError(`Nu am putut deschide „${file.name}”. Verifică conexiunea și încearcă din nou.`);
      return;
    }
    const { href, disposition } = addressOf(fresh, how);
    openAddress(href, disposition);
  }

  const linkProps = (file: ClientFile, how: 'open' | 'download') => {
    const { href, disposition } = addressOf(file, how);
    return {
      href,
      target: linkTarget(disposition),
      onClick: (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.timeStamp + performance.timeOrigin < linksStaleAt) return;
        event.preventDefault();
        void openFile(file, how);
      },
    };
  };

  function openRow(file: ClientFile, event: MouseEvent<HTMLElement>) {
    if (event.timeStamp + performance.timeOrigin >= linksStaleAt)
      return void openFile(file, 'open');
    const { href, disposition } = addressOf(file, 'open');
    openAddress(href, disposition);
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
          ? `„${file.name}” este acum vizibil doar pentru administratori.`
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
    <>
      <SectionCard
        data-testid={employee ? 'employee-files-card' : 'client-files-card'}
        title={employee ? 'Fișiere' : 'Alte documente'}
        className="relative"
        description={
          <>
            {employee
              ? 'Fișele de instruire completate pe hârtie, fotografiate sau scanate, și alte fișiere despre angajat.'
              : 'Certificatul de înregistrare, procese-verbale ITM, fișe de aptitudine și alte fișiere despre client.'}
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
              variant="tonal"
              size="sm"
              data-testid="client-files-upload"
              onClick={() => setUploading([])}
            >
              <Upload aria-hidden="true" />
              Încarcă fișiere
            </Button>
          )
        }
        {...(canUpload ? drop.handlers : {})}
      >
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
            <div
              data-testid="client-files-empty"
              className="grid justify-items-center gap-3 rounded-lg border border-dashed p-6 text-center"
            >
              <FileUp className="size-6 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-muted-foreground">
                Niciun fișier încă. Trage fișierele aici sau alege-le de pe dispozitiv; poți încărca
                mai multe deodată.
              </p>
              <Button variant="outline" size="sm" onClick={() => setUploading([])}>
                <Upload aria-hidden="true" />
                Alege fișiere
              </Button>
            </div>
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
                  open={linkProps(file, 'open')}
                  download={linkProps(file, 'download')}
                  onActivate={(event) => openRow(file, event)}
                  onRename={() => setRenaming(file)}
                  onDelete={() => setDeleting(file)}
                  onOwnersOnly={(ownersOnly) => void setOwnersOnly(file, ownersOnly)}
                />
              ))}
            </TableBody>
          </Table>
        )}
        {drop.dragging && (
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
      </SectionCard>
      {canUpload && (
        <UploadClientFilesDialog
          clientId={client.id}
          employee={employee}
          lead={lead}
          canChooseOwnersOnly={isOwner && !lead}
          files={uploading}
          onClose={() => setUploading(null)}
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
    </>
  );
}

type FileAnchor = {
  href: string;
  target: string | undefined;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
};

function FileRow({
  file,
  changeable,
  showOwnersOnly,
  canSwitch,
  switching,
  open,
  download,
  onActivate,
  onRename,
  onDelete,
  onOwnersOnly,
}: {
  file: ClientFile;
  changeable: boolean;
  showOwnersOnly: boolean;
  canSwitch: boolean;
  switching: boolean;
  open: FileAnchor;
  download: FileAnchor;
  onActivate: (event: MouseEvent<HTMLElement>) => void;
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
      {...rowClickProps(onActivate)}
      className="cursor-pointer max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:py-3"
    >
      <TableCell className="whitespace-normal max-sm:p-0">
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="grid min-w-0 gap-1">
            <a
              data-testid="client-file-open"
              className="w-fit rounded-sm text-left font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              {...open}
            >
              {file.name}
            </a>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span data-testid="client-file-kind">{kind.label}</span>
              <span className="sm:hidden">· {size}</span>
              {showOwnersOnly && file.ownersOnly && (
                <Badge variant="secondary" data-testid="client-file-owners-only">
                  <Lock aria-hidden="true" />
                  Doar administratori
                </Badge>
              )}
              <span className="basis-full sm:hidden">
                {date}
                {uploader && `, ${uploader}`}
              </span>
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
        <div className="flex gap-1 max-sm:justify-end">
          <Button asChild variant="ghost" size="icon">
            <a
              data-testid="client-file-download"
              aria-label={`Descarcă ${file.name}`}
              title="Descarcă"
              {...download}
            >
              <Download aria-hidden="true" />
            </a>
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
