import {
  formatEmployeeName,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
  type TrainingPhase,
  trainingPhaseLabels,
  trainingPhases,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link, useRouteContext } from '@tanstack/react-router';
import { ClipboardCheck, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';

import {
  getListTrainingsQueryKey,
  type TrainingListResponseItemsItem,
  useListTrainings,
} from '@/api/generated/api';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { formatDate } from '@/features/employees/employee-format';
import { ClientSignatureRequests } from '@/features/signatures/client-signature-requests';
import { trainingLocks } from '@/features/signatures/use-record-signatures';

import { DeleteTrainingDialog, type TrainingToDelete } from './delete-training-dialog';
import { TrainingDialog, type TrainingDialogTarget } from './training-dialog';
import { attendeeCountLabel, formatDuration, formatPerson } from './training-format';
import { TrainingMaterial } from './training-material';

const route = getRouteApi('/_authenticated/clients/$clientId/trainings');
const clientRoute = getRouteApi('/_authenticated/clients/$clientId');

const employeeTrainingTabs = {
  ssm: '/clients/$clientId/employees/$employeeId/training/ssm',
  psi: '/clients/$clientId/employees/$employeeId/training/psi',
} as const satisfies Record<TrainingDomain, string>;

const domainFilters: { domain: TrainingDomain | undefined; label: string }[] = [
  { domain: undefined, label: 'Toate' },
  ...trainingDomains.map((domain) => ({ domain, label: trainingDomainLabels[domain] })),
];

function emptyMessage(domain: TrainingDomain | undefined, phase: TrainingPhase | undefined) {
  if (!domain && !phase) {
    return 'Nicio instruire înregistrată încă. O instruire se înregistrează o dată, cu toți participanții, și apare în fișa fiecăruia.';
  }
  const what = [
    phase ? `de tipul „${trainingPhaseLabels[phase]}”` : null,
    domain ? `în domeniul ${trainingDomainLabels[domain]}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return `Nicio instruire ${what} înregistrată încă.`;
}

export function ClientTrainingsPage() {
  const { domain, phase } = route.useSearch();
  const navigate = route.useNavigate();
  const { client } = clientRoute.useLoaderData();
  const clientId = client.id;
  const readOnly = client.archivedAt !== null;
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { ...(domain ? { domain } : {}), ...(phase ? { phase } : {}) };
  const trainings = useListTrainings(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListTrainingsQueryKey(clientId, params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
      placeholderData: keepPreviousData,
    },
  });
  const [target, setTarget] = useState<TrainingDialogTarget | null>(null);
  const [deleting, setDeleting] = useState<TrainingToDelete | null>(null);
  const items = trainings.data?.items ?? [];
  const record = () => setTarget({ kind: 'new', domain: domain ?? 'ssm', phase: 'periodic' });

  return (
    <div data-testid="client-trainings-page" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Instruiri ținute</h2>
        {!readOnly && (
          <Button data-testid="trainings-record" onClick={record}>
            <Plus aria-hidden="true" />
            Înregistrează o instruire
          </Button>
        )}
      </div>
      <ClientSignatureRequests clientId={clientId} userId={userId} />
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
          <nav aria-label="Filtrează după domeniu" className="flex gap-1">
            {domainFilters.map((filter) => {
              const active = filter.domain === domain;
              return (
                <Link
                  key={filter.label}
                  to="/clients/$clientId/trainings"
                  params={{ clientId }}
                  search={{ ...(filter.domain ? { domain: filter.domain } : {}), phase }}
                  data-testid="trainings-filter-domain"
                  data-domain={filter.domain ?? 'all'}
                  aria-current={active ? 'page' : undefined}
                  replace
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {filter.label}
                </Link>
              );
            })}
          </nav>
          <NativeSelect
            aria-label="Tipul instruirii"
            data-testid="trainings-filter-phase"
            className="w-full sm:w-60"
            value={phase ?? ''}
            onChange={(event) =>
              void navigate({
                replace: true,
                search: (prev) => ({
                  ...prev,
                  phase: (event.target.value || undefined) as TrainingPhase | undefined,
                }),
              })
            }
          >
            <NativeSelectOption value="">Toate tipurile</NativeSelectOption>
            {trainingPhases.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {trainingPhaseLabels[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {trainings.isSuccess && (
            <span className="ml-auto text-sm text-muted-foreground" data-testid="trainings-count">
              {items.length === 1 ? '1 instruire' : `${items.length} instruiri`}
            </span>
          )}
        </div>
        {trainings.isError ? (
          <div className="p-5">
            <Notice
              variant="destructive"
              data-testid="trainings-error"
              action={
                <Button
                  variant="outline"
                  disabled={trainings.isFetching}
                  onClick={() => void trainings.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca instruirile. Încearcă din nou.
            </Notice>
          </div>
        ) : !trainings.data ? (
          <div className="grid gap-3 p-5" aria-busy="true">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={ClipboardCheck}
              data-testid="trainings-empty"
              actions={
                !readOnly && (
                  <Button variant="outline" onClick={record}>
                    <Plus aria-hidden="true" />
                    Înregistrează o instruire
                  </Button>
                )
              }
            >
              {emptyMessage(domain, phase)}
            </EmptyState>
          </div>
        ) : (
          <Table
            data-testid="trainings-table"
            aria-label="Instruirile ținute"
            className={cn(trainings.isPlaceholderData && 'opacity-60')}
          >
            <TableHeader>
              <TableRow>
                <TableHead className="pl-5">Ziua</TableHead>
                <TableHead>Instruirea</TableHead>
                <TableHead>Durata</TableHead>
                <TableHead>A instruit</TableHead>
                <TableHead>Participanți</TableHead>
                <TableHead className="min-w-64">Material</TableHead>
                <TableHead className="w-12 pr-3">
                  <span className="sr-only">Acțiuni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((training) => (
                <TrainingRow
                  key={training.id}
                  training={training}
                  readOnly={readOnly}
                  onEdit={() => setTarget({ kind: 'edit', trainingId: training.id })}
                  onDelete={() =>
                    setDeleting({
                      id: training.id,
                      phase: training.phase,
                      heldOn: training.heldOn,
                      attendeeCount: training.attendeeCount,
                    })
                  }
                />
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <TrainingDialog
        clientId={clientId}
        userId={userId}
        target={target}
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

function TrainingRow({
  training,
  readOnly,
  onEdit,
  onDelete,
}: {
  training: TrainingListResponseItemsItem;
  readOnly: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = `${trainingPhaseLabels[training.phase]} din ${formatDate(training.heldOn)}`;
  const locks = trainingLocks(training);
  const lock = locks.edit ?? locks.delete;
  return (
    <TableRow data-testid="trainings-row" className="align-top">
      <TableCell className="pl-5 whitespace-nowrap tabular-nums">
        {formatDate(training.heldOn)}
      </TableCell>
      <TableCell>
        <span className="block font-medium">{trainingPhaseLabels[training.phase]}</span>
        <span className="mt-1 flex flex-wrap gap-1">
          <Badge variant="secondary">{trainingDomainLabels[training.domain]}</Badge>
          {training.source === 'paper' && <Badge variant="outline">De pe fișa de hârtie</Badge>}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDuration(training.durationMinutes)}
      </TableCell>
      <TableCell className="max-w-48 whitespace-normal">{formatPerson(training.trainer)}</TableCell>
      <TableCell className="min-w-48 max-w-80 whitespace-normal" data-testid="trainings-attendees">
        <span className="block text-muted-foreground" data-testid="trainings-attendee-count">
          {attendeeCountLabel(training.attendeeCount)}
        </span>
        <span className="mt-1 block">
          {training.attendees.map((attendee, index) => (
            <Fragment key={attendee.employeeId}>
              {index > 0 && ', '}
              <Link
                to={employeeTrainingTabs[training.domain]}
                params={{ clientId: training.clientId, employeeId: attendee.employeeId }}
                data-testid="trainings-attendee"
                className="font-medium hover:underline"
              >
                {formatEmployeeName(attendee)}
              </Link>
            </Fragment>
          ))}
        </span>
      </TableCell>
      <TableCell className="max-w-96 whitespace-normal">
        <TrainingMaterial text={training.material} />
      </TableCell>
      <TableCell className="pr-3 text-right">
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="trainings-row-menu"
                aria-label={`Acțiuni pentru instruirea ${label}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-72">
              {lock && (
                <DropdownMenuLabel
                  data-testid="trainings-lock"
                  className="text-xs font-normal text-muted-foreground"
                >
                  <Lock aria-hidden="true" className="mr-1 inline size-3.5 align-[-2px]" />
                  {lock}
                </DropdownMenuLabel>
              )}
              <DropdownMenuItem
                data-testid="trainings-edit"
                disabled={locks.edit !== null}
                onSelect={onEdit}
              >
                <Pencil aria-hidden="true" />
                Modifică
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="trainings-delete"
                variant="destructive"
                disabled={locks.delete !== null}
                onSelect={onDelete}
              >
                <Trash2 aria-hidden="true" />
                Șterge
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
