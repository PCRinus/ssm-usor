import {
  defaultPageSize,
  type InstructionDomain,
  type InstructionModuleSortKey,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, BookOpenText } from 'lucide-react';
import { useMemo, useState } from 'react';

import { getListInstructionModulesQueryKey, useListInstructionModules } from '@/api/generated/api';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';

import {
  type InstructionArchiveChange,
  InstructionArchiveDialog,
} from './instruction-archive-dialog';
import { instructionColumns } from './instruction-columns';
import { InstructionModuleDialog, type ModuleEditing } from './instruction-module-dialog';
import {
  domainLabels,
  type InstructionModule,
  type LibrarySearch,
  moduleCountLabel,
} from './instruction-schema';

const libraryPaths = { ssm: '/instructiuni/ssm', su: '/instructiuni/su' } as const;

const defaultSort: DataTableSort & { sort: InstructionModuleSortKey } = {
  sort: 'title',
  order: 'asc',
};

const filters = [
  { status: undefined, label: 'Active', testId: 'instruction-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'instruction-filter-archived' },
] as const;

const rowKey = (row: InstructionModule) => row.id;

export function InstructionLibrary({
  domain,
  search,
  userId,
}: {
  domain: InstructionDomain;
  search: LibrarySearch;
  userId: string;
}) {
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, status } = search;
  const archived = status === 'archived';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate({ from: libraryPaths[domain] });
  const params = {
    ...(archived ? { status } : {}),
    domain,
    page,
    pageSize: defaultPageSize,
    sort,
    order,
  };
  const modules = useListInstructionModules(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListInstructionModulesQueryKey(params), userId],
      placeholderData: keepPreviousData,
    },
  });
  const meta = modules.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const [editing, setEditing] = useState<ModuleEditing>(null);
  const [archiveChange, setArchiveChange] = useState<InstructionArchiveChange | null>(null);
  const columns = useMemo(
    () => instructionColumns({ onEdit: setEditing, onArchiveChange: setArchiveChange }),
    []
  );
  const label = domainLabels[domain];

  return (
    <div
      data-testid={`instruction-library-${domain}`}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <ListCardHeader>
        <FilterTabs label="Filtrează instrucțiunile">
          {filters.map((filter) => (
            <FilterTab
              key={filter.label}
              to={libraryPaths[domain]}
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
        {modules.isSuccess && (
          <ListCount testId="instruction-count">
            {meta.total === 1 ? '1 instrucțiune' : moduleCountLabel(meta.total)}
          </ListCount>
        )}
      </ListCardHeader>
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
            state: { openedFromList: true },
          })
        }
        meta={meta}
        noun={['instrucțiune', 'instrucțiuni']}
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
          <div data-testid="instruction-empty">
            {archived ? (
              <>
                <Archive className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-base font-medium">
                  {`Nicio instrucțiune proprie ${label} arhivată`}
                </h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Instrucțiunile arhivate vor apărea aici. Le poți reactiva oricând.
                </p>
              </>
            ) : (
              <>
                <BookOpenText
                  className="mx-auto mb-4 size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="text-base font-medium">{`Nicio instrucțiune proprie ${label} încă`}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                  Scrie câte o instrucțiune pentru fiecare activitate sau echipament, apoi aplic-o
                  la posturile clienților tăi.
                </p>
              </>
            )}
          </div>
        }
      />
      <InstructionModuleDialog editing={editing} onClose={() => setEditing(null)} />
      <InstructionArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
    </div>
  );
}
