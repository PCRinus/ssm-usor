import {
  formatEmployeeName,
  supplementaryTrainingReasonLabels,
  type TrainingDomain,
  trainingDomainLabels,
  type TrainingPhase,
  trainingPhaseLabels,
  type TrainingStatus,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { ClipboardCheck, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  type EmployeeTrainingRecordListResponse,
  getListEmployeeTrainingRecordsQueryKey,
  getListTrainingsQueryKey,
  useListEmployeeTrainingRecords,
  useListTrainings,
} from '@/api/generated/api';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { formatDate } from '@/features/employees/employee-format';
import { EmployeePending } from '@/features/employees/employee-pending';
import { useEmployee } from '@/features/employees/use-employee';
import { intervalLabel } from '@/features/job-positions/job-position-schema';
import { RecordSignatures } from '@/features/signatures/record-signatures';
import {
  trainingLocks,
  type TrainingSigning,
  useRecordSignatures,
} from '@/features/signatures/use-record-signatures';
import { TrainingSheetDownload } from '@/features/training-sheets/training-sheet-download';
import { TrainingSheetReadiness } from '@/features/training-sheets/training-sheet-readiness';

import { DeleteTrainingDialog, type TrainingToDelete } from './delete-training-dialog';
import { TrainingDialog, type TrainingDialogTarget } from './training-dialog';
import { formatDuration, formatPerson } from './training-format';
import { TrainingMaterial } from './training-material';
import { TrainingStateBadge } from './training-state-badge';

type EmployeeTrainingRecord = EmployeeTrainingRecordListResponse['items'][number];

const employeeRoute = getRouteApi('/_authenticated/clients/$clientId/employees/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

// A new hire's trainings come in the law's order; afterwards the periodic one is the usual.
function nextPhase(records: EmployeeTrainingRecord[]): TrainingPhase {
  const held = new Set(records.map((record) => record.training.phase));
  if (!held.has('introductory_general')) return 'introductory_general';
  if (!held.has('workplace')) return 'workplace';
  return 'periodic';
}

function StatusFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const sourceLinkClass = 'underline underline-offset-4 hover:text-foreground';

const programmeFocus = {
  ssm: 'training-schedule',
  psi: 'fire-training-schedule',
} as const satisfies Record<TrainingDomain, string>;

function IntervalFact({
  clientId,
  domain,
  status,
  jobPosition,
  readOnly,
}: {
  clientId: string;
  domain: TrainingDomain;
  status: TrainingStatus;
  jobPosition: { id: string; name: string };
  readOnly: boolean;
}) {
  const programme = { to: '/clients/$clientId/training', params: { clientId } } as const;
  const search = { focus: programmeFocus[domain] };
  if (status.intervalMonths === null) {
    return (
      <span data-testid="training-interval" className="grid gap-0.5">
        <span className="font-normal text-muted-foreground">Nestabilit</span>
        {!readOnly && (
          <Link
            {...programme}
            search={search}
            data-testid="training-interval-set"
            title={domain === 'ssm' ? 'Postul își poate avea și propriul interval' : undefined}
            className={`text-xs font-normal text-muted-foreground ${sourceLinkClass}`}
          >
            Stabilește intervalul
          </Link>
        )}
      </span>
    );
  }
  return (
    <span data-testid="training-interval" className="grid gap-0.5">
      <span>{capitalized(intervalLabel(status.intervalMonths))}</span>
      <span className="text-xs font-normal text-muted-foreground">
        {status.intervalSource === 'position' ? (
          <Link
            to="/clients/$clientId/job-positions/$jobPositionId"
            params={{ clientId, jobPositionId: jobPosition.id }}
            data-testid="training-interval-source"
            className={sourceLinkClass}
          >
            din postul {jobPosition.name}
          </Link>
        ) : (
          <Link
            {...programme}
            search={search}
            data-testid="training-interval-source"
            className={sourceLinkClass}
          >
            {domain === 'ssm'
              ? 'din programul de instruire al clientului'
              : 'din datele de instruire PSI ale clientului'}
          </Link>
        )}
      </span>
    </span>
  );
}

export function EmployeeTrainingTab({ domain }: { domain: TrainingDomain }) {
  const { clientId, employeeId } = employeeRoute.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const employee = useEmployee(clientId, employeeId).data?.employee;
  const params = { domain };
  const records = useListEmployeeTrainingRecords(clientId, employeeId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeeTrainingRecordsQueryKey(clientId, employeeId, params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const trainings = useListTrainings(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListTrainingsQueryKey(clientId, params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const signing = new Map<string, TrainingSigning>(
    trainings.data?.items.map((training) => [training.id, training]) ?? []
  );
  const [target, setTarget] = useState<TrainingDialogTarget | null>(null);
  const [deleting, setDeleting] = useState<TrainingToDelete | null>(null);
  if (!employee) return <EmployeePending />;
  const status = employee.training[domain];
  const label = trainingDomainLabels[domain];
  const items = records.data?.items ?? [];
  const record = () => setTarget({ kind: 'new', domain, phase: nextPhase(items) });
  const recordButton = !readOnly && (
    <Button data-testid="training-record" disabled={!records.data} onClick={record}>
      <Plus aria-hidden="true" />
      Înregistrează o instruire
    </Button>
  );

  return (
    <div data-testid="employee-training-tab" data-domain={domain} className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Instruire {label}</h2>
        <div className="flex flex-wrap gap-2">
          <div data-testid="training-tab-actions" className="flex flex-wrap gap-2">
            <TrainingSheetDownload clientId={clientId} employeeId={employeeId} domain={domain} />
          </div>
          {recordButton}
        </div>
      </div>
      <TrainingSheetReadiness clientId={clientId} employeeId={employeeId} domain={domain} />

      <dl
        data-testid="training-status"
        className="grid gap-4 rounded-lg border bg-card px-5 py-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatusFact label="Starea instruirii">
          {status.state ? (
            <TrainingStateBadge state={status.state} testId="training-state" />
          ) : (
            <span className="font-normal text-muted-foreground" data-testid="training-state">
              Fără termen: nu mai lucrează la client
            </span>
          )}
        </StatusFact>
        <StatusFact label="Următoarea instruire">
          <span data-testid="training-due-on">
            {status.dueOn ? (
              formatDate(status.dueOn)
            ) : (
              <span className="font-normal text-muted-foreground">
                {status.state === 'untrained'
                  ? 'După instruirea la angajare'
                  : status.state
                    ? 'Intervalul de instruire nu este stabilit'
                    : '—'}
              </span>
            )}
          </span>
        </StatusFact>
        <StatusFact label="Intervalul de instruire">
          <IntervalFact
            clientId={clientId}
            domain={domain}
            status={status}
            jobPosition={employee.jobPosition}
            readOnly={readOnly}
          />
        </StatusFact>
        <StatusFact label="Ultima instruire periodică">
          <span data-testid="training-last-periodic">
            {status.lastPeriodicOn ? (
              formatDate(status.lastPeriodicOn)
            ) : (
              <span className="font-normal text-muted-foreground">—</span>
            )}
          </span>
        </StatusFact>
      </dl>

      {records.isError ? (
        <Notice
          variant="destructive"
          data-testid="training-records-error"
          action={
            <Button
              variant="outline"
              disabled={records.isFetching}
              onClick={() => void records.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca instruirile. Încearcă din nou.
        </Notice>
      ) : !records.data ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-lg" />
          <Skeleton className="h-28 w-full rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card px-5 py-10">
          <EmptyState
            icon={ClipboardCheck}
            data-testid="training-records-empty"
            actions={recordButton}
          >
            Nicio instruire înregistrată încă. Fiecare instruire {label} a angajatului apare aici și
            în fișa lui individuală.
          </EmptyState>
        </div>
      ) : (
        <ol className="grid gap-3" aria-label={`Instruirile ${label}`}>
          {items.map((item) => (
            <RecordItem
              key={item.id}
              clientId={clientId}
              userId={userId}
              employeeName={formatEmployeeName(employee)}
              record={item}
              trainingSigning={signing.get(item.training.id)}
              readOnly={readOnly}
              onEdit={() => setTarget({ kind: 'edit', trainingId: item.training.id })}
              onDelete={() =>
                setDeleting({
                  id: item.training.id,
                  phase: item.training.phase,
                  heldOn: item.training.heldOn,
                })
              }
            />
          ))}
        </ol>
      )}

      <TrainingDialog
        clientId={clientId}
        userId={userId}
        target={target}
        fixedAttendee={employee}
        onClose={() => setTarget(null)}
      />
      <DeleteTrainingDialog
        clientId={clientId}
        userId={userId}
        training={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function RecordItem({
  clientId,
  userId,
  employeeName,
  record,
  trainingSigning,
  readOnly,
  onEdit,
  onDelete,
}: {
  clientId: string;
  userId: string;
  employeeName: string;
  record: EmployeeTrainingRecord;
  // Undefined while the client's trainings load; the record's own slots lock it meanwhile.
  trainingSigning: TrainingSigning | undefined;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { training, admission } = record;
  // A training typed from a paper sheet has its signatures on that sheet.
  const signs = training.source === 'app';
  const signatures = useRecordSignatures(clientId, record.id, userId, signs);
  const locks = trainingLocks(trainingSigning, signatures.data);
  return (
    <li
      data-testid="training-record-item"
      data-phase={training.phase}
      className="grid gap-3 rounded-lg border bg-card px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">{trainingPhaseLabels[training.phase]}</span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatDate(training.heldOn)}
            </span>
            {training.source === 'paper' && (
              <Badge variant="outline" data-testid="training-record-paper">
                De pe fișa de hârtie
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span data-testid="training-record-duration">
              {formatDuration(training.durationMinutes)}
            </span>{' '}
            · {record.occupation}
          </p>
        </div>
        {!readOnly && (
          <div className="grid justify-items-end gap-1">
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                data-testid="training-record-edit"
                disabled={locks.edit !== null}
                aria-describedby={locks.edit ? `training-record-lock-${record.id}` : undefined}
                onClick={onEdit}
              >
                <Pencil aria-hidden="true" />
                Modifică
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="training-record-delete"
                disabled={locks.delete !== null}
                aria-describedby={locks.delete ? `training-record-lock-${record.id}` : undefined}
                onClick={onDelete}
              >
                <Trash2 aria-hidden="true" />
                Șterge
              </Button>
            </div>
            {(locks.edit ?? locks.delete) && (
              <p
                id={`training-record-lock-${record.id}`}
                data-testid="training-record-lock"
                className="max-w-72 text-right text-xs text-muted-foreground"
              >
                <Lock aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
                {locks.edit ?? locks.delete}
              </p>
            )}
          </div>
        )}
      </div>
      <TrainingMaterial text={training.material} />
      <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
        <RecordFact label="A instruit">{formatPerson(training.trainer)}</RecordFact>
        {training.verifier && (
          <RecordFact label="A verificat">{formatPerson(training.verifier)}</RecordFact>
        )}
        {training.supplementaryReason && (
          <RecordFact label="Motivul" wide>
            {supplementaryTrainingReasonLabels[training.supplementaryReason]}
          </RecordFact>
        )}
        {admission && (
          <RecordFact label="Admitere" wide>
            <span data-testid="training-record-admission">
              Admis la lucru de {formatPerson(admission)} la {formatDate(admission.admittedOn)}
            </span>
          </RecordFact>
        )}
        {training.notes && (
          <RecordFact label="Observații" wide>
            {training.notes}
          </RecordFact>
        )}
      </dl>
      {signs && (
        <RecordSignatures
          clientId={clientId}
          recordId={record.id}
          query={signatures}
          readOnly={readOnly}
          people={{
            trainee: { name: employeeName, jobTitle: record.occupation },
            trainer: training.trainer,
            verifier: training.verifier,
            admitter: admission,
          }}
        />
      )}
    </li>
  );
}

function RecordFact({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="inline text-muted-foreground">{label}: </dt>
      <dd className="inline break-words">{children}</dd>
    </div>
  );
}
