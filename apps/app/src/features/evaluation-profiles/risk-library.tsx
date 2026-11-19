import {
  countOf,
  defaultPageSize,
  type EvaluationProfileListFilters,
  type EvaluationProfileSortKey,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { toast } from '@ssm-usor/ui/lib/toast';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, BriefcaseBusiness, Gauge, Library, Plus, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListEvaluationProfilesQueryKey,
  getListEvaluationProfilesQueryOptions,
  type ListEvaluationProfilesParams,
  useCreateEvaluationProfile,
  useListEvaluationProfiles,
} from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { PendingCountLabel } from '@/components/list-filters/pending-count-label';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { LoadFailed } from '@/components/load-failed';
import { SearchInput } from '@/components/search-input';
import { isEmptyOrLoading } from '@/lib/list-state';

import { type ProfileArchiveChange, ProfileArchiveDialog } from './profile-archive-dialog';
import { profileColumns } from './profile-columns';
import { ProfileNameDialog } from './profile-name-dialog';
import { type ProfileNaming, useProfileRenaming } from './profile-naming';
import type { EvaluationProfileSummary, RiskLibrarySearch } from './profile-schema';
import { RemoveProfileDialog } from './remove-profile-dialog';
import { useProfileCache } from './use-profile-cache';

const libraryPath = '/evaluari-de-risc';

const defaultSort: DataTableSort & { sort: EvaluationProfileSortKey } = {
  sort: 'name',
  order: 'asc',
};

