import { defaultPageSize, type EvaluationProfileSortKey } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, Library, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListEvaluationProfilesQueryKey,
  useCreateEvaluationProfile,
  useListEvaluationProfiles,
} from '@/api/generated/api';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { HelpLink } from '@/components/help-link';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';

import { type ProfileArchiveChange, ProfileArchiveDialog } from './profile-archive-dialog';
import { profileColumns } from './profile-columns';
import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import {
  type EvaluationProfileSummary,
  profileCountLabel,
  type RiskLibrarySearch,
} from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileCache } from './use-profile-cache';

const libraryPath = '/evaluari-de-risc';

const defaultSort: DataTableSort & { sort: EvaluationProfileSortKey } = {
  sort: 'name',
  order: 'asc',
};

const filters = [
  { status: undefined, label: 'Active', testId: 'risk-library-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'risk-library-filter-archived' },
] as const;

const rowKey = (row: EvaluationProfileSummary) => row.id;

export function RiskLibrary({ search, userId }: { search: RiskLibrarySearch; userId: string }) {
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status } = search;
  const archived = status === 'archived';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: libraryPath });
  const cache = useProfileCache();
  const params = {
    ...(archived ? { status } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
  };
  const profiles = useListEvaluationProfiles(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEvaluationProfilesQueryKey(params), userId],
      placeholderData: keepPreviousData,
    },
  });
  const meta = profiles.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const create = useCreateEvaluationProfile({ request: apiRequest });
  const renaming = useProfileRenaming();
  const [naming, setNaming] = useState<ProfileNaming | null>(null);
  const [renamed, setRenamed] = useState<EvaluationProfileSummary | null>(null);
  const [archiveChange, setArchiveChange] = useState<ProfileArchiveChange | null>(null);
  const [removing, setRemoving] = useState<EvaluationProfileSummary | null>(null);
  const columns = useMemo(
    () =>
      profileColumns({
        onRename: setRenamed,
        onArchiveChange: setArchiveChange,
        onRemove: setRemoving,
      }),
    []
  );

  const open = (profileId: string) =>
    navigate({
      to: '/evaluari-de-risc/$profileId',
      params: { profileId },
      state: { openedFromList: true },
    });

  const startProfile = () =>
    setNaming({
      title: 'Evaluare nouă',
      description: 'Îi adaugi factorii de risc după ce o creezi.',
      defaultName: '',
      submitLabel: 'Creează și deschide',
      pendingLabel: 'Se creează…',
      failure: 'Nu am putut crea evaluarea. Verifică conexiunea și încearcă din nou.',
      submit: async (name) => {
        const { profile } = await create.mutateAsync({ data: { name } });
        await cache.saved(profile);
        toast.success('Evaluarea a fost creată.');
        await open(profile.id);
      },
    });

  return (
    <div data-testid="risk-library" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-3xl font-semibold tracking-tight">Evaluări de risc</h1>
            <HelpLink topic="evaluari-de-risc.biblioteca" label="Ajutor: Evaluări de risc" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Posturile pe care le evaluezi o dată și le aplici la orice client.
          </p>
        </div>
        <Button data-testid="risk-profile-new" onClick={startProfile}>
          <Plus aria-hidden="true" />
          Evaluare nouă
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează evaluările">
            {filters.map((filter) => (
              <FilterTab
                key={filter.label}
                to={libraryPath}
                search={filter.status ? { status: filter.status } : {}}
                data-testid={filter.testId}
                active={filter.status === status}
                replace
                resetScroll={false}
              >
                {filter.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {profiles.isSuccess && (
            <ListCount testId="risk-library-count">{profileCountLabel(meta.total)}</ListCount>
          )}
        </ListCardHeader>
        <DataTable
          testId="risk-library-table"
          rowTestId="risk-profile-row"
          label="Evaluările din bibliotecă"
          columns={columns}
          data={profiles.data?.items}
          rowKey={rowKey}
          onRowClick={(profile) => void open(profile.id)}
          meta={meta}
          noun={['evaluare', 'evaluări']}
          status={profiles.status}
          isFetching={profiles.isFetching}
          isPlaceholderData={profiles.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={(next) =>
            void navigate({
              replace: true,
              resetScroll: false,
              search: (prev) => ({
                ...prev,
                sort:
                  next.sort === defaultSort.sort
                    ? undefined
                    : (next.sort as EvaluationProfileSortKey),
                order: next.order === defaultSort.order ? undefined : next.order,
                page: undefined,
              }),
            })
          }
          onPageChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) })
          }
          error={
            <>
              <p data-testid="risk-library-load-error" role="alert" className="text-sm">
                Nu am putut încărca biblioteca.
              </p>
              <Button
                variant="outline"
                className="mt-4"
                disabled={profiles.isFetching}
                onClick={() => void profiles.refetch()}
              >
                Încearcă din nou
              </Button>
            </>
          }
          empty={
            <div data-testid="risk-library-empty">
              {archived ? (
                <>
                  <Archive
                    className="mx-auto mb-4 size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="text-base font-medium">Nicio evaluare arhivată</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Evaluările arhivate vor apărea aici. Le poți reactiva oricând.
                  </p>
                </>
              ) : (
                <>
                  <Library
                    className="mx-auto mb-4 size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="text-base font-medium">Nicio evaluare încă</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                    Salvează fișa de evaluare a unui post de la un client cu „Salvează în
                    bibliotecă” sau pornește o evaluare goală cu „Evaluare nouă”.
                  </p>
                </>
              )}
            </div>
          }
        />
      </div>
      <ProfileNameDialog
        naming={renamed ? renaming(renamed) : naming}
        onClose={() => {
          setNaming(null);
          setRenamed(null);
        }}
      />
      <ProfileArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <RemoveProfileDialog profile={removing} onClose={() => setRemoving(null)} />
    </div>
  );
}
