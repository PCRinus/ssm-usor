import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';

import {
  getGetPortalEmployeeTrainingSheetsQueryKey,
  getPortalEmployeeTrainingSheet,
  useGetPortalEmployeeTrainingSheets,
  useListPortalClientEmployees,
  useListPortalEmployeeTrainingRecords,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { PageFailed, PageHeader, PageLoading } from '@/components/page';
import { isAdministrator, useParticipation } from '@/features/participation/participation-context';
import { TrainingRecordsList } from '@/features/training/training-records-list';
import { TrainingSheets } from '@/features/training/training-sheets';
import { useApiRequest } from '@/lib/request';

import { EmployeeTrainingStates } from './employee-training-states';

export function EmployeePage({ employeeId }: { employeeId: string }) {
  const participation = useParticipation();
  if (!isAdministrator(participation)) return <Navigate to="/" replace />;
  return (
    <main data-testid="employee-page">
      <Link
        to="/angajati"
        className="-ml-2 inline-flex min-h-11 items-center gap-1 px-2 pt-4 text-sm font-medium"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Angajați
      </Link>
      <EmployeeDetail participantId={participation.participantId} employeeId={employeeId} />
    </main>
  );
}

function EmployeeDetail({
  participantId,
  employeeId,
}: {
  participantId: string;
  employeeId: string;
}) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const employees = useListPortalClientEmployees(participantId, { request: apiRequest });
  const records = useListPortalEmployeeTrainingRecords(participantId, employeeId, {
    request: apiRequest,
  });
  const sheets = useGetPortalEmployeeTrainingSheets(participantId, employeeId, {
    request: apiRequest,
  });
  const employee = employees.data?.items.find((item) => item.id === employeeId);

  if (records.error instanceof ApiHttpError && records.error.status === 404) {
    return (
      <PageHeader title="Angajatul nu a fost găsit">
        Poate a fost scos din evidența companiei.
      </PageHeader>
    );
  }

  return (
    <div className="grid gap-8">
      <PageHeader title={employee ? `${employee.lastName} ${employee.firstName}` : 'Angajat'}>
        {employee && [employee.position, employee.workplace].filter(Boolean).join(' · ')}
      </PageHeader>
      {employee && <EmployeeTrainingStates employee={employee} />}
      <TrainingSheets
        sheets={sheets.data}
        failed={sheets.isError}
        loadSheet={(domain) =>
          getPortalEmployeeTrainingSheet(participantId, employeeId, domain, apiRequest)
        }
        onStale={() =>
          void queryClient.invalidateQueries({
            queryKey: getGetPortalEmployeeTrainingSheetsQueryKey(participantId, employeeId),
          })
        }
      />
      <section aria-labelledby="employee-records-title" className="grid gap-3">
        <h2 id="employee-records-title" className="text-lg font-semibold">
          Instruiri
        </h2>
        {records.isPending ? (
          <PageLoading />
        ) : records.isError ? (
          <PageFailed onRetry={() => void records.refetch()} />
        ) : (
          <TrainingRecordsList records={records.data.items} />
        )}
      </section>
    </div>
  );
}