const tabs = [
  { status: undefined, label: 'Active', testId: 'risk-library-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'risk-library-filter-archived' },
] as const;

const filterKeys = [
  'level',
  'usage',
] as const satisfies readonly (keyof EvaluationProfileListFilters)[];

type FilterKey = (typeof filterKeys)[number];

const facets: ListFilterFacet<FilterKey>[] = [
  {
    key: 'level',
    label: 'Nivel global',
    icon: Gauge,
    column: 'left',
    options: [
      { value: 'over', label: 'Peste limită (3,50)', short: 'Peste limită' },
      { value: 'within', label: 'În limită' },
      { value: 'none', label: 'Fără factori' },
    ],
  },
  {
    key: 'usage',
    label: 'Folosire',
    icon: BriefcaseBusiness,
    column: 'right',
    options: [{ value: 'unused', label: 'Nefolosită' }],
  },
];

const profileNoun = ['evaluare', 'evaluări'] as const;
const profileCount = (count: number) => countOf(count, ...profileNoun);

const rowKey = (row: EvaluationProfileSummary) => row.id;

export function RiskLibrary({ search, userId }: { search: RiskLibrarySearch; userId: string }) {
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status, q } = search;
  const archived = status === 'archived';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: libraryPath });
  const cache = useProfileCache();
  const phone = useIsMobile();
  const listFilters = listFilterSearch({ keys: filterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as EvaluationProfileListFilters;
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const tabParams = { ...(archived ? { status } : {}), ...(q ? { q } : {}) };
  const params: ListEvaluationProfilesParams = {
    ...tabParams,
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const profiles = useListEvaluationProfiles(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEvaluationProfilesQueryKey(params), userId],
      placeholderData: keepPreviousData,
    },
  });
  const meta = profiles.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = profiles.data?.unfilteredTotal ?? 0;
  const libraryEmpty = !archived && !narrowed && isEmptyOrLoading(profiles.status, unfilteredTotal);
  const state = archived ? 'arhivată' : 'activă';
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
  const { changeQuery, changeFilters, onSortChange, onPageChange } = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<FilterKey>) =>
      listFilters.searchOf(values) as EvaluationProfileListFilters,
  });
  const pendingQuery = (pending: ListFilterValues<FilterKey>) => {
    const counted: ListEvaluationProfilesParams = {
      ...tabParams,
      ...(listFilters.searchOf(pending) as EvaluationProfileListFilters),
      page: 1,
      pageSize: 1,
    };
    return getListEvaluationProfilesQueryOptions(counted, {
      request: apiRequest,
      query: { queryKey: [...getListEvaluationProfilesQueryKey(counted), userId] },
    });
  };

  const open = (profileId: string) =>
    navigate({
      to: '/evaluari-de-risc/$profileId',
      params: { profileId },
      state: openedHere,
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

  const newProfile = (
    <Button
      data-testid="risk-profile-new"
      className="h-11 w-full sm:h-9 sm:w-auto"
      onClick={startProfile}
    >
      <Plus aria-hidden="true" />
      Evaluare nouă
    </Button>
  );

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
        {!libraryEmpty && newProfile}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează evaluările">
            {tabs.map((tab) => (
              <FilterTab
                key={tab.label}
                to={libraryPath}
                search={tab.status ? { status: tab.status } : {}}
                data-testid={tab.testId}
                active={tab.status === status}
                replace
                resetScroll={false}
              >
                {tab.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {(unfilteredTotal > 0 || narrowed) && (
            <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-2xl md:grow">
              <SearchInput
                value={q}
                onSearch={changeQuery}
                placeholder="Caută după post"
                label="Caută evaluări după post"
                testId="risk-library-search"
              />
              <ListFilters
                facets={facets}
                values={filters}
                onChange={changeFilters}
                total={profiles.isSuccess && !profiles.isPlaceholderData ? meta.total : undefined}
                applyLabel={(pending) => (
                  <PendingCountLabel query={pendingQuery(pending)} noun={profileCount} />
                )}
                countLabel={profileCount}
                testId="risk-library-filters"
              />
            </div>
          )}
          {profiles.isSuccess && (unfilteredTotal > 0 || narrowed) && (
            <ListCount testId="risk-library-count">
              {narrowed ? (
                <>
                  <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                  {phone ? unfilteredTotal : profileCount(unfilteredTotal)}
                </>
              ) : (
                profileCount(meta.total)
              )}
            </ListCount>
          )}
        </ListCardHeader>
        <AppliedFilters
          facets={facets}
          values={filters}
          onChange={changeFilters}
          testId="risk-library-applied-filters"
        />
        <DataTable
          testId="risk-library-table"
          rowTestId="risk-profile-row"
          label="Evaluările din bibliotecă"
          columns={columns}
          data={profiles.data?.items}
          rowKey={rowKey}
          onRowClick={(profile) => void open(profile.id)}
          meta={meta}
          noun={profileNoun}
          status={profiles.status}
          isFetching={profiles.isFetching}
          isPlaceholderData={profiles.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={onSortChange}
          onPageChange={onPageChange}
          error={
            <LoadFailed
              testId="risk-library-load-error"
              busy={profiles.isFetching}
              onRetry={() => void profiles.refetch()}
            >
              Nu am putut încărca biblioteca.
            </LoadFailed>
          }
          empty={
            narrowed ? (
              <EmptyState
                icon={SearchX}
                title="Nicio evaluare nu se potrivește"
                data-testid="risk-library-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="risk-library-empty-clear"
                    onClick={() => (filtered ? changeFilters({}) : changeQuery(undefined))}
                  >
                    {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                  </Button>
                }
              >
                {filtered
                  ? `Nicio evaluare ${state} nu se potrivește ${q ? 'căutării și filtrelor alese' : 'filtrelor alese'}. Scoate unul dintre filtrele de mai sus sau șterge-le pe toate.`
                  : `Nicio evaluare ${state} nu are „${q}” în numele postului. Verifică scrierea sau caută după o parte din nume.`}
              </EmptyState>
            ) : archived ? (
              <EmptyState
                icon={Archive}
                title="Nicio evaluare arhivată"
                data-testid="risk-library-empty"
              >
                Evaluările arhivate vor apărea aici. Le poți reactiva oricând.
              </EmptyState>
            ) : (
              <EmptyState
                icon={Library}
                title="Nicio evaluare încă"
                data-testid="risk-library-empty"
                actions={newProfile}
              >
                Salvează fișa de evaluare a riscurilor pentru un post de la un client cu „Salvează
                în bibliotecă” sau pornește o evaluare goală. Importul documentației unui client
                adaugă aici posturile evaluate.
              </EmptyState>
            )
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
