import {
  type Disposition,
  fileAddress,
  linkTarget,
  openAddress,
  renewalMs,
} from '@ssm-usor/api-http/file-link';
import { countOf } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Notice } from '@ssm-usor/ui/components/notice';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { toast } from '@ssm-usor/ui/lib/toast';
import { FileUp, SearchX, Upload } from 'lucide-react';
import { type MouseEvent, type ReactNode, useId, useMemo, useState } from 'react';

import {
  type ClientFileListResponse,
  getListClientFilesQueryKey,
  setClientFileOwnersOnly,
  useListClientFiles,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { SearchInput } from '@/components/search-input';
import { useMe } from '@/features/account/use-me';
import type { Client } from '@/features/clients/client-form-schema';

import { clientFileColumns } from './client-file-columns';
import { ClientFileList, type ClientFileListContext } from './client-file-context';
import { DeleteClientFileDialog, RenameClientFileDialog } from './client-file-dialogs';
import { type ClientFile, type ClientFileEmployee, fileCountLabel } from './client-file-format';
import {
  clientFileFacets,
  type ClientFileFilterKey,
  clientFileFilters,
  type ClientFileListSearch,
  type ClientFileRow,
  clientFileRows,
  type ClientFileSortKey,
  defaultClientFileSort,
  withFilters,
} from './client-file-list';
import { UploadClientFilesDialog } from './client-file-upload-dialog';
import { useFolderZips } from './import-folder';
import { useFileDrop, useRefuseStrayDrops } from './use-file-drop';

const rowKey = (row: ClientFileRow) => row.key;

const rowTestIds = {
  file: 'client-file-row',
  folder: 'client-import-folder',
  subfolder: 'client-import-subfolder',
  more: 'client-import-folder-more-row',
} as const;

const toggled = (list: readonly string[], value: string) =>
  list.includes(value) ? list.filter((each) => each !== value) : [...list, value];

// `readOnly` is an archived company, or a lead on a plan without offers.
export function ClientFilesCard({
  client,
  employee,
  readOnly,
  search,
  onSearch,
  title,
}: {
  client: Client;
  employee?: ClientFileEmployee;
  readOnly: boolean;
  // Among other cards, as on a lead's page, rather than alone in a tab that names it.
  title?: string;
  search: ClientFileListSearch;
  onSearch: (next: ClientFileListSearch) => void;
}) {
  const { request, queryClient, key: userKey } = useApi();
  const isOwner = useMe().data?.membership?.role === 'owner';
  const phone = useIsMobile();
  const lead = client.stage === 'lead';
  const params = employee ? { employeeId: employee.id } : undefined;
  const queryKey = userKey(getListClientFilesQueryKey(client.id, params));
  // Every file comes with a signed link, so the list fetches itself again before they expire.
  const files = useListClientFiles(client.id, params, {
    request,
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
  const [switched, setSwitched] = useState<string[]>([]);
  const [showAll, setShowAll] = useState<string[]>([]);
  const [error, setError] = useState<ReactNode>(null);
  const zips = useFolderZips(client.id);
  const fileName = (file: { name: string }) =>
    employee ? <Masked>{file.name}</Masked> : file.name;
  const drop = useFileDrop((dropped) => {
    if (dropped.length > 0) setUploading(dropped);
  });

  useRefuseStrayDrops();

  const addressOf = (file: ClientFile, how: 'open' | 'download') => {
    const disposition: Disposition =
      how === 'open' && file.link.disposition === 'inline' ? 'inline' : 'attachment';
    return { href: fileAddress(request.baseUrl, file.link, disposition), disposition };
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

  function openRow(file: ClientFile) {
    if (Date.now() >= linksStaleAt) return void openFile(file, 'open');
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
      await setClientFileOwnersOnly(client.id, file.id, { ownersOnly }, request);
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
    await queryClient.invalidateQueries({ queryKey: getListClientFilesQueryKey(client.id) });
  }
  const items = files.data?.items;
  const all = items?.length ?? 0;
  const listFilters = clientFileFilters(search);
  const filtered = listFilters.applied;
  const shown = useMemo(
    () => clientFileRows(items ?? [], search, { switched, showAll }, Boolean(employee)),
    [items, search, switched, showAll, employee]
  );
  const canUpload = !readOnly;
  const empty = files.isSuccess && all === 0;

  const personal = Boolean(employee);
  const columns = useMemo(() => clientFileColumns(personal), [personal]);
  const list: ClientFileListContext = {
    clientId: client.id,
    showOwnersOnly: !lead,
    canSwitch: isOwner && !lead && !readOnly,
    readOnly,
    switching,
    zips,
    open: (file) => linkProps(file, 'open'),
    download: (file) => linkProps(file, 'download'),
    onToggle: (key) => setSwitched((current) => toggled(current, key)),
    onShowAll: (key) => setShowAll((current) => toggled(current, key)),
    onRename: setRenaming,
    onDelete: setDeleting,
    onOwnersOnly: (file, ownersOnly) => void setOwnersOnly(file, ownersOnly),
  };

  const changeFilters = (values: ListFilterValues<ClientFileFilterKey>) =>
    onSearch(withFilters(search, values));
  const help = employee ? 'fisiere.documentele-lucratorului' : 'fisiere.alte-documente';
  const helpLabel = employee ? 'Ajutor: Documentele lucrătorului' : 'Ajutor: Alte documente';
  const uploadButton = (label: string, className?: string) => (
    <Button
      data-testid="client-files-upload"
      className={className}
      onClick={() => setUploading([])}
    >
      <Upload aria-hidden="true" />
      {label}
    </Button>
  );

  const body = (
    <>
      {lead && (
        <div className="border-b px-4 py-3 sm:px-5">
          <Notice variant="info" data-testid="client-files-lead-hint">
            Până devine client, fișierele lui sunt vizibile doar adminilor.
          </Notice>
        </div>
      )}
      {error && (
        <div className="border-b px-4 py-3 sm:px-5">
          <Notice variant="destructive" data-testid="client-files-error">
            {error}
          </Notice>
        </div>
      )}
      {empty ? (
        <div className="p-4 sm:p-6">
          <div
            data-testid="client-files-empty"
            className="rounded-xl border border-dashed px-5 py-10"
          >
            <EmptyState
              icon={FileUp}
              title={
                employee ? (
                  <>
                    Niciun fișier încă <HelpLink topic={help} label={helpLabel} />
                  </>
                ) : (
                  'Niciun fișier încă'
                )
              }
              actions={
                employee ? (
                  canUpload && uploadButton('Încarcă fișiere')
                ) : (
                  <>
                    {canUpload && uploadButton('Alege fișiere')}
                    <HelpLink
                      topic={help}
                      label={helpLabel}
                      className="my-0 size-9 self-center justify-self-center"
                    />
                  </>
                )
              }
            >
              {canUpload
                ? 'Trage fișierele aici sau alege-le de pe dispozitiv.'
                : 'Nu a fost încărcat niciun fișier.'}
            </EmptyState>
          </div>
        </div>
      ) : (
        <>
          {files.isSuccess && (
            <>
              <ListCardHeader className="px-4 sm:px-5">
                <div className="order-last flex w-full gap-2 md:order-none md:w-auto">
                  <SearchInput
                    value={search.q}
                    onSearch={(next) => onSearch({ ...search, q: next || undefined })}
                    placeholder="Caută după nume sau notă"
                    label="Caută fișiere după nume sau notă"
                    testId="client-files-search"
                    className="md:w-lg md:grow-0 md:basis-auto"
                  />
                  <ListFilters
                    facets={clientFileFacets}
                    values={listFilters.values}
                    onChange={changeFilters}
                    total={shown.count}
                    applyLabel={(pending) =>
                      `Arată ${fileCountLabel(
                        clientFileRows(
                          items ?? [],
                          withFilters(search, pending),
                          { switched, showAll },
                          Boolean(employee)
                        ).count
                      )}`
                    }
                    countLabel={fileCountLabel}
                    testId="client-files-filters"
                  />
                </div>
                <ListCount testId="client-files-count" className="ml-0">
                  {shown.narrowed ? (
                    <>
                      <b className="font-semibold text-foreground">{shown.count}</b> din{' '}
                      {phone ? all : countOf(all, 'fișier', 'fișiere')}
                    </>
                  ) : (
                    fileCountLabel(all)
                  )}
                </ListCount>
                {employee ? (
                  <>
                    <HelpLink topic={help} label={helpLabel} className="my-0 ml-auto size-9" />
                    {canUpload &&
                      uploadButton('Încarcă fișiere', 'max-sm:order-first max-sm:w-full')}
                  </>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    <HelpLink topic={help} label={helpLabel} className="my-0 size-9" />
                    {canUpload && uploadButton('Încarcă fișiere')}
                  </div>
                )}
              </ListCardHeader>
              <AppliedFilters
                facets={clientFileFacets}
                values={listFilters.values}
                onChange={changeFilters}
                testId="client-files-applied-filters"
              />
            </>
          )}
          <ClientFileList.Provider value={list}>
            {/* The shared row fills while it holds an open control; here an open folder or note is
                told by its chevron or its text, as the design draws it. */}
            <div className="[&_tr:has([aria-expanded=true]):not(:hover)]:bg-transparent">
              <DataTable
                testId="client-files-table"
                rowTestId={(row) => rowTestIds[row.kind]}
                label={employee ? 'Fișierele lucrătorului' : 'Fișierele clientului'}
                columns={columns}
                data={files.isSuccess ? shown.rows : undefined}
                rowKey={rowKey}
                onRowClick={(row) => {
                  if (row.kind === 'file') openRow(row.file);
                  else if (row.kind === 'more') setShowAll((current) => toggled(current, row.path));
                  else setSwitched((current) => toggled(current, row.key));
                }}
                status={files.status}
                sort={{
                  sort: search.sort ?? defaultClientFileSort.sort,
                  order: search.order ?? defaultClientFileSort.order,
                }}
                onSortChange={(next: DataTableSort) =>
                  onSearch({
                    ...search,
                    sort:
                      next.sort === defaultClientFileSort.sort
                        ? undefined
                        : (next.sort as ClientFileSortKey),
                    order: next.order === defaultClientFileSort.order ? undefined : next.order,
                  })
                }
                error={
                  <LoadFailed
                    error={files.error}
                    busy={files.isFetching}
                    onRetry={() => void files.refetch()}
                  >
                    Nu am putut încărca fișierele.
                  </LoadFailed>
                }
                empty={
                  <EmptyState
                    icon={SearchX}
                    title="Niciun fișier nu se potrivește"
                    data-testid="client-files-empty-filtered"
                    actions={
                      <Button
                        variant={employee ? 'secondary' : 'outline'}
                        data-testid="client-files-empty-filtered-clear"
                        onClick={() =>
                          filtered ? changeFilters({}) : onSearch({ ...search, q: undefined })
                        }
                      >
                        {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                      </Button>
                    }
                  >
                    {filtered ? (
                      'Scoate filtrul sau schimbă căutarea.'
                    ) : (
                      <>
                        Niciun fișier nu are „{fileName({ name: search.q?.trim() ?? '' })}” în nume
                        sau în notă.
                      </>
                    )}
                  </EmptyState>
                }
              />
            </div>
          </ClientFileList.Provider>
        </>
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
    </>
  );

  const dropHandlers = canUpload ? drop.handlers : {};
  const titleId = useId();
  return (
    <>
      {title ? (
        <Card
          data-testid="client-files-card"
          aria-labelledby={titleId}
          className="relative gap-0 overflow-hidden py-0"
          {...dropHandlers}
        >
          <h2 id={titleId} className="px-4 pt-5 pb-1 text-lg leading-snug font-semibold sm:px-5">
            {title}
          </h2>
          {body}
        </Card>
      ) : (
        <section
          data-testid={employee ? 'employee-files-card' : 'client-files-card'}
          aria-label={employee ? 'Documentele lucrătorului' : 'Alte documente'}
          className="relative"
          {...dropHandlers}
        >
          {body}
        </section>
      )}
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
        personal={Boolean(employee)}
        onClose={() => setDeleting(null)}
        onError={setError}
      />
    </>
  );
}
