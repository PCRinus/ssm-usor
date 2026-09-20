import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  Outlet,
  redirect,
  useRouter,
} from '@tanstack/react-router';
import { z } from 'zod';

import { getGetClientQueryKey, getGetClientQueryOptions } from '../../../api/generated/api';
import { ApiHttpError } from '../../../api/http';

// A lead is a client in an earlier stage (ADR 007), read through the same route. The
// policies hide it from anyone who is not an owner, for whom the API answers 404.
export const Route = createFileRoute('/_authenticated/leads/$leadId')({
  params: { parse: (params) => ({ leadId: z.uuid().parse(params.leadId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    let lead;
    try {
      ({ client: lead } = await queryClient.ensureQueryData(
        getGetClientQueryOptions(params.leadId, {
          request: apiRequest,
          query: { queryKey: [...getGetClientQueryKey(params.leadId), userId] },
        })
      ));
    } catch (cause) {
      if (cause instanceof ApiHttpError && cause.status === 404) throw notFound();
      throw cause;
    }
    // A link kept from before the promotion still leads to the company.
    if (lead.stage === 'client') {
      throw redirect({
        to: '/clients/$clientId/employees',
        params: { clientId: lead.id },
        replace: true,
      });
    }
    return { lead, crumb: lead.legalName };
  },
  component: LeadLayout,
  pendingComponent: LeadPending,
  notFoundComponent: LeadNotFound,
  errorComponent: LeadError,
});

export function LeadLayout() {
  return <Outlet />;
}

function LeadPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-12 w-full rounded-lg" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function LeadNotFound() {
  return (
    <div data-testid="lead-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul potențial nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun client potențial cu acest identificator în organizația ta, sau contul tău
        nu este de administrator.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients">Înapoi la clienți</Link>
      </Button>
    </div>
  );
}

function LeadError({ error }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <div data-testid="lead-error" role="alert" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Clientul potențial nu a putut fi încărcat</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {error instanceof ApiHttpError && error.status === 401
          ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
          : 'Nu am putut încărca datele. Încearcă din nou.'}
      </p>
      <Button variant="outline" className="w-fit" onClick={() => void router.invalidate()}>
        Încearcă din nou
      </Button>
    </div>
  );
}
