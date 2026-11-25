import {
  capitalized,
  formatEmployeeName,
  supplementaryTrainingReasonLabels,
  type TrainingDomain,
  trainingDomainLabels,
  trainingIntervalLabel,
  type TrainingPhase,
  type TrainingStatus,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ClipboardCheck, Plus, SearchX, Signature } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import type { z } from 'zod';

import {
  type EmployeeTrainingRecordListResponse,
  getListEmployeeTrainingRecordsQueryKey,
  useListEmployeeTrainingRecords,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import { createDataTableColumns, type DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch, periodSearch, periodValue } from '@/components/list-filters/url';
import { useAuth } from '@/features/auth/auth-context';
import { SummaryNote, summaryQuiet } from '@/features/clients/details/summary-list';
import { DutiesAcknowledgementCard } from '@/features/duties-acknowledgements/duties-acknowledgement-card';
import { EmployeePending } from '@/features/employees/employee-pending';
import { useEmployee } from '@/features/employees/use-employee';
import { WorkersListError } from '@/features/employees/workers-list';
import { EmployeeTestsCard } from '@/features/knowledge-tests/employee-tests-card';
import { RecordSignatures } from '@/features/signatures/record-signatures';
import { trainingLocks, useRecordSignatures } from '@/features/signatures/use-record-signatures';
import { TrainingSheetDownload } from '@/features/training-sheets/training-sheet-download';
import { TrainingSheetReadiness } from '@/features/training-sheets/training-sheet-readiness';
import { formatDate } from '@/lib/dates';
import { isEmptyOrLoading } from '@/lib/list-state';

import { DeleteTrainingDialog, type TrainingToDelete } from './delete-training-dialog';
import { PersonWithTitle, TrainingDuration } from './not-on-sheet';
import { PhaseCell, SignatureState, TrainerCell, TrainingActions } from './training-cells';
import { trainingLabel } from './training-columns';
import { TrainingDialog, type TrainingDialogTarget } from './training-dialog';
import {
  ownTrainingFacets,
  type OwnTrainingFilterKey,
  ownTrainingFilterKeys,
  type ownTrainingsSearchSchema,
  trainingNoun,
} from './training-filters';
import {
  attendeeCountLabel,
  ownSignatureLabels,
  paperSignedLine,
  transcribedLabel,
} from './training-format';
import { TrainingMaterial } from './training-material';
import { TrainingStateBadge } from './training-state-badge';

type EmployeeTrainingRecord = EmployeeTrainingRecordListResponse['items'][number];

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

// A new hire's trainings come in the law's order; afterwards the periodic one is the usual.
function nextPhase(records: EmployeeTrainingRecord[]): TrainingPhase {
  const held = new Set(records.map((record) => record.training.phase));
  if (!held.has('introductory_general')) return 'introductory_general';
  if (!held.has('workplace')) return 'workplace';
  return 'periodic';
}

function StatusFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-1">
      <dt className={summaryQuiet}>{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

const sourceLinkClass = 'underline underline-offset-4 hover:text-foreground';
const todoValue = 'font-medium text-warning-foreground';

const programmeFocus = {
  ssm: 'training-schedule',
  su: 'fire-training-schedule',
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
  const programme = { to: '/clienti/$clientId/instruire', params: { clientId } } as const;
  const search = { focus: programmeFocus[domain] };
  if (status.intervalMonths === null) {
    return (
      <span data-testid="training-interval" className="block">
        <span className={readOnly ? undefined : todoValue}>Nestabilit</span>
        {!readOnly && (
          <SummaryNote className="font-normal">
            <Link
              {...programme}
              search={search}
              data-testid="training-interval-set"
              title={domain === 'ssm' ? 'Postul își poate avea și propriul interval' : undefined}
              className={sourceLinkClass}
            >
              Stabilește intervalul
            </Link>
          </SummaryNote>
        )}
      </span>
    );
  }
  return (
    <span data-testid="training-interval" className="block">
      <span>{capitalized(trainingIntervalLabel(status.intervalMonths))}</span>
      <SummaryNote className="font-normal">
        {status.intervalSource === 'position' ? (
          <Link
            to="/clienti/$clientId/posturi/$jobPositionId"
            state={openedHere}
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
              : 'din datele de instruire SU ale clientului'}
          </Link>
        )}
      </SummaryNote>
    </span>
  );
}

type OwnSearch = z.infer<typeof ownTrainingsSearchSchema>;
type OwnSortKey = NonNullable<OwnSearch['sort']>;

const defaultSort: DataTableSort & { sort: OwnSortKey } = { sort: 'heldOn', order: 'desc' };

const rowKey = (row: EmployeeTrainingRecord) => row.id;

// One person's records are few, all read at once: they filter and sort here, the address keeping
// the choice as on every list.
function shownRecords(items: EmployeeTrainingRecord[], search: OwnSearch) {
  const { from, to, phase, mode, signature } = search;
  const kept = items.filter(
    ({ training, signature: own }) =>
      (!from || training.heldOn >= from) &&
      (!to || training.heldOn <= to) &&
      (!phase || phase.includes(training.phase)) &&
      (!mode || mode.includes(training.source)) &&
      (!signature || signature.includes(own))
  );
  const sort = search.sort ?? defaultSort.sort;
  const direction = (search.order ?? defaultSort.order) === 'asc' ? 1 : -1;
  const byDay = (a: EmployeeTrainingRecord, b: EmployeeTrainingRecord) =>
    a.training.heldOn.localeCompare(b.training.heldOn) ||
    a.training.createdAt.localeCompare(b.training.createdAt);
  return kept.sort((a, b) => {
    if (sort === 'duration') {
      const [x, y] = [a.training.durationMinutes, b.training.durationMinutes];
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
      } else if (x !== y) return (x - y) * direction;
    }
    return byDay(a, b) * direction;
  });
}

