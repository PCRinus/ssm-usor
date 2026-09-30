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
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import {
  getListEquipmentQueryKey,
  getListJobPositionsQueryKey,
  getListJobPositionsQueryOptions,
  getListPositionInstructionsQueryKey,
  useListEquipment,
  useListJobPositions,
  useListPositionInstructions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useScrollToHash } from '@/app/use-scroll-to-hash';
import { EditAction, Fact, FactList, SectionCard } from '@/components/section-card';
import { useAuth } from '@/features/auth/auth-context';
import { PositionInstructionsCard } from '@/features/instructions/position-instructions-card';
import { JobPositionDialog } from '@/features/job-positions/job-position-dialog';
import {
  employeeCountLabel,
  intervalLabel,
  staffCategoryLabels,
} from '@/features/job-positions/job-position-schema';
import { positionSections } from '@/features/job-positions/position-sections';
import { EquipmentCard } from '@/features/protective-equipment/equipment-card';

// A position is read from the client's list, which is a handful of rows and already cached
// by the positions section; there is no request for one position. The loader warms it and
// names the breadcrumb.
export const Route = createFileRoute(
  '/_authenticated/clients/$clientId/job-positions/$jobPositionId'
)({
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

const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

const sectionLinks = [
  { hash: positionSections.details, label: 'Postul' },
  { hash: positionSections.equipment, label: 'Echipament de protecție' },
  { hash: positionSections.instructions, label: 'Instrucțiuni' },
] as const;

export function JobPositionPage() {
  const { clientId, jobPositionId } = Route.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const userId = session?.user.id ?? '';
  const enabled = Boolean(session && apiRequest.baseUrl);
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled },
  });
  // The cards below load these themselves; they are read here only to know when the page has
  // its final height, so a section named in the address is scrolled to where it ends up.
  const equipment = useListEquipment(clientId, jobPositionId, {
    request: apiRequest,
    query: { queryKey: [...getListEquipmentQueryKey(clientId, jobPositionId), userId], enabled },
  });
  const instructions = useListPositionInstructions(clientId, jobPositionId, {
    request: apiRequest,
    query: {
      queryKey: [...getListPositionInstructionsQueryKey(clientId, jobPositionId), userId],
      enabled,
    },
  });
  const [editing, setEditing] = useState(false);
  const position = positions.data?.items.find((item) => item.id === jobPositionId);
  useScrollToHash(Boolean(position) && !equipment.isPending && !instructions.isPending);
  if (!position) return positions.data ? <JobPositionNotFound /> : <JobPositionPending />;

  return (
    <div data-testid="job-position-page" className="grid gap-5">
      <div className="grid gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-3 w-fit text-muted-foreground">
          <Link
            to="/clients/$clientId/job-positions"
            params={{ clientId }}
            data-testid="job-position-back"
          >
            <ArrowLeft aria-hidden="true" />
            Posturi de lucru
          </Link>
        </Button>
        <h2 className="text-xl font-semibold tracking-tight wrap-anywhere">{position.name}</h2>
        <nav aria-label="Secțiunile postului">
          <ul className="flex flex-wrap gap-2">
            {sectionLinks.map(({ hash, label }) => (
              <li key={hash}>
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to="/clients/$clientId/job-positions/$jobPositionId"
                    params={{ clientId, jobPositionId }}
                    hash={hash}
                    data-testid="job-position-section-link"
                  >
                    {label}
                  </Link>
                </Button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <SectionCard
        id={positionSections.details}
        headingLevel={3}
        data-testid="job-position-details"
        title="Postul"
        action={
          !readOnly && (
            <EditAction data-testid="job-position-edit" onClick={() => setEditing(true)} />
          )
        }
      >
        <FactList className="lg:grid-cols-4">
          <Fact label="Categorie de personal">{staffCategoryLabels[position.staffCategory]}</Fact>
          <Fact label="Zona de lucru">{position.workZone}</Fact>
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
            {position.activities && (
              <span className="whitespace-pre-line">{position.activities}</span>
            )}
          </Fact>
        </FactList>
      </SectionCard>
      <EquipmentCard
        id={positionSections.equipment}
        clientId={clientId}
        position={position}
        userId={userId}
        readOnly={readOnly}
      />
      <PositionInstructionsCard
        id={positionSections.instructions}
        clientId={clientId}
        position={position}
        userId={userId}
        readOnly={readOnly}
      />
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
    <div className="grid gap-5" aria-busy="true">
      <div className="grid gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-8 w-80 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}

function JobPositionNotFound() {
  const { clientId } = Route.useParams();
  return (
    <div data-testid="job-position-not-found" className="mx-auto grid max-w-lg gap-5 py-14">
      <h2 className="text-xl font-semibold tracking-tight">Postul de lucru nu a fost găsit</h2>
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
      <h2 className="text-xl font-semibold tracking-tight">Postul nu a putut fi încărcat</h2>
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
