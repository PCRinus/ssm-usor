import { Link } from '@tanstack/react-router';
import { ChevronRight, ClipboardCheck, IdCard, UsersRound } from 'lucide-react';

import {
  type PortalClientEmployeesResponse,
  useGetPortalEmployeeData,
  useListPortalClientEmployees,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { PageFailed, PageHeader, PageLoading } from '@/components/page';
import {
  isAdministrator,
  type Participation,
  participationKindLabels,
  useParticipation,
} from '@/features/participation/participation-context';
import { ResponsiblePersonsSection } from '@/features/responsible-persons/responsible-persons-section';
import { TrainingSummary } from '@/features/training/training-summary';
import { useApiRequest } from '@/lib/request';

export function HomePage() {
  const participation = useParticipation();
  const administrator = isAdministrator(participation);
  return (
    <main data-testid="portal-home" className="grid gap-8">
      {administrator ? (
        <PageHeader
          eyebrow={participationKindLabels.client_administrator}
          title={participation.clientName}
        >
          {participation.fullName}
        </PageHeader>
      ) : (
        <EmployeeHeader participation={participation} />
      )}
      <ToDo />
      {administrator && <EmployeesCard participantId={participation.participantId} />}
      {participation.employeeId !== null && (
        <OwnTraining participantId={participation.participantId} />
      )}
      {administrator && participation.employeeId !== null && (
        <PlaceLink to="/datele-mele" icon={IdCard} testId="home-my-data">
          Datele mele
        </PlaceLink>
      )}
      {administrator && <ResponsiblePersonsSection participantId={participation.participantId} />}
    </main>
  );
}

function EmployeeHeader({ participation }: { participation: Participation }) {
  const apiRequest = useApiRequest();
  const data = useGetPortalEmployeeData(participation.participantId, { request: apiRequest });
  const position = data.data?.employee.position;
  return (
    <PageHeader eyebrow={participation.clientName} title={participation.fullName}>
      {position && <span data-testid="home-position">{position}</span>}
    </PageHeader>
  );
}

function ToDo() {
  return (
    <section
      aria-labelledby="todo-title"
      data-testid="home-todo"
      className="grid gap-2 rounded-xl border bg-card p-4 shadow-xs"
    >
      <h2 id="todo-title" className="flex items-center gap-2 text-lg font-semibold">
        <ClipboardCheck aria-hidden="true" className="size-5 text-muted-foreground" />
        De făcut
      </h2>
      <p className="text-muted-foreground">Nimic de semnat deocamdată.</p>
    </section>
  );
}

function OwnTraining({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const records = useListPortalTrainingRecords(participantId, { request: apiRequest });
  if (records.isPending) return <PageLoading />;
  if (records.isError) return <PageFailed onRetry={() => void records.refetch()} />;
  return <TrainingSummary records={records.data} />;
}

function EmployeesCard({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const employees = useListPortalClientEmployees(participantId, { request: apiRequest });
  if (employees.isPending) return <PageLoading />;
  if (employees.isError) return <PageFailed onRetry={() => void employees.refetch()} />;

  const items = employees.data.items;
  const overdue = items.filter((item) => hasState(item, 'overdue')).length;
  const due = items.filter((item) => !hasState(item, 'overdue') && hasState(item, 'due')).length;

  return (
    <Link
      to="/angajati"
      data-testid="home-employees"
      className="grid gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <UsersRound aria-hidden="true" className="size-5 text-muted-foreground" />
          Angajați
        </span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <span className="grid grid-cols-3 gap-2 text-center">
        <Count
          value={items.length}
          label={items.length === 1 ? 'angajat' : 'angajați'}
          testId="home-employees-count"
        />
        <Count value={due} label="cu instruirea scadentă" testId="home-employees-due" />
        <Count value={overdue} label="cu instruirea depășită" testId="home-employees-overdue" />
      </span>
    </Link>
  );
}

const hasState = (item: PortalClientEmployeesResponse['items'][number], state: 'due' | 'overdue') =>
  item.training.ssm.state === state || item.training.psi.state === state;

function Count({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <span className="grid gap-0.5 rounded-lg bg-muted px-2 py-3">
      <span data-testid={testId} className="text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function PlaceLink({
  to,
  icon: Icon,
  testId,
  children,
}: {
  to: '/datele-mele';
  icon: typeof IdCard;
  testId: string;
  children: string;
}) {
  return (
    <Link
      to={to}
      data-testid={testId}
      className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 font-medium shadow-xs transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      <span className="flex-1">{children}</span>
      <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
    </Link>
  );
}
