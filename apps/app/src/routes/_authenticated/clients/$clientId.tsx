import { type CountyCode, countyNames, formatCui } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { z } from 'zod';

import {
  type ClientListResponse,
  getListClientsQueryKey,
  getListClientsQueryOptions,
} from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';

export type Client = ClientListResponse['clients'][number];

// Sections of a client. Only employees exist for now; documents and workplaces will follow.
const sections = [{ to: '/clients/$clientId/employees', label: 'Angajați' }] as const;

// The client comes from the organization's list, which is the only client read the API
// offers. The list is cached per user by the clients page, so navigation reuses it.
export const Route = createFileRoute('/_authenticated/clients/$clientId')({
  params: { parse: (params) => ({ clientId: z.uuid().parse(params.clientId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    const { clients } = await queryClient.ensureQueryData(
      getListClientsQueryOptions({
        request: apiRequest,
        query: { queryKey: [...getListClientsQueryKey(), userId] },
      })
    );
    const client = clients.find((candidate) => candidate.id === params.clientId);
    if (!client) throw notFound();
    // The shell shows the crumb in place of a static title.
    return { client, crumb: client.legalName };
  },
  component: ClientLayout,
  pendingComponent: ClientPending,
  notFoundComponent: ClientNotFound,
  errorComponent: ClientError,
});

function registeredOffice(client: Client) {
  const county = client.countyCode ? countyNames[client.countyCode as CountyCode] : null;
  return [client.locality, county].filter(Boolean).join(', ');
}

export function ClientLayout() {
  const { client } = Route.useLoaderData();
  const office = registeredOffice(client);
  return (
    <div data-testid="client-page" className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{client.legalName}</h1>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="tabular-nums">CUI {formatCui(client.cui, client.vatPayer)}</span>
          {client.caenCode && <span>CAEN {client.caenCode}</span>}
          {office && <span>{office}</span>}
        </p>
      </div>
      <nav aria-label="Secțiunile clientului" className="border-b">
        <ul className="-mb-px flex gap-6">
          {sections.map((section) => (
            <li key={section.to}>
              <Link
                to={section.to}
                params={{ clientId: client.id }}
                data-testid="client-section"
                className="inline-flex h-10 items-center border-b-2 border-transparent text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{
                  className: cn('border-primary text-foreground'),
                  'aria-current': 'page',
                }}
              >
                {section.label}
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
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-56" />
      </div>
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
