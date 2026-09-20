import { caenClassName, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  Outlet,
  useMatches,
  useRouter,
} from '@tanstack/react-router';
import {
  Archive,
  ArchiveRestore,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  FileText,
  Pencil,
  UsersRound,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import { useMe } from '../../../account/use-me';
import { getGetClientQueryKey, getGetClientQueryOptions } from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';
import {
  type ClientArchiveChange,
  ClientArchiveDialog,
} from '../../../clients/client-archive-dialog';
import { registeredOffice } from '../../../clients/client-columns';

// The documents follow the data they print.
const sections = [
  { to: '/clients/$clientId/employees', label: 'Angajați', icon: UsersRound },
  { to: '/clients/$clientId/job-positions', label: 'Posturi de lucru', icon: BriefcaseBusiness },
  { to: '/clients/$clientId/document-data', label: 'Date pentru documente', icon: ClipboardList },
  { to: '/clients/$clientId/documents', label: 'Documente', icon: FileText },
] as const;

// Row-level security hides other organizations' clients, so a 404 from the API is the
// not-found screen whether the client belongs to someone else or does not exist.
export const Route = createFileRoute('/_authenticated/clients/$clientId')({
  params: { parse: (params) => ({ clientId: z.uuid().parse(params.clientId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    try {
      const { client } = await queryClient.ensureQueryData(
        getGetClientQueryOptions(params.clientId, {
          request: apiRequest,
          query: { queryKey: [...getGetClientQueryKey(params.clientId), userId] },
        })
      );
      // The shell shows the crumb in place of a static title.
      return { client, crumb: client.legalName };
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
  },
  component: ClientLayout,
  pendingComponent: ClientPending,
  notFoundComponent: ClientNotFound,
  errorComponent: ClientError,
});

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

export function ClientLayout() {
  const { client } = Route.useLoaderData();
  // Forms such as the new employee page stand on their own; the breadcrumb keeps the context.
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });
  const isOwner = useMe().data?.membership?.role === 'owner';
  const [archiveChange, setArchiveChange] = useState<ClientArchiveChange | null>(null);
  const office = registeredOffice(client);
  const caen = client.caenCode ? caenClassName(client.caenCode) : null;
  if (fullPage) return <Outlet />;
  return (
    <div data-testid="client-page" className="space-y-5">
      <header className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Building2 className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{client.legalName}</h1>
          <dl className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-sm">
            <Fact label="CUI">
              <span className="tabular-nums">{formatCui(client.cui, client.vatPayer)}</span>
            </Fact>
            {client.caenCode && (
              <Fact label="CAEN">
                <span className="tabular-nums">{client.caenCode}</span>
                {caen && <span className="text-muted-foreground"> · {caen}</span>}
              </Fact>
            )}
            {office && <Fact label="Sediu">{office}</Fact>}
            {client.declaredEmployeeCount !== null && (
              <Fact label="Angajați declarați">
                <span className="tabular-nums">{client.declaredEmployeeCount}</span>
              </Fact>
            )}
          </dl>
        </div>
        {!client.archivedAt && (
          <div className="flex shrink-0 gap-2">
            <Button asChild variant="outline" size="sm" data-testid="client-edit">
              <Link to="/clients/$clientId/edit" params={{ clientId: client.id }}>
                <Pencil aria-hidden="true" />
                Modifică
              </Link>
            </Button>
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                data-testid="client-archive"
                onClick={() => setArchiveChange({ client, action: 'archive' })}
              >
                <Archive aria-hidden="true" />
                Arhivează…
              </Button>
            )}
          </div>
        )}
      </header>
      {client.archivedAt && (
        <div
          data-testid="client-archived-banner"
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/50 px-4 py-3 text-sm"
        >
          <p>
            <span className="font-medium">Client arhivat.</span> Datele și documentele lui pot fi
            consultate și descărcate, dar nu modificate.
            {!isOwner && ' Un administrator al organizației îl poate restaura.'}
          </p>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              data-testid="client-restore"
              onClick={() => setArchiveChange({ client, action: 'restore' })}
            >
              <ArchiveRestore aria-hidden="true" />
              Restaurează…
            </Button>
          )}
        </div>
      )}
      <nav aria-label="Secțiunile clientului" className="sticky top-16 z-20 border-b bg-background">
        <ul className="-mb-px flex gap-1">
          {sections.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                params={{ clientId: client.id }}
                resetScroll={false}
                data-testid="client-section"
                className="inline-flex h-10 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-primary data-[status=active]:text-foreground"
                activeProps={{ 'aria-current': 'page' }}
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
      <ClientArchiveDialog change={archiveChange} onClose={() => setArchiveChange(null)} />
    </div>
  );
}

function ClientPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}

function ClientNotFound() {
  return (
    <div data-testid="client-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun client activ cu acest identificator în organizația ta.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients">Înapoi la clienți</Link>
      </Button>
    </div>
  );
}

function ClientError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : error instanceof ApiHttpError && error.status === 403
        ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
        : 'Nu am putut încărca datele clientului. Încearcă din nou.';
  return (
    <div data-testid="client-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul nu a putut fi încărcat</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        data-testid="client-retry"
        variant="outline"
        className="w-fit"
        onClick={() => void router.invalidate()}
      >
        Încearcă din nou
      </Button>
    </div>
  );
}
