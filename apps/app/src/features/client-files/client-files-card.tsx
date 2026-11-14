import {
  type Disposition,
  fileAddress,
  linkTarget,
  openAddress,
  renewalMs,
} from '@ssm-usor/api-http/file-link';
import type { InstructionDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { FileUp, Upload } from 'lucide-react';
import { type MouseEvent, type ReactNode, useState } from 'react';

import {
  type ClientFileListResponse,
  getGetEarlierInstructionsQueryKey,
  getListClientFilesQueryKey,
  setClientFileOwnersOnly,
  useListClientFiles,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import { useMe } from '@/features/account/use-me';
import type { Client } from '@/features/clients/client-form-schema';
import { isEmptyOrLoading } from '@/lib/list-state';

import { DeleteClientFileDialog, RenameClientFileDialog } from './client-file-dialogs';
import { type ClientFile, type ClientFileEmployee } from './client-file-format';
import { FileRow } from './client-file-row';
import { UploadClientFilesDialog } from './client-file-upload-dialog';
import { EarlierInstructionsDialog } from './earlier-instructions-dialog';
import { EarlierInstructionsRows } from './earlier-instructions-group';
import { ImportFolderRows } from './import-folder';
import { useFileDrop, useRefuseStrayDrops } from './use-file-drop';

function importFolders(items: ClientFile[]) {
  const folders = new Map<string, ClientFile[]>();
  for (const file of items) {
    if (file.importId) folders.set(file.importId, [...(folders.get(file.importId) ?? []), file]);
  }
  return [...folders.entries()];
}

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
  const [addingEarlier, setAddingEarlier] = useState<InstructionDomain | null>(null);
  const [switching, setSwitching] = useState<string[]>([]);
  const [error, setError] = useState<ReactNode>(null);
  const fileName = (file: { name: string }) =>
    employee ? <Masked>{file.name}</Masked> : file.name;
  const drop = useFileDrop((dropped) => {
    if (dropped.length > 0) setUploading(dropped);
  });

  useRefuseStrayDrops();

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
    const refreshed = await files.refetch();
    const fresh = refreshed.isSuccess
      ? refreshed.data.items.find((item) => item.id === file.id)
      : undefined;
    if (!fresh) {
      setError(
        <>Nu am putut deschide „{fileName(file)}”. Verifică conexiunea și încearcă din nou.</>
      );
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
        <>
          „{fileName(file)}” este acum vizibil{' '}
          {ownersOnly ? 'doar pentru admini' : 'pentru toată echipa'}.
        </>
      );
    } catch {
      toast.error(<>Nu am putut schimba cine vede „{fileName(file)}”. Încearcă din nou.</>);
    }
    setSwitching((current) => current.filter((id) => id !== file.id));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(client.id) }),
      queryClient.invalidateQueries({ queryKey: getGetEarlierInstructionsQueryKey(client.id) }),
    ]);
  }

  const items = files.data?.items ?? [];
  const canUpload = !readOnly;
  const earlierInstructions = items.filter((file) => file.earlierInstructions);

  const renderFile = (file: ClientFile, depth: number) => (
    <FileRow
      key={file.id}
      file={file}
      depth={depth}
      personal={Boolean(employee)}
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
  );

  return (
    <>
      <SectionCard
        data-testid={employee ? 'employee-files-card' : 'client-files-card'}
        title={employee ? 'Documente' : 'Alte documente'}
        className="relative"
        description={
          <>
            {employee
              ? 'Fișele de instruire completate pe hârtie, fotografiate sau scanate, și alte fișiere despre lucrător.'
              : 'Certificatul de înregistrare, procese-verbale ITM, fișe de aptitudine și alte fișiere despre client.'}
            {lead && (
              <span data-testid="client-files-lead-hint">
                {' '}
                Până devine client, fișierele lui sunt vizibile doar adminilor.
              </span>
            )}
          </>
        }
        action={
          canUpload &&
          !isEmptyOrLoading(files.status, items.length) && (
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
              <Button
                variant="outline"
                size="sm"
                data-testid="client-files-upload"
                onClick={() => setUploading([])}
              >
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nume</TableHead>
                <TableHead className="text-right">Mărime</TableHead>
                <TableHead>Încărcat</TableHead>
                <TableHead className="w-20">
                  <span className="sr-only">Acțiuni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items
                .filter((file) => !file.importId && !file.earlierInstructions)
                .map((file) => renderFile(file, 0))}
              {earlierInstructions.length > 0 && (
                <EarlierInstructionsRows
                  files={earlierInstructions}
                  onAdd={canUpload && !lead ? () => setAddingEarlier('ssm') : null}
                  renderFile={renderFile}
                />
              )}
              {importFolders(items).map(([importId, folderFiles]) => (
                <ImportFolderRows
                  key={importId}
                  clientId={client.id}
                  kind={
                    employee
                      ? 'employee'
                      : folderFiles[0]!.importKind === 'employees'
                        ? 'sheets'
                        : 'client'
                  }
                  files={folderFiles}
                  renderFile={renderFile}
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
      {!employee && (
        <EarlierInstructionsDialog
          clientId={client.id}
          domain={addingEarlier}
          onClose={() => setAddingEarlier(null)}
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
        personal={Boolean(employee)}
        onClose={() => setDeleting(null)}
        onError={setError}
      />
    </>
  );
}
