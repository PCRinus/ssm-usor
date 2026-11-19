import { formatEmployeeName, type TrainingDomain } from '@ssm-usor/contracts';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef } from 'react';

import { getGetTrainingQueryKey, type TrainingResponse, useGetTraining } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';

import { NotOnSheet } from './not-on-sheet';
import { SignatureState } from './training-cells';
import { notOnSheet, personSignatureLabels } from './training-format';
import { TrainingMaterial } from './training-material';

const employeeTrainingTabs = {
  ssm: '/clienti/$clientId/angajati/$employeeId/instruire/ssm',
  su: '/clienti/$clientId/angajati/$employeeId/instruire/su',
} as const satisfies Record<TrainingDomain, string>;

function Heading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1.5 text-[13px] font-semibold text-table-head-foreground">{children}</h4>
  );
}

function PersonLine({ person, state }: { person: ReactNode; state: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b py-1.5 last:border-b-0">
      <span className="min-w-0 break-words">{person}</span>
      {state}
    </li>
  );
}

// Read when the row opens: the list carries counts only, not every attendee.
export function TrainingDetails({
  clientId,
  trainingId,
  userId,
  scrollIntoView = false,
}: {
  clientId: string;
  trainingId: string;
  userId: string;
  // The row a link arrived to open, which may sit far down the page.
  scrollIntoView?: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const detail = useGetTraining(clientId, trainingId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetTrainingQueryKey(clientId, trainingId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  if (detail.isError) {
    return (
      <LoadFailed
        testId="training-details-error"
        busy={detail.isFetching}
        onRetry={() => void detail.refetch()}
      >
        Nu am putut încărca detaliile.
      </LoadFailed>
    );
  }
  if (!detail.data) {
    return (
      <div className="grid gap-2" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    );
  }
  return (
    <Details clientId={clientId} training={detail.data.training} scrollIntoView={scrollIntoView} />
  );
}

function Details({
  clientId,
  training,
  scrollIntoView,
}: {
  clientId: string;
  training: TrainingResponse['training'];
  scrollIntoView: boolean;
}) {
  const details = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollIntoView) details.current?.scrollIntoView({ block: 'center' });
  }, [scrollIntoView]);
  const slots = [
    {
      key: 'trainer',
      name: training.trainer.name,
      role: 'a instruit',
      state: training.slotSignatures.trainer,
    },
    ...(training.verifier && training.slotSignatures.verifier
      ? [
          {
            key: 'verifier',
            name: training.verifier.name,
            role: 'a verificat',
            state: training.slotSignatures.verifier,
          },
        ]
      : []),
    ...(training.slotSignatures.admitter && training.records[0]?.admission
      ? [
          {
            key: 'admitter',
            name: training.records[0].admission.name,
            role: 'a admis la lucru',
            state: training.slotSignatures.admitter,
          },
        ]
      : []),
  ];
  return (
    <div
      ref={details}
      data-testid="training-details"
      className="grid gap-x-10 gap-y-5 text-sm lg:grid-cols-2"
    >
      <div className="min-w-0">
        <Heading>Material</Heading>
        <TrainingMaterial text={training.material} className="mb-4 max-w-[68ch]" />
        <Heading>Semnează pentru instruire</Heading>
        <ul>
          {slots.map((slot) => (
            <PersonLine
              key={slot.key}
              person={
                <>
                  {slot.name === null ? (
                    <NotOnSheet>{notOnSheet.name}</NotOnSheet>
                  ) : (
                    <Masked>{slot.name}</Masked>
                  )}{' '}
                  {slot.role}
                </>
              }
              state={
                <SignatureState
                  state={slot.state}
                  label={personSignatureLabels[slot.state]}
                  testId="training-details-slot"
                />
              }
            />
          ))}
        </ul>
      </div>
      <div className="min-w-0">
        <Heading>Participanți ({training.records.length})</Heading>
        <ul>
          {training.records.map((record) => (
            <PersonLine
              key={record.id}
              person={
                <Link
                  to={employeeTrainingTabs[training.domain]}
                  state={openedHere}
                  params={{ clientId, employeeId: record.employee.id }}
                  data-testid="trainings-attendee"
                  className="font-medium underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
                >
                  <Masked>{formatEmployeeName(record.employee)}</Masked>
                </Link>
              }
              state={
                <SignatureState
                  state={record.signature}
                  label={personSignatureLabels[record.signature]}
                  testId="trainings-attendee-signature"
                />
              }
            />
          ))}
        </ul>
      </div>
    </div>
  );
}
