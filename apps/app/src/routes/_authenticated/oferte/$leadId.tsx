import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  createFileRoute,
  type ErrorComponentProps,
  Link,
  notFound,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { z } from 'zod';

import { getGetClientQueryKey, getGetClientQueryOptions } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { keepOpener } from '@/app/opener';
import { NotFound, RouteError } from '@/app/route-states';
import { backGap } from '@/components/back-gap';
import { BackLink } from '@/components/back-link';

// A lead is a client in an earlier stage (ADR 007), read through the same route. The
// policies hide it from anyone who is not an owner, for whom the API answers 404.
export const Route = createFileRoute('/_authenticated/oferte/$leadId')({
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
        to: '/clienti/$clientId/detalii',
        params: { clientId: lead.id },
        replace: true,
        state: keepOpener,
      });
    }
    return { lead, crumb: lead.legalName };
  },
  component: LeadLayout,
  pendingComponent: LeadPending,
  notFoundComponent: LeadNotFound,
  errorComponent: LeadError,
});

function LeadLayout() {
  return <Outlet />;
}

function LeadPending() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className={cn('flex items-center', backGap)}>
        <div className="flex shrink-0">
          <BackLink to="/oferte" label="Înapoi la oferte" />
        </div>
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function LeadNotFound() {
  return (
    <NotFound
      testId="lead-not-found"
      title="Oferta nu a fost găsită"
      description="Nu există nicio ofertă cu acest identificator în organizația ta, sau contul tău nu este de admin."
      action={
        <Button size="lg" asChild>
          <Link to="/clienti">Înapoi la clienți</Link>
        </Button>
      }
    />
  );
}

function LeadError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="lead-error"
      title="Oferta nu a putut fi încărcată"
      back={<BackLink to="/oferte" label="Înapoi la oferte" />}
    />
  );
}
