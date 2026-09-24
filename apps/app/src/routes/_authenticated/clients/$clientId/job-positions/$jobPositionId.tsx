import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  createFileRoute,
  type ErrorComponentProps,
  getRouteApi,
  Link,
  notFound,
  useRouteContext,
  useRouter,
} from '@tanstack/react-router';
import { ArrowLeft, Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { z } from 'zod';

import {
  getListJobPositionsQueryKey,
  getListJobPositionsQueryOptions,
  useListJobPositions,
} from '../../../../../api/generated/api';
import { ApiHttpError } from '../../../../../api/http';
import { useAuth } from '../../../../../auth/auth-context';
import { JobPositionDialog } from '../../../../../job-positions/job-position-dialog';
import {
  employeeCountLabel,
  intervalLabel,
  staffCategoryLabels,
} from '../../../../../job-positions/job-position-schema';
import { EquipmentCard } from '../../../../../protective-equipment/equipment-card';

// A position is read from the client's list, which is a handful of rows and already cached
// by the positions section; there is no request for one position. The loader warms it and
// names the breadcrumb.
export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/$jobPositionId'
)({
  staticData: { fullPage: true },
  params: { parse: (params) => ({ jobPositionId: z.uuid().parse(params.jobPositionId) }) },
  loader: async ({ params, context: { apiRequest, queryClient, auth } }) => {
    const userId = auth.getSnapshot().session?.user.id;
    const { items } = await queryClient.ensureQueryData(
      getListJobPositionsQueryOptions(params.clientId, {
        request: apiRequest,
        query: { queryKey: [...getListJobPositionsQueryKey(params.clientId), userId] },
      })
    );
    const position = items.find((item) => item.id === params.jobPositionId);
    if (!position) throw notFound();
    return { crumb: position.name };
  },
  component: JobPositionPage,
  pendingComponent: JobPositionPending,
  notFoundComponent: JobPositionNotFound,
  errorComponent: JobPositionError,
});

function Fact({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  const empty = children === null || children === undefined || children === '';
  return (
    <div className={wide ? 'bg-card px-5 py-3.5 sm:col-span-2' : 'bg-card px-5 py-3.5'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words whitespace-pre-line">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </div>
  );
}

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

export function JobPositionPage() {
  const { clientId, jobPositionId } = Route.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const userId = session?.user.id ?? '';
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: {
      queryKey: [...getListJobPositionsQueryKey(clientId), userId],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const [editing, setEditing] = useState(false);
  const position = positions.data?.items.find((item) => item.id === jobPositionId);
  if (!position) return positions.data ? <JobPositionNotFound /> : <JobPositionPending />;

  return (
    <div data-testid="job-position-page" className="space-y-7">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link
            to="/clients/$clientId/job-positions"
            params={{ clientId }}
            data-testid="job-position-back"
          >
            <ArrowLeft aria-hidden="true" />
            Posturi de lucru
          </Link>
        </Button>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">{position.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <Badge variant={position.staffCategory === 'execution' ? 'secondary' : 'outline'}>
                {staffCategoryLabels[position.staffCategory]}
              </Badge>
              {position.workZone && <span>{position.workZone}</span>}
            </p>
          </div>
          {!readOnly && (
            <Button
              variant="outline"
              data-testid="job-position-edit"
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden="true" />
              Modifică
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6">
        <section className="overflow-hidden rounded-lg border bg-card">
          <h2 className="border-b px-5 py-3.5 text-sm font-semibold">Postul</h2>
          <dl className="grid gap-px bg-border sm:grid-cols-2">
            <Fact label="Interval de instruire">
              {position.trainingIntervalMonths
                ? intervalLabel(position.trainingIntervalMonths)
                : 'Ca restul categoriei'}
            </Fact>
            <Fact label="Angajați pe post">
              <Link
                to="/clients/$clientId/employees"
                params={{ clientId }}
                className="hover:underline"
                data-testid="job-position-employees-link"
              >
                {employeeCountLabel(position.employeeCount)}
              </Link>
            </Fact>
            <Fact label="Activități desfășurate" wide>
              {position.activities}
            </Fact>
          </dl>
        </section>
        <EquipmentCard
          clientId={clientId}
          position={position}
          userId={userId}
          readOnly={readOnly}
        />
      </div>
      <JobPositionDialog
        clientId={clientId}
        editing={editing ? position : null}
        onClose={() => setEditing(false)}
      />
    </div>
  );
}

function JobPositionPending() {
  return (
    <div className="space-y-7" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

function JobPositionNotFound() {
  const { clientId } = Route.useParams();
  return (
    <div data-testid="job-position-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h1 className="text-2xl font-semibold">Postul de lucru nu a fost găsit</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Nu există niciun post cu acest identificator la acest client, sau a fost arhivat.
      </p>
      <Button asChild className="w-fit">
        <Link to="/clients/$clientId/job-positions" params={{ clientId }}>
          Înapoi la posturi
        </Link>
      </Button>
    </div>
  );
}

function JobPositionError({ error }: ErrorComponentProps) {
  const router = useRouter();
  const message =
    error instanceof ApiHttpError && error.status === 401
      ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
      : error instanceof ApiHttpError && error.status === 403
        ? 'Contul tău nu face parte dintr-o organizație. Contactează administratorul.'
        : 'Nu am putut încărca postul de lucru. Încearcă din nou.';
  return (
    <div
      data-testid="job-position-error"
      role="alert"
      className="mx-auto grid max-w-lg gap-5 py-14"
    >
      <h1 className="text-2xl font-semibold">Postul nu a putut fi încărcat</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{message}</p>
      <Button
        data-testid="job-position-retry"
        variant="outline"
        className="w-fit"
        onClick={() => void router.invalidate()}
      >
        Încearcă din nou
      </Button>
    </div>
  );
}
