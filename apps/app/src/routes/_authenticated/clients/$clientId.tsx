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
import { BriefcaseBusiness, Building2, ClipboardList, FileText, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { getGetClientQueryKey, getGetClientQueryOptions } from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';
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
    <div className="min-w-0 bg-card px-5 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium">{children}</dd>
    </div>
  );
}

export function ClientLayout() {
  const { client } = Route.useLoaderData();
  // Forms such as the new employee page stand on their own; the breadcrumb keeps the context.
  const fullPage = useMatches({
    select: (matches) => matches.some((match) => match.staticData.fullPage),
  });
  const office = registeredOffice(client);
  const caen = client.caenCode ? caenClassName(client.caenCode) : null;
  if (fullPage) return <Outlet />;
  return (
    <div data-testid="client-page" className="space-y-7">
      <header className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center gap-4 px-5 py-5 sm:px-6">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Building2 className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Client
            </p>
            <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight">
              {client.legalName}
            </h1>
          </div>
        </div>
        {/* Hairline dividers in any column count: a border-colored grid with card-colored cells. */}
        <dl className="grid grid-cols-2 gap-px border-t bg-border lg:grid-cols-4">
          <Fact label="CUI">
            <span className="tabular-nums">{formatCui(client.cui, client.vatPayer)}</span>
          </Fact>
          <Fact label="Activitate principală">
            {client.caenCode ? (
              <>
                <span className="tabular-nums">{client.caenCode}</span>
                {caen && <span className="font-normal text-muted-foreground"> · {caen}</span>}
              </>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label="Sediu social">{office || '—'}</Fact>
          <Fact label="Angajați declarați">
            <span className="tabular-nums">{client.declaredEmployeeCount ?? '—'}</span>
          </Fact>
        </dl>
      </header>
      <nav aria-label="Secțiunile clientului" className="border-b">
        <ul className="-mb-px flex gap-1">
          {sections.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                params={{ clientId: client.id }}
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
    </div>
  );
}

function ClientPending() {
  return (
    <div className="space-y-7" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-lg" />
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
