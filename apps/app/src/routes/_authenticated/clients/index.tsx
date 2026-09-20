import {
  clientListStatuses,
  type ClientSortKey,
  clientSortKeys,
  defaultPageSize,
  sortOrderSchema,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Archive, Plus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { z } from 'zod';

import { useMe } from '../../../account/use-me';
import { getListClientsQueryKey, useListClients } from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';
import { useAuth } from '../../../auth/auth-context';
import {
  type ClientArchiveChange,
  ClientArchiveDialog,
} from '../../../clients/client-archive-dialog';
import { clientColumns, type ClientRow } from '../../../clients/client-columns';
import type { DataTableSort } from '../../../components/data-table/columns';
import { DataTable } from '../../../components/data-table/data-table';

// Page, sort and the archived view live in the URL; defaults are omitted to keep links short.
const defaultSort: DataTableSort & { sort: ClientSortKey } = { sort: 'legalName', order: 'asc' };

const searchSchema = z.object({
  page: z.number().int().min(1).optional().catch(undefined),
  sort: z.enum(clientSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
  status: z.enum(clientListStatuses).optional().catch(undefined),
});

const filters = [
  { status: undefined, label: 'Activi', testId: 'clients-filter-active' },
  { status: 'archived', label: 'Arhivați', testId: 'clients-filter-archived' },
] as const;

export const Route = createFileRoute('/_authenticated/clients/')({
  validateSearch: searchSchema,
  component: ClientsPage,
});

const rowKey = (row: ClientRow) => row.id;

export function ClientsPage() {
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
  const params = { ...(archived ? { status } : {}), page, pageSize: defaultPageSize, sort, order };
  const clients = useListClients(params, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(params), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const meta = clients.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const isOwner = useMe().data?.membership?.role === 'owner';
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const columns = useMemo(() => clientColumns(isOwner ? setArchiveChange : undefined), [isOwner]);

  return (
    <div data-testid="clients-page" className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Clienți</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Companiile pentru care asiguri serviciile de securitate și sănătate în muncă.
          </p>
        </div>
        <Button asChild>
          <Link to="/clients/new" data-testid="clients-add">
            <Plus aria-hidden="true" />
            Adaugă client
          </Link>
        </Button>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <nav aria-label="Filtrează clienții" className="flex gap-1">
            {filters.map((filter) => {
              const active = filter.status === status;
              return (
                <Link
                  key={filter.label}
                  to="/clients"
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
          {clients.isSuccess && (
            <span className="ml-auto text-sm text-muted-foreground" data-testid="clients-count">
              {meta.total === 1 ? '1 client' : `${meta.total} clienți`}
            </span>
          )}
        </div>
        <DataTable
          testId="clients-table"
          rowTestId="clients-row"
          label="Lista clienților"
          columns={columns}
          data={clients.data?.items}
          rowKey={rowKey}
          onRowClick={(client) =>
            void navigate({ to: '/clients/$clientId/employees', params: { clientId: client.id } })
          }
          meta={meta}
          noun={['client', 'clienți']}
          status={!apiRequest.baseUrl ? 'error' : clients.status}
          isFetching={clients.isFetching}
          sort={{ sort, order }}
          onSortChange={(next) =>
            void navigate({
              replace: true,
              search: (prev) => ({
                ...prev,
                sort: next.sort === defaultSort.sort ? undefined : (next.sort as ClientSortKey),
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
              <p data-testid="clients-error" role="alert" className="text-sm">
                {clients.error instanceof ApiHttpError && clients.error.status === 401
                  ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
                  : clients.error instanceof ApiHttpError && clients.error.status === 403
                    ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
                    : 'Nu am putut încărca lista clienților. Încearcă din nou.'}
              </p>
              {apiRequest.baseUrl && (
                <Button
                  data-testid="clients-retry"
                  variant="outline"
                  className="mt-4"
                  disabled={clients.isFetching}
                  onClick={() => void clients.refetch()}
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
                <h3 className="text-base font-medium">Niciun client arhivat</h3>
                <p
                  data-testid="clients-empty"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  Clienții arhivați apar aici, cu tot ce s-a lucrat pentru ei, și pot fi restaurați.
                </p>
              </>
            ) : (
              <>
                <Users className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-base font-medium">Niciun client încă</h3>
                <p
                  data-testid="clients-empty"
                  className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground"
                >
                  Adaugă prima companie pentru a începe să îi organizezi documentele și termenele.
                </p>
                <Button asChild variant="outline" className="mt-5">
                  <Link to="/clients/new">
                    <Plus aria-hidden="true" />
                    Adaugă primul client
                  </Link>
                </Button>
              </>
            )
          }
        />
      </div>
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
    </div>
  );
}
