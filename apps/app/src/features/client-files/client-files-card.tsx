import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { FileUp, Upload } from 'lucide-react';
import { useState } from 'react';

import {
  type ClientFileListResponse,
  getClientFileDownload,
  getListClientFilesQueryKey,
  setClientFileOwnersOnly,
  useListClientFiles,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useMe } from '@/features/account/use-me';
import type { Client } from '@/features/clients/client-form-schema';
import { fileAddress, openDownload } from '@/lib/save-file';

import { DeleteClientFileDialog, RenameClientFileDialog } from './client-file-dialogs';
import { type ClientFile, type ClientFileEmployee, opensInTab } from './client-file-format';
import { FileRow } from './client-file-row';
import { UploadClientFilesDialog } from './client-file-upload-dialog';
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
  const files = useListClientFiles(client.id, params, {
    request: apiRequest,
    query: { queryKey },
  });
  const [uploading, setUploading] = useState<File[] | null>(null);
  const [renaming, setRenaming] = useState<ClientFile | null>(null);
  const [deleting, setDeleting] = useState<ClientFile | null>(null);
  const [switching, setSwitching] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const drop = useFileDrop((dropped) => {
    if (dropped.length > 0) setUploading(dropped);
  });

  useRefuseStrayDrops();

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

  const renderFile = (file: ClientFile, depth: number) => (
    <FileRow
      key={file.id}
      file={file}
      depth={depth}
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
  );

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
              {items.filter((file) => !file.importId).map((file) => renderFile(file, 0))}
              {importFolders(items).map(([importId, folderFiles]) => (
                <ImportFolderRows
                  key={importId}
                  clientId={client.id}
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
