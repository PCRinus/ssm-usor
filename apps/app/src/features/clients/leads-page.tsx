import { defaultPageSize } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { Archive, Handshake, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';

import { getListClientsQueryKey, useListClients } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { FilterTab, FilterTabs, ListCardHeader, ListCount } from '@/components/list-card-header';
import { useAuth } from '@/features/auth/auth-context';
import { isEmptyOrLoading } from '@/lib/list-state';

import { type ClientArchiveChange, ClientArchiveDialog } from './client-archive-dialog';
import type { ClientRow } from './client-columns';
import { leadColumns } from './lead-columns';
import type { LeadSortKey } from './lead-sort';
import { PromoteLeadDialog } from './promote-lead-dialog';

const leadsRoute = getRouteApi('/_authenticated/oferte/');

const defaultSort: DataTableSort & { sort: LeadSortKey } = { sort: 'legalName', order: 'asc' };

const filters = [
  { status: undefined, label: 'Active', testId: 'leads-filter-active' },
  { status: 'archived', label: 'Arhivate', testId: 'leads-filter-archived' },
] as const;

const rowKey = (row: ClientRow) => row.id;

export function LeadsPage() {
  const {
    page = 1,
    sort = defaultSort.sort,
    order = defaultSort.order,
    status,
  } = leadsRoute.useSearch();
  const archived = status === 'archived';
  const navigate = leadsRoute.useNavigate();
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = {
    stage: 'lead' as const,
    ...(archived ? { status } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
  };
  const leads = useListClients(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = leads.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const listStatus = !apiRequest.baseUrl ? 'error' : leads.status;
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [promoting, setPromoting] = useState<ClientRow | null>(null);
  const columns = useMemo(() => leadColumns(setArchiveChange, setPromoting), []);

  return (
    <div data-testid="leads-page" className="space-y-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Oferte</h1>
        {(archived || !isEmptyOrLoading(listStatus, meta.total)) && (
          <Button asChild>
            <Link to="/oferte/nou" data-testid="leads-add">
              <Plus aria-hidden="true" />
              Adaugă ofertă
            </Link>
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <ListCardHeader>
          <FilterTabs label="Filtrează ofertele">
            {filters.map((filter) => (
              <FilterTab
                key={filter.label}
                to="/oferte"
                search={filter.status ? { status: filter.status } : {}}
                data-testid={filter.testId}
                active={filter.status === status}
                replace
              >
                {filter.label}
              </FilterTab>
            ))}
          </FilterTabs>
          {leads.isSuccess && (
            <ListCount testId="leads-count">
              {meta.total === 1 ? '1 ofertă' : `${meta.total} oferte`}
            </ListCount>
          )}
        </ListCardHeader>
        <DataTable
          testId="leads-table"
          rowTestId="leads-row"
          label="Lista ofertelor"
          columns={columns}
          data={leads.data?.items}
          rowKey={rowKey}
          onRowClick={(lead) =>
            void navigate({ to: '/oferte/$leadId', params: { leadId: lead.id } })
          }
          meta={meta}
          noun={['ofertă', 'oferte']}
          status={listStatus}
          isFetching={leads.isFetching}
          isPlaceholderData={leads.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={(next) =>
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                sort: next.sort === defaultSort.sort ? undefined : (next.sort as LeadSortKey),
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
              <p data-testid="leads-error" role="alert" className="text-sm">
                {leads.error instanceof ApiHttpError && leads.error.status === 401
                  ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                  : leads.error instanceof ApiHttpError && leads.error.status === 403
                    ? 'Doar adminii organizației lucrează cu ofertele.'
                    : 'Nu am putut încărca lista ofertelor. Încearcă din nou.'}
              </p>
              {apiRequest.baseUrl &&
                !(leads.error instanceof ApiHttpError && leads.error.status === 403) && (
                  <Button
                    data-testid="leads-retry"
                    variant="outline"
                    className="mt-4"
                    disabled={leads.isFetching}
                    onClick={() => void leads.refetch()}
                  >
                    Încearcă din nou
                  </Button>
                )}
            </>
          }
          empty={
            archived ? (
              <EmptyState icon={Archive} title="Nicio ofertă arhivată" data-testid="leads-empty">
                Ofertele arhivate vor apărea aici. Le poți reactiva oricând.
              </EmptyState>
            ) : (
              <EmptyState
                icon={Handshake}
                title="Nicio ofertă încă"
                data-testid="leads-empty"
                actions={
                  <Button asChild>
                    <Link to="/oferte/nou" data-testid="leads-add">
                      <Plus aria-hidden="true" />
                      Adaugă prima ofertă
                    </Link>
                  </Button>
                }
              >
                Adaugă o companie cu care discuți. Când semnați contractul, o poți transforma în
                client împreună cu notițele și datele salvate.
              </EmptyState>
            )
          }
        />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
      <PromoteLeadDialog
        lead={promoting}
        signed={promoting ? promoting.serviceContractState === 'signed' : undefined}
        onClose={() => setPromoting(null)}
      />
    </div>
  );
}
