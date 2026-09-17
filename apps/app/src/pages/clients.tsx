import { type CountyCode, countyNames, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Plus, Users } from 'lucide-react';

import {
  type ClientListResponse,
  getListClientsQueryKey,
  useListClients,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { useAuth } from '../auth/auth-context';

type Client = ClientListResponse['clients'][number];

function registeredOffice(client: Client) {
  const county = client.countyCode ? countyNames[client.countyCode as CountyCode] : null;
  return [client.locality, county].filter(Boolean).join(', ') || '—';
}

export function ClientsPage() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const clients = useListClients({
    request: apiRequest,
    query: {
      queryKey: [...getListClientsQueryKey(), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const rows = clients.data?.clients ?? [];

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
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-4">
          <h2 className="text-sm font-medium">Lista clienților</h2>
          {clients.isSuccess && (
            <span className="text-sm text-muted-foreground" data-testid="clients-count">
              {rows.length === 1 ? '1 client' : `${rows.length} clienți`}
            </span>
          )}
        </div>
        <Table data-testid="clients-table" aria-label="Lista clienților">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Companie</TableHead>
              <TableHead>CUI</TableHead>
              <TableHead>Sediu social</TableHead>
              <TableHead className="pr-5 text-right">Angajați</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!apiRequest.baseUrl || clients.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-48 px-5 text-center whitespace-normal">
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
                </TableCell>
              </TableRow>
            ) : clients.isPending ? (
              Array.from({ length: 3 }, (_, index) => (
                <TableRow key={index} className="hover:bg-transparent">
                  <TableCell className="pl-5">
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-36" />
                  </TableCell>
                  <TableCell className="pr-5">
                    <Skeleton className="ml-auto h-4 w-10" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="h-72 px-5 text-center whitespace-normal">
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
                </TableCell>
              </TableRow>
            ) : (
              rows.map((client) => (
                <TableRow key={client.id} data-testid="clients-row">
                  <TableCell className="pl-5 font-medium">
                    {client.legalName}
                    {client.caenCode && (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                        CAEN {client.caenCode}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatCui(client.cui, client.vatPayer)}
                  </TableCell>
                  <TableCell>{registeredOffice(client)}</TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">
                    {client.declaredEmployeeCount ?? '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
