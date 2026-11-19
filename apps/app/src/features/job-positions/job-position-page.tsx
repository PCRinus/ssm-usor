import { Button } from '@ssm-usor/ui/components/button';
import { type ErrorComponentProps, getRouteApi, Link } from '@tanstack/react-router';
import { useState } from 'react';

import {
  getGetJobPositionRiskEvaluationQueryKey,
  getListEquipmentQueryKey,
  getListJobPositionsQueryKey,
  getListPositionInstructionsQueryKey,
  useGetJobPositionRiskEvaluation,
  useListEquipment,
  useListJobPositions,
  useListPositionInstructions,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener, openedHere } from '@/app/opener';
import { NotFound, RouteError } from '@/app/route-states';
import { useScrollToHash } from '@/app/use-scroll-to-hash';
import { EditAction, Fact, FactList, SectionCard } from '@/components/section-card';
import { CurrentClientHeaderFact } from '@/features/clients/client-fact';
import { HeaderFact, RecordHeader } from '@/features/clients/record-header';
import { PositionInstructionsCard } from '@/features/instructions/position-instructions-card';
import { EquipmentCard } from '@/features/protective-equipment/equipment-card';
import { PositionRiskEvaluationCard } from '@/features/risk-evaluations/position-risk-evaluation-card';

import { JobPositionBack } from './job-position-back';
import { JobPositionDialog } from './job-position-dialog';
import { JobPositionPending } from './job-position-pending';
import { employeeCountLabel, intervalLabel, staffCategoryLabels } from './job-position-schema';
import { positionSections } from './position-sections';

const jobPositionRoute = getRouteApi('/_authenticated/clienti/$clientId/posturi/$jobPositionId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

const sectionLinks = [
  { hash: positionSections.details, label: 'Postul' },
  { hash: positionSections.equipment, label: 'Echipament de protecție' },
  { hash: positionSections.instructions, label: 'Instrucțiuni SSM' },
  { hash: positionSections.fireInstructions, label: 'Instrucțiuni SU' },
  { hash: positionSections.riskEvaluation, label: 'Fișa de evaluare a riscurilor' },
] as const;

export function JobPositionPage() {
  const { clientId, jobPositionId } = jobPositionRoute.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const { request, ready, key } = useApi();
  const enabled = ready;
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)), enabled },
  });
  // The cards below load these themselves; they are read here only to know when the page has
  // its final height, so a section named in the address is scrolled to where it ends up.
  const equipment = useListEquipment(clientId, jobPositionId, {
    request,
    query: { queryKey: key(getListEquipmentQueryKey(clientId, jobPositionId)), enabled },
  });
  const instructionsQuery = (domain: 'ssm' | 'su') => ({
    request,
    query: {
      queryKey: key(getListPositionInstructionsQueryKey(clientId, jobPositionId, { domain })),
      enabled,
    },
  });
  const instructions = useListPositionInstructions(
    clientId,
    jobPositionId,
    { domain: 'ssm' },
    instructionsQuery('ssm')
  );
  const fireInstructions = useListPositionInstructions(
    clientId,
    jobPositionId,
    { domain: 'su' },
    instructionsQuery('su')
  );
  const riskEvaluation = useGetJobPositionRiskEvaluation(clientId, jobPositionId, {
    request,
    query: {
      queryKey: key(getGetJobPositionRiskEvaluationQueryKey(clientId, jobPositionId)),
      enabled,
    },
  });
  const [editing, setEditing] = useState(false);
  const position = positions.data?.items.find((item) => item.id === jobPositionId);
  useScrollToHash(
    Boolean(position) &&
      !equipment.isPending &&
      !instructions.isPending &&
      !fireInstructions.isPending &&
      !riskEvaluation.isPending
  );
  if (!position) return positions.data ? <JobPositionNotFound /> : <JobPositionPending />;

  return (
    <div data-testid="job-position-page" className="grid gap-5">
      <div className="grid gap-3">
        <RecordHeader
          back={<JobPositionBack />}
          title={position.name}
          facts={
            <>
              <CurrentClientHeaderFact />
              <HeaderFact label="Lucrători">
                <span className="tabular-nums" data-testid="job-position-header-employees">
                  {position.employeeCount}
                </span>
              </HeaderFact>
            </>
          }
        />
        <nav aria-label="Secțiunile postului">
          <ul className="flex flex-wrap gap-2">
            {sectionLinks.map(({ hash, label }) => (
              <li key={hash}>
                <Button asChild variant="secondary" size="sm">
                  <Link
                    to="/clienti/$clientId/posturi/$jobPositionId"
                    state={keepOpener}
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
          <Fact label="Lucrători pe post">
            <Link
              to="/clienti/$clientId/angajati"
              params={{ clientId }}
              state={openedHere}
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
        readOnly={readOnly}
      />
      <PositionInstructionsCard
        id={positionSections.instructions}
        domain="ssm"
        clientId={clientId}
        position={position}
        readOnly={readOnly}
      />
      <PositionInstructionsCard
        id={positionSections.fireInstructions}
        domain="su"
        clientId={clientId}
        position={position}
        readOnly={readOnly}
      />
      <PositionRiskEvaluationCard
        id={positionSections.riskEvaluation}
        clientId={clientId}
        position={position}
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

export function JobPositionNotFound() {
  const { clientId } = jobPositionRoute.useParams();
  return (
    <NotFound
      testId="job-position-not-found"
      title="Postul de lucru nu a fost găsit"
      description="Nu există niciun post cu acest identificator la acest client, sau a fost arhivat."
      action={
        <Button size="lg" asChild>
          <Link to="/clienti/$clientId/posturi" params={{ clientId }}>
            Înapoi la posturi
          </Link>
        </Button>
      }
    />
  );
}

export function JobPositionError({ error }: ErrorComponentProps) {
  return (
    <RouteError
      error={error}
      testId="job-position-error"
      title="Postul nu a putut fi încărcat"
      retryTestId="job-position-retry"
      explainForbidden
      back={<JobPositionBack />}
    />
  );
}
