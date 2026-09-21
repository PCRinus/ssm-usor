import {
  clientListStatuses,
  type ClientSortKey,
  defaultPageSize,
  sortOrderSchema,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, Handshake, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { getListClientsQueryKey, useListClients } from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';
import { useAuth } from '../../../auth/auth-context';
import {
  type ClientArchiveChange,
  ClientArchiveDialog,
} from '../../../clients/client-archive-dialog';
import type { ClientRow } from '../../../clients/client-columns';
import type { DataTableSort } from '../../../components/data-table/columns';
import { DataTable } from '../../../components/data-table/data-table';
import { leadColumns } from '../../../leads/lead-columns';
import { PromoteLeadDialog } from '../../../leads/promote-lead-dialog';

const leadSortKeys = ['legalName', 'cui'] as const satisfies readonly ClientSortKey[];
type LeadSortKey = (typeof leadSortKeys)[number];

// Page, sort and the archived view live in the URL; defaults are omitted to keep links short.
const defaultSort: DataTableSort & { sort: LeadSortKey } = { sort: 'legalName', order: 'asc' };

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(leadSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  status: z.enum(clientListStatuses).optional().catch(undefined),
});

const filters = [
  { status: undefined, label: 'Activi', testId: 'leads-filter-active' },
  { status: 'archived', label: 'Arhivați', testId: 'leads-filter-archived' },
] as const;

export const Route = createFileRoute('/_authenticated/leads/')({
  validateSearch: searchSchema,
  component: LeadsPage,
});

const rowKey = (row: ClientRow) => row.id;

export function LeadsPage() {
  const {
    page = 1,
    sort = defaultSort.sort,
    order = defaultSort.order,
    status,
  } = Route.useSearch();
  const archived = status === 'archived';
  const navigate = useNavigate({ from: Route.fullPath });
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
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const [promoting, setPromoting] = useState<ClientRow | null>(null);
  const columns = useMemo(() => leadColumns(setArchiveChange, setPromoting), []);

  return (
    <div data-testid="leads-page" className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clienți potențiali</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Companiile cu care discuți, până devin clienți. Le văd doar administratorii
            organizației.
          </p>
        </div>
        <Button asChild>
          <Link to="/leads/new" data-testid="leads-add">
            <Plus aria-hidden="true" />
            Adaugă client potențial
          </Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <nav aria-label="Filtrează clienții potențiali" className="flex gap-1">
            {filters.map((filter) => {
              const active = filter.status === status;
              return (
                <Link
                  key={filter.label}
                  to="/leads"
                  search={filter.status ? { status: filter.status } : {}}
                  data-testid={filter.testId}
                  aria-current={active ? 'page' : undefined}
                  replace
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>
          {leads.isSuccess && (
            <span className="ml-auto text-sm text-muted-foreground" data-testid="leads-count">
              {meta.total === 1 ? '1 client potențial' : `${meta.total} clienți potențiali`}
            </span>
          )}
        </div>
        <DataTable
          testId="leads-table"
          rowTestId="leads-row"
          label="Lista clienților potențiali"
          columns={columns}
          data={leads.data?.items}
          rowKey={rowKey}
          onRowClick={(lead) =>
            void navigate({ to: '/leads/$leadId', params: { leadId: lead.id } })
          }
          meta={meta}
          noun={['client potențial', 'clienți potențiali']}
          status={!apiRequest.baseUrl ? 'error' : leads.status}
          isFetching={leads.isFetching}
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
                    ? 'Doar administratorii organizației lucrează cu clienții potențiali.'
                    : 'Nu am putut încărca lista clienților potențiali. Încearcă din nou.'}
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
              <>
                <Archive className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-base font-medium">Niciun client potențial arhivat</h3>
                <p
                  data-testid="leads-empty"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  Cei cu care discuția nu a dus nicăieri apar aici după arhivare și pot fi
                  restaurați.
                </p>
              </>
            ) : (
              <>
                <Handshake
                  className="mx-auto mb-4 size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <h3 className="text-base font-medium">Niciun client potențial încă</h3>
                <p
                  data-testid="leads-empty"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  Adaugă o companie cu care discuți. Când semnați contractul, o transformi în client
                  cu un clic, cu tot ce ai notat despre ea.
                </p>
                <Button asChild variant="outline" className="mt-5">
                  <Link to="/leads/new">
                    <Plus aria-hidden="true" />
                    Adaugă primul client potențial
                  </Link>
                </Button>
              </>
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