export function EmployeeTrainingTab({
  domain,
  search,
  onSearch,
}: {
  domain: TrainingDomain;
  search: OwnSearch;
  onSearch: (next: Partial<OwnSearch>) => void;
}) {
  const { clientId, employeeId } = employeeRoute.useParams();
  const readOnly = clientRoute.useLoaderData().client.archivedAt !== null;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { request, ready, key } = useApi();
  const employee = useEmployee(clientId, employeeId).data?.employee;
  const params = { domain };
  const records = useListEmployeeTrainingRecords(clientId, employeeId, params, {
    request,
    query: {
      queryKey: key(getListEmployeeTrainingRecordsQueryKey(clientId, employeeId, params)),
      enabled: ready,
    },
  });
  const [target, setTarget] = useState<TrainingDialogTarget | null>(null);
  const [deleting, setDeleting] = useState<TrainingToDelete | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());
  const recordsHeadingId = useId();
  const listFilters = listFilterSearch({
    keys: ownTrainingFilterKeys,
    facets: ownTrainingFacets,
    search: { ...search, period: periodValue(search.from, search.to) },
  });
  const toSearch = (values: ListFilterValues<OwnTrainingFilterKey>) => {
    const { period, ...rest } = listFilters.searchOf(values);
    return { ...rest, ...periodSearch(period) } as Partial<OwnSearch>;
  };
  const filtered = listFilters.applied;
  const items = records.data?.items;
  const shown = items && shownRecords(items, { ...search, ...toSearch(listFilters.values) });
  const columns = useMemo(
    () =>
      ownTrainingColumns({
        clientId,
        onEdit: readOnly
          ? undefined
          : (record) => setTarget({ kind: 'edit', trainingId: record.training.id }),
        onDelete: (record) =>
          setDeleting({
            id: record.training.id,
            phase: record.training.phase,
            heldOn: record.training.heldOn,
            attendeeCount: record.attendeeCount,
          }),
      }),
    [clientId, readOnly]
  );
  if (!employee) return <EmployeePending />;
  const status = employee.training[domain];
  const label = trainingDomainLabels[domain];
  const all = items ?? [];
  const record = () => setTarget({ kind: 'new', domain, phase: nextPhase(all) });
  const recordButton = !readOnly && (
    <Button
      data-testid="training-record"
      className="sm:order-last"
      disabled={!records.data}
      onClick={record}
    >
      <Plus aria-hidden="true" />
      Înregistrează o instruire
    </Button>
  );
  const toggle = (row: EmployeeTrainingRecord) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(row.id)) next.add(row.id);
      return next;
    });
  const changeFilters = (values: ListFilterValues<OwnTrainingFilterKey>) =>
    onSearch(toSearch(values));
  const total = shown?.length ?? 0;

  return (
    <div data-testid="employee-training-tab" data-domain={domain} className="grid gap-4">
      <div
        data-testid="training-tab-actions"
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end"
      >
        {!isEmptyOrLoading(records.status, all.length) && recordButton}
        <TrainingSheetDownload clientId={clientId} employeeId={employeeId} domain={domain} />
      </div>
      <TrainingSheetReadiness clientId={clientId} employeeId={employeeId} domain={domain} />

      <dl
        data-testid="training-status"
        data-sheet-panel
        aria-label="Starea instruirii"
        className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-6 text-sm lg:grid-cols-4"
      >
        <StatusFact label="Starea instruirii">
          {status.state ? (
            <TrainingStateBadge state={status.state} testId="training-state" />
          ) : (
            <span className="font-normal" data-testid="training-state">
              Fără termen: nu mai lucrează la client
            </span>
          )}
        </StatusFact>
        <StatusFact label="Următoarea instruire">
          <span data-testid="training-due-on">
            {status.dueOn ? (
              <span className="tabular-nums">{formatDate(status.dueOn)}</span>
            ) : status.state === 'untrained' ? (
              <span className="font-normal">După instruirea la angajare</span>
            ) : status.state ? (
              <span className="font-normal">Intervalul de instruire nu este stabilit</span>
            ) : (
              <span className="font-normal text-muted-foreground">—</span>
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
          <span data-testid="training-last-periodic" className="tabular-nums">
            {status.lastPeriodicOn ? (
              formatDate(status.lastPeriodicOn)
            ) : (
              <span className="font-normal text-muted-foreground">—</span>
            )}
          </span>
        </StatusFact>
      </dl>

      {domain === 'ssm' && <DutiesAcknowledgementCard employee={employee} readOnly={readOnly} />}

      <EmployeeTestsCard
        clientId={clientId}
        employeeId={employeeId}
        domain={domain}
        readOnly={readOnly}
      />

      <section
        data-testid="training-records"
        data-sheet-panel
        aria-labelledby={recordsHeadingId}
        className="overflow-hidden rounded-xl border bg-card pt-5"
      >
        <div className="flex min-h-8 items-center px-6 pb-3 text-xl leading-7">
          <h2 id={recordsHeadingId} className="inline font-semibold tracking-[-0.01em]">
            Instruiri
          </h2>
          <HelpLink topic="angajati.instruire" label="Ajutor: Instruiri" className="ml-1" />
        </div>
        {records.isSuccess && all.length === 0 ? (
          <ListEmpty className="pt-2">
            <EmptyState
              icon={ClipboardCheck}
              data-testid="training-records-empty"
              actions={recordButton}
            >
              Nicio instruire înregistrată încă. Fiecare instruire {label} a lucrătorului apare aici
              și în fișa lui individuală.
            </EmptyState>
          </ListEmpty>
        ) : (
          <>
            {records.isSuccess && (
              <>
                <ListCardHeader className="px-6 pt-0">
                  <ListFilters
                    facets={ownTrainingFacets}
                    values={listFilters.values}
                    onChange={changeFilters}
                    total={total}
                    applyLabel={(pending) =>
                      `Arată ${trainingNoun(shownRecords(all, { ...search, ...toSearch(pending) }).length)}`
                    }
                    countLabel={trainingNoun}
                    testId="training-records-filters"
                    align="start"
                  />
                  <ListCount testId="training-records-count">
                    {filtered ? (
                      <>
                        <b className="font-semibold text-foreground">{total}</b> din{' '}
                        {trainingNoun(all.length)}
                      </>
                    ) : (
                      trainingNoun(all.length)
                    )}
                  </ListCount>
                </ListCardHeader>
                <AppliedFilters
                  facets={ownTrainingFacets}
                  values={listFilters.values}
                  onChange={changeFilters}
                  testId="training-records-applied-filters"
                />
              </>
            )}
            <DataTable
              testId="training-records-table"
              rowTestId="training-record-item"
              label={`Instruirile ${label}`}
              columns={columns}
              data={shown}
              rowKey={rowKey}
              onRowClick={toggle}
              expansion={{
                isOpen: (row) => opened.has(row.id),
                onToggle: toggle,
                label: (row) => `Detaliile instruirii ${trainingLabel(row.training)}`,
                testId: 'training-record-open',
                render: (row) => (
                  <RecordDetails
                    clientId={clientId}
                    employeeName={formatEmployeeName(employee)}
                    record={row}
                    readOnly={readOnly}
                  />
                ),
              }}
              meta={{ page: 1, pageSize: Math.max(total, 1), total }}
              noun={['instruire', 'instruiri']}
              status={records.status}
              isFetching={records.isFetching}
              sort={{
                sort: search.sort ?? defaultSort.sort,
                order: search.order ?? defaultSort.order,
              }}
              onSortChange={(next) =>
                onSearch({
                  sort: next.sort === defaultSort.sort ? undefined : (next.sort as OwnSortKey),
                  order: next.order === defaultSort.order ? undefined : next.order,
                })
              }
              onPageChange={() => undefined}
              error={
                <WorkersListError
                  error={records.error}
                  testId="training-records"
                  onRetry={() => void records.refetch()}
                  retrying={records.isFetching}
                  message="Nu am putut încărca instruirile. Încearcă din nou."
                />
              }
              empty={
                <EmptyState
                  icon={SearchX}
                  title="Nicio instruire nu se potrivește"
                  data-testid="training-records-empty-filtered"
                  actions={
                    <Button
                      variant="secondary"
                      data-testid="training-records-empty-filtered-clear"
                      onClick={() => changeFilters({})}
                    >
                      Șterge filtrele
                    </Button>
                  }
                >
                  Nicio instruire {label} a lucrătorului nu se potrivește filtrelor alese. Scoate
                  unul dintre filtrele de mai sus sau pornește din nou de la toate instruirile.
                </EmptyState>
              }
            />
          </>
        )}
      </section>

      <TrainingDialog
        clientId={clientId}
        userId={userId}
        target={target}
        fixedAttendee={employee}
        onClose={() => setTarget(null)}
      />
      <DeleteTrainingDialog
        clientId={clientId}
        training={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function ownTrainingColumns({
  clientId,
  onEdit,
  onDelete,
}: {
  clientId: string;
  onEdit?: (record: EmployeeTrainingRecord) => void;
  onDelete: (record: EmployeeTrainingRecord) => void;
}) {
  const helper = createDataTableColumns<EmployeeTrainingRecord>();
  return helper.columns([
    helper.accessor((row) => row.training.heldOn, {
      id: 'heldOn',
      header: 'Ziua',
      enableSorting: true,
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    helper.display({
      id: 'phase',
      header: 'Instruirea',
      meta: { headerClassName: 'min-w-59', skeletonClassName: 'w-32' },
      cell: ({ row }) => {
        const { training, attendeeCount } = row.original;
        const group = attendeeCount > 1 && (
          <Link
            to="/clienti/$clientId/instruiri-tinute"
            params={{ clientId }}
            search={{ domain: training.domain, open: training.id }}
            state={openedHere}
            data-testid="training-record-session"
            className="font-medium text-foreground underline underline-offset-4 decoration-muted-foreground/50 hover:decoration-foreground"
          >
            Instruire de grup · {attendeeCountLabel(attendeeCount)}
          </Link>
        );
        return (
          <PhaseCell
            phase={training.phase}
            note={
              training.source === 'paper' ? (
                <span data-testid="training-record-paper">{transcribedLabel}</span>
              ) : (
                group || trainingDomainLabels[training.domain]
              )
            }
          />
        );
      },
    }),
    helper.accessor((row) => row.training.durationMinutes, {
      id: 'duration',
      header: 'Durata',
      enableSorting: true,
      meta: {
        headerClassName: 'min-w-38',
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-24',
      },
      cell: ({ getValue }) => (
        <span data-testid="training-record-duration">
          <TrainingDuration minutes={getValue()} />
        </span>
      ),
    }),
    helper.display({
      id: 'trainer',
      header: 'A instruit',
      meta: {
        headerClassName: 'w-full',
        cellClassName: 'min-w-48 whitespace-normal',
        skeletonClassName: 'w-40',
      },
      cell: ({ row }) => <TrainerCell trainer={row.original.training.trainer} />,
    }),
    helper.display({
      id: 'signature',
      header: 'Semnătura',
      meta: { skeletonClassName: 'w-24' },
      cell: ({ row }) => (
        <SignatureState
          state={row.original.signature}
          label={ownSignatureLabels[row.original.signature]}
          testId="training-record-signature"
        />
      ),
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-12', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) =>
        onEdit ? (
          <OwnTrainingActions
            clientId={clientId}
            record={row.original}
            onEdit={() => onEdit(row.original)}
            onDelete={() => onDelete(row.original)}
          />
        ) : null,
    }),
  ]);
}

// The record's own slots lock it too, before the list's flags catch up with a signature.
function OwnTrainingActions({
  clientId,
  record,
  onEdit,
  onDelete,
}: {
  clientId: string;
  record: EmployeeTrainingRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const signatures = useRecordSignatures(clientId, record.id, record.training.source === 'app');
  return (
    <TrainingActions
      locks={trainingLocks(record, signatures.data)}
      label={trainingLabel(record.training)}
      testId="training-record"
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function RecordDetails({
  clientId,
  employeeName,
  record,
  readOnly,
}: {
  clientId: string;
  employeeName: string;
  record: EmployeeTrainingRecord;
  readOnly: boolean;
}) {
  const { training, admission } = record;
  // A training typed from a paper sheet has its signatures on that sheet.
  const signs = training.source === 'app';
  const signatures = useRecordSignatures(clientId, record.id, signs);
  return (
    <div data-testid="training-record-details" className="grid max-w-3xl gap-3 text-sm">
      <TrainingMaterial text={training.material} named />
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <RecordFact label="Ocupația">{record.occupation}</RecordFact>
        {training.verifier && (
          <RecordFact label="A verificat">
            <PersonWithTitle person={training.verifier} />
          </RecordFact>
        )}
        {training.supplementaryReason && (
          <RecordFact label="Motivul" wide>
            {supplementaryTrainingReasonLabels[training.supplementaryReason]}
          </RecordFact>
        )}
        {admission && (
          <RecordFact label="Admitere" wide>
            <span data-testid="training-record-admission">
              Admis la lucru de <PersonWithTitle person={admission} /> la{' '}
              {formatDate(admission.admittedOn)}
            </span>
          </RecordFact>
        )}
        {training.notes && (
          <RecordFact label="Observații" wide>
            {training.notes}
          </RecordFact>
        )}
      </dl>
      {training.source === 'paper' && (
        <p
          data-testid="training-record-paper-signed"
          className="flex items-center gap-2 border-t pt-3 text-muted-foreground"
        >
          <Signature aria-hidden="true" className="size-4 shrink-0" />
          {paperSignedLine({ verifier: training.verifier, admission })}
        </p>
      )}
      {signs && (
        <RecordSignatures
          clientId={clientId}
          recordId={record.id}
          query={signatures}
          readOnly={readOnly}
          people={{
            trainee: { name: employeeName, jobTitle: record.occupation },
            trainer: {
              name: training.trainer.name ?? '',
              jobTitle: training.trainer.jobTitle ?? '',
            },
            verifier: training.verifier,
            admitter: admission,
          }}
        />
      )}
    </div>
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
