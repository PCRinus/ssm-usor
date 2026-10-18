import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import {
  getGetPortalTrainingSheetsQueryKey,
  getPortalTrainingSheet,
  type PortalClientEmployeesResponse,
  type PortalEmployeeDataResponse,
  useGetPortalEmployeeData,
  useGetPortalTrainingSheets,
  useListPortalClientEmployees,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { Fact, Facts } from '@/components/facts';
import { cardClass, Page, PageFailed, PageGrid, PageHeader, PageLoading } from '@/components/page';
import { ProviderBox } from '@/features/my-data/provider-box';
import {
  isAdministrator,
  type Participation,
  useParticipation,
} from '@/features/participation/participation-context';
import { ResponsiblePersonsSection } from '@/features/responsible-persons/responsible-persons-section';
import { SignaturesPanel } from '@/features/signing/signatures-panel';
import { TrainingSummary } from '@/features/training/training-summary';
import { useFormatDate } from '@/lib/format';
import { participationKindMessages } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

export function HomePage() {
  const participation = useParticipation();
  return isAdministrator(participation) ? (
    <AdministratorHome participation={participation} />
  ) : (
    <EmployeeHome participation={participation} />
  );
}

function EmployeeHome({ participation }: { participation: Participation }) {
  const apiRequest = useApiRequest();
  const data = useGetPortalEmployeeData(participation.participantId, { request: apiRequest });
  const employee = data.data?.employee;

  return (
    <Page testId="portal-home">
      <PageHeader eyebrow={participation.clientName} title={participation.fullName}>
        {employee && (
          <p className="text-[0.9375rem] text-foreground/80 sm:text-base">
            <PositionLine position={employee.position} employeeNumber={employee.employeeNumber} />
          </p>
        )}
      </PageHeader>
      <PageGrid>
        <div className="grid gap-6 sm:gap-7 lg:col-span-7">
          <SignaturesPanel participation={participation} />
          <OwnTraining participantId={participation.participantId} />
        </div>
        {data.data && (
          <aside className="grid items-start gap-4 max-sm:hidden md:grid-cols-2 lg:col-span-5 lg:grid-cols-1">
            <MyDataSummary data={data.data} />
            <ProviderBox provider={data.data.provider} />
          </aside>
        )}
      </PageGrid>
    </Page>
  );
}

function PositionLine({
  position,
  employeeNumber,
}: {
  position: string;
  employeeNumber: string | null;
}) {
  return employeeNumber ? (
    <Trans>
      <span data-testid="home-position">{position}</span>, marca {employeeNumber}
    </Trans>
  ) : (
    <span data-testid="home-position">{position}</span>
  );
}

function AdministratorHome({ participation }: { participation: Participation }) {
  const { i18n } = useLingui();
  const employee = participation.employeeId !== null;
  return (
    <Page testId="portal-home">
      <PageHeader
        eyebrow={i18n._(participationKindMessages.client_administrator)}
        title={participation.clientName}
        description={participation.fullName}
      />
      <PageGrid>
        <div className="grid gap-6 sm:gap-7 lg:col-span-7">
          <SignaturesPanel participation={participation} />
          <EmployeesCard participantId={participation.participantId} />
          {employee && <OwnTraining participantId={participation.participantId} />}
        </div>
        <aside className="grid gap-6 lg:col-span-5">
          {employee && <AdministratorOwnData participantId={participation.participantId} />}
          <ResponsiblePersonsSection participantId={participation.participantId} />
        </aside>
      </PageGrid>
    </Page>
  );
}

function AdministratorOwnData({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const data = useGetPortalEmployeeData(participantId, { request: apiRequest });
  return data.data ? (
    <MyDataSummary data={data.data} />
  ) : (
    <Link to="/datele-mele" data-testid="home-my-data" className={`${cardClass} p-4 font-medium`}>
      <Trans>Datele mele</Trans>
    </Link>
  );
}

function OwnTraining({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const records = useListPortalTrainingRecords(participantId, { request: apiRequest });
  const sheets = useGetPortalTrainingSheets(participantId, { request: apiRequest });
  if (records.isPending) return <PageLoading />;
  if (records.isError) return <PageFailed onRetry={() => void records.refetch()} />;
  return (
    <TrainingSummary
      records={records.data}
      sheetAccess={{
        sheets: sheets.data,
        loadSheet: (domain) => getPortalTrainingSheet(participantId, domain, undefined, apiRequest),
        onStale: () =>
          void queryClient.invalidateQueries({
            queryKey: getGetPortalTrainingSheetsQueryKey(participantId),
          }),
      }}
    />
  );
}

function MyDataSummary({ data }: { data: PortalEmployeeDataResponse }) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const { employee } = data;
  return (
    <section
      aria-labelledby="home-my-data-title"
      className={`${cardClass} grid gap-3 px-4 py-4 sm:px-5`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-my-data-title" className="text-base font-semibold">
          <Trans>Datele mele</Trans>
        </h2>
        <Link
          to="/datele-mele"
          data-testid="home-my-data"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          <Trans>Vezi tot</Trans>
        </Link>
      </div>
      <Facts layout="rows">
        <Fact label={t`Post de lucru`}>{employee.position}</Fact>
        <Fact label={t`Punct de lucru`}>{employee.workplace}</Fact>
        <Fact label={t`Angajat din`}>{formatDate(employee.hiredAt)}</Fact>
        <Fact label={t`Traseu de deplasare`}>{employee.commuteRoute}</Fact>
      </Facts>
    </section>
  );
}

function EmployeesCard({ participantId }: { participantId: string }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const employees = useListPortalClientEmployees(participantId, { request: apiRequest });
  if (employees.isPending) return <PageLoading />;
  if (employees.isError) return <PageFailed onRetry={() => void employees.refetch()} />;

  const items = employees.data.items;
  const count = items.length;
  const overdue = items.filter((item) => hasState(item, 'overdue')).length;
  const due = items.filter((item) => !hasState(item, 'overdue') && hasState(item, 'due')).length;

  return (
    <Link
      to="/angajati"
      data-testid="home-employees"
      className={`${cardClass} grid gap-3.5 px-4 py-4 transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:px-5`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold sm:text-[1.0625rem]">
          <Trans>Angajați</Trans>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <span className="grid grid-cols-3 gap-2">
        <Count
          value={count}
          label={t({
            message: plural(count, { one: 'angajat', few: 'angajați', other: 'de angajați' }),
          })}
          testId="home-employees-count"
        />
        <Count value={due} label={t`cu instruirea scadentă`} testId="home-employees-due" />
        <Count value={overdue} label={t`cu instruirea depășită`} testId="home-employees-overdue" />
      </span>
    </Link>
  );
}

const hasState = (item: PortalClientEmployeesResponse['items'][number], state: 'due' | 'overdue') =>
  item.training.ssm.state === state || item.training.psi.state === state;

function Count({ value, label, testId }: { value: number; label: string; testId: string }) {
  return (
    <span className="grid content-start gap-0.5 rounded-lg bg-muted px-3 py-3">
      <span data-testid={testId} className="text-2xl font-semibold tabular-nums">
        {value}
      </span>
      <span className="text-xs leading-snug text-muted-foreground">{label}</span>
    </span>
  );
}
