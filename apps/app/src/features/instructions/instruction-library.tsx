import {
  categoryFitsDomain,
  defaultPageSize,
  type InstructionDomain,
  instructionModuleGroups,
  type InstructionModuleListFilters,
  type InstructionModuleSortKey,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, BookOpenText, BriefcaseBusiness, PenLine, SearchX, Tag } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import {
  getListInstructionModulesQueryKey,
  type ListInstructionModulesParams,
  useListInstructionModules,
} from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { SearchInput } from '@/components/search-input';
import { roCount } from '@/features/employees/employee-format';
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
import { useInstructionStart } from './instruction-start-context';

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
const moduleCount = (count: number) => roCount(count, ...moduleNoun);

const rowKey = (row: InstructionModule) => row.id;

function PendingModulesLabel({
  params,
  userId,
}: {
  params: ListInstructionModulesParams;
  userId: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const counted = { ...params, page: 1, pageSize: 1 };
  const total = useListInstructionModules(counted, {
    request: apiRequest,
    query: {
      queryKey: [...getListInstructionModulesQueryKey(counted), userId],
      placeholderData: keepPreviousData,
    },
  }).data?.total;
  return total === undefined ? 'Arată rezultatele' : `Arată ${moduleCount(total)}`;
}

export function InstructionLibrary({
  domain,
  search,
  userId,
}: {
  domain: InstructionDomain;
  search: LibrarySearch;
  userId: string;
}) {
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status, q } = search;
  const archived = status === 'archived';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: libraryPaths[domain] });
  const { start, setTabEmpty } = useInstructionStart();
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
    request: apiRequest,
    query: {
      queryKey: [...getListInstructionModulesQueryKey(params), userId],
      placeholderData: keepPreviousData,
    },
  });
  const meta = modules.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = modules.data?.unfilteredTotal ?? 0;
  const tabEmpty = !archived && isEmptyOrLoading(modules.status, unfilteredTotal) && !narrowed;
  useEffect(() => setTabEmpty(tabEmpty), [setTabEmpty, tabEmpty]);
  useEffect(() => () => setTabEmpty(false), [setTabEmpty]);
  const [editing, setEditing] = useState<ModuleEditing>(null);
  const [archiveChange, setArchiveChange] = useState<InstructionArchiveChange | null>(null);
  const columns = useMemo(
    () => instructionColumns({ archived, onEdit: setEditing, onArchiveChange: setArchiveChange }),
    [archived]
  );
  const label = domainLabels[domain];
  const state = archived ? 'arhivată' : 'activă';
  const changeFilters = (values: ListFilterValues<FilterKey>) =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...(listFilters.searchOf(values) as InstructionModuleListFilters),
        page: undefined,
      }),
    });
  const clearSearch = (clearFilters: boolean) =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({
        ...prev,
        ...(clearFilters ? listFilters.searchOf({}) : {}),
        q: undefined,
        page: undefined,
      }),
    });

  return (
    <div
      data-testid={`instruction-library-${domain}`}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <ListCardHeader>
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
              onSearch={(next) =>
                void navigate({
                  replace: true,
                  resetScroll: false,
                  search: (prev) => ({ ...prev, q: next || undefined, page: undefined }),
                })
              }
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
                <PendingModulesLabel
                  params={{
                    ...tabParams,
                    ...(listFilters.searchOf(pending) as InstructionModuleListFilters),
                  }}
                  userId={userId}
                />
              )}
              countLabel={moduleCount}
              testId="instruction-filters"
            />
          </div>
        )}
        {modules.isSuccess && (unfilteredTotal > 0 || narrowed) && (
          <ListCount testId="instruction-count">
            {narrowed ? (
              <>
                <b className="font-semibold text-foreground">{meta.total}</b> din{' '}
                {moduleCount(unfilteredTotal)}
              </>
            ) : (
              moduleCount(meta.total)
            )}
          </ListCount>
        )}
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
        onSortChange={(next) =>
          void navigate({
            replace: true,
            resetScroll: false,
            search: (prev) => ({
              ...prev,
              sort:
                next.sort === defaultSort.sort
                  ? undefined
                  : (next.sort as InstructionModuleSortKey),
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
            <p data-testid="instruction-load-error" role="alert" className="text-sm">
              Nu am putut încărca biblioteca.
            </p>
            <Button
              variant="outline"
              className="mt-4"
              disabled={modules.isFetching}
              onClick={() => void modules.refetch()}
            >
              Încearcă din nou
            </Button>
          </>
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
                  onClick={() => clearSearch(filtered)}
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
                <Button data-testid="instruction-write" onClick={start}>
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
    </div>
  );
}
