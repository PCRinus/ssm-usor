import {
  categoryFitsDomain,
  countOf,
  defaultPageSize,
  type InstructionDomain,
  instructionModuleGroups,
  type InstructionModuleListFilters,
  type InstructionModuleSortKey,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Archive, BookOpenText, BriefcaseBusiness, PenLine, SearchX, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListInstructionModulesQueryKey,
  getListInstructionModulesQueryOptions,
  type ListInstructionModulesParams,
  useListInstructionModules,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import {
  FilterTab,
  FilterTabs,
  ListActions,
  ListCardHeader,
  ListCount,
} from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { PendingCountLabel } from '@/components/list-filters/pending-count-label';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { LoadFailed } from '@/components/load-failed';
import { SearchInput } from '@/components/search-input';
import { isEmptyOrLoading } from '@/lib/list-state';

import {
  type InstructionArchiveChange,
  InstructionArchiveDialog,
} from './instruction-archive-dialog';
import { instructionColumns } from './instruction-columns';
import { InstructionModuleDialog, type ModuleEditing } from './instruction-module-dialog';
import {
  domainLabels,
  groupLabels,
  type InstructionModule,
  type LibrarySearch,
} from './instruction-schema';
import { InstructionStartDialog } from './instruction-start-dialog';

const libraryPaths = { ssm: '/instructiuni/ssm', su: '/instructiuni/su' } as const;

const defaultSort: DataTableSort & { sort: InstructionModuleSortKey } = {
  sort: 'title',
  order: 'asc',
};

const tabs = [
  { status: undefined, label: 'Active', testId: 'instruction-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'instruction-filter-archived' },
] as const;

const filterKeys = [
  'category',
  'usage',
] as const satisfies readonly (keyof InstructionModuleListFilters)[];

type FilterKey = (typeof filterKeys)[number];

// An archived instruction is applied nowhere, so its tab has no "Folosire".
function facetsOf(domain: InstructionDomain, archived: boolean): ListFilterFacet<FilterKey>[] {
  return [
    {
      key: 'category',
      label: 'Categorie',
      icon: Tag,
      column: 'left',
      options: instructionModuleGroups
        .filter((group) => categoryFitsDomain(group, domain))
        .map((group) => ({ value: group, label: groupLabels[group] })),
    },
    ...(archived
      ? []
      : [
          {
            key: 'usage',
            label: 'Folosire',
            icon: BriefcaseBusiness,
            column: 'right',
            options: [{ value: 'unused', label: 'Nefolosită' }],
          } satisfies ListFilterFacet<FilterKey>,
        ]),
  ];
}

const moduleNoun = ['instrucțiune', 'instrucțiuni'] as const;
const moduleCount = (count: number) => countOf(count, ...moduleNoun);

const rowKey = (row: InstructionModule) => row.id;

export function InstructionLibrary({
  domain,
  search,
}: {
  domain: InstructionDomain;
  search: LibrarySearch;
}) {
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status, q } = search;
  const archived = status === 'archived';
  const { request, key } = useApi();
  const navigate = useNavigate({ from: libraryPaths[domain] });
  const [starting, setStarting] = useState(false);
  const phone = useIsMobile();
  const facets = useMemo(() => facetsOf(domain, archived), [domain, archived]);
  const listFilters = listFilterSearch({ keys: filterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as InstructionModuleListFilters;
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const tabParams = { ...(archived ? { status } : {}), domain, ...(q ? { q } : {}) };
  const params: ListInstructionModulesParams = {
    ...tabParams,
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const modules = useListInstructionModules(params, {
    request,
    query: {
      queryKey: key(getListInstructionModulesQueryKey(params)),
      placeholderData: keepPreviousData,
    },
  });
  const meta = modules.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = modules.data?.unfilteredTotal ?? 0;
  const tabEmpty = !archived && isEmptyOrLoading(modules.status, unfilteredTotal) && !narrowed;
  const [editing, setEditing] = useState<ModuleEditing>(null);
  const [archiveChange, setArchiveChange] = useState<InstructionArchiveChange | null>(null);
  const columns = useMemo(
    () => instructionColumns({ archived, onEdit: setEditing, onArchiveChange: setArchiveChange }),
    [archived]
  );
  const label = domainLabels[domain];
  const state = archived ? 'arhivată' : 'activă';
  const { changeQuery, changeFilters, onSortChange, onPageChange } = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<FilterKey>) =>
      listFilters.searchOf(values) as InstructionModuleListFilters,
  });
  const pendingQuery = (pending: ListFilterValues<FilterKey>) => {
    const counted: ListInstructionModulesParams = {
      ...tabParams,
      ...(listFilters.searchOf(pending) as InstructionModuleListFilters),
      page: 1,
      pageSize: 1,
    };
    return getListInstructionModulesQueryOptions(counted, {
      request,
      query: { queryKey: key(getListInstructionModulesQueryKey(counted)) },
    });
  };

  return (
    <div data-testid={`instruction-library-${domain}`}>
      <ListCardHeader data-testid="instruction-toolbar">
        <FilterTabs label="Filtrează instrucțiunile">
          {tabs.map((tab) => (
            <FilterTab
              key={tab.label}
              to={libraryPaths[domain]}
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
              placeholder="Caută după titlu"
              label="Caută instrucțiuni după titlu"
              testId="instruction-search"
            />
            <ListFilters
              facets={facets}
              values={filters}
              onChange={changeFilters}
              total={modules.isSuccess && !modules.isPlaceholderData ? meta.total : undefined}
              applyLabel={(pending) => (
                <PendingCountLabel query={pendingQuery(pending)} noun={moduleCount} />
              )}
              countLabel={moduleCount}
              testId="instruction-filters"
            />
          </div>
        )}
        <ListActions
          count={
            modules.isSuccess &&
            (unfilteredTotal > 0 || narrowed) && (
              <ListCount testId="instruction-count">
                {narrowed ? (
                  <>
                    <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                    {phone ? unfilteredTotal : moduleCount(unfilteredTotal)}
                  </>
                ) : (
                  moduleCount(meta.total)
                )}
              </ListCount>
            )
          }
        >
          {!tabEmpty && (
            <Button
              className="h-11 md:h-9"
              data-testid="instruction-write"
              onClick={() => setStarting(true)}
            >
              <PenLine aria-hidden="true" />
              Scrie o instrucțiune
            </Button>
          )}
        </ListActions>
      </ListCardHeader>
      <AppliedFilters
        facets={facets}
        values={filters}
        onChange={changeFilters}
        testId="instruction-applied-filters"
      />
      <DataTable
        testId="instruction-table"
        rowTestId="instruction-row"
        label={`Instrucțiunile proprii ${label}`}
        columns={columns}
        data={modules.data?.items}
        rowKey={rowKey}
        onRowClick={(module) =>
          void navigate({
            to: '/instructiuni/$moduleId',
            params: { moduleId: module.id },
            state: openedHere,
          })
        }
        meta={meta}
        noun={moduleNoun}
        status={modules.status}
        isFetching={modules.isFetching}
        isPlaceholderData={modules.isPlaceholderData}
        sort={{ sort, order }}
        onSortChange={onSortChange}
        onPageChange={onPageChange}
        error={
          <LoadFailed
            error={modules.error}
            testId="instruction-load-error"
            busy={modules.isFetching}
            onRetry={() => void modules.refetch()}
          >
            Nu am putut încărca biblioteca.
          </LoadFailed>
        }
        empty={
          narrowed ? (
            <EmptyState
              icon={SearchX}
              title="Nicio instrucțiune nu se potrivește"
              data-testid="instruction-empty-filtered"
              actions={
                <Button
                  variant="outline"
                  data-testid="instruction-empty-clear"
                  onClick={() => (filtered ? changeFilters({}) : changeQuery(undefined))}
                >
                  {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                </Button>
              }
            >
              {filtered
                ? `Nicio instrucțiune ${label} ${state} nu se potrivește ${q ? 'căutării și filtrelor alese' : 'filtrelor alese'}. Scoate unul dintre filtrele de mai sus sau șterge-le pe toate.`
                : `Nicio instrucțiune ${label} ${state} nu are „${q}” în titlu. Verifică scrierea sau caută după o parte din titlu.`}
            </EmptyState>
          ) : archived ? (
            <EmptyState
              icon={Archive}
              title={`Nicio instrucțiune proprie ${label} arhivată`}
              data-testid="instruction-empty"
            >
              Instrucțiunile arhivate vor apărea aici. Le poți reactiva oricând.
            </EmptyState>
          ) : (
            <EmptyState
              icon={BookOpenText}
              title={`Nicio instrucțiune proprie ${label} încă`}
              data-testid="instruction-empty"
              actions={
                <Button data-testid="instruction-write" onClick={() => setStarting(true)}>
                  <PenLine aria-hidden="true" />
                  Scrie o instrucțiune
                </Button>
              }
            >
              Scrie câte o instrucțiune pentru fiecare activitate sau echipament, apoi aplic-o la
              posturile clienților tăi.
            </EmptyState>
          )
        }
      />
      <InstructionModuleDialog editing={editing} onClose={() => setEditing(null)} />
      <InstructionArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <InstructionStartDialog
        open={starting}
        initial={{ domain }}
        onClose={() => setStarting(false)}
        onSubmit={(values) => {
          setStarting(false);
          void navigate({ to: '/instructiuni/nou', search: values, state: openedHere });
        }}
      />
    </div>
  );
}
