import { Trans, useLingui } from '@lingui/react/macro';
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
import { Page, PageGrid, PageHeader } from '@/components/page';
import { isAdministrator, useParticipation } from '@/features/participation/participation-context';
import { TrainingRecordsSection } from '@/features/training/training-records-section';
import { TrainingSheets } from '@/features/training/training-sheets';
import { useApiRequest } from '@/lib/request';

import { EmployeeTrainingStates } from './employee-training-states';

export function EmployeePage({ employeeId }: { employeeId: string }) {
  const participation = useParticipation();
  if (!isAdministrator(participation)) return <Navigate to="/" replace />;
  return (
    <Page testId="employee-page">
      <Link
        to="/angajati"
        className="-mb-3 -ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm px-1 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:-mb-5"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        <Trans>Angajați</Trans>
      </Link>
      <EmployeeDetail participantId={participation.participantId} employeeId={employeeId} />
    </Page>
  );
}

function EmployeeDetail({
  participantId,
  employeeId,
}: {
  participantId: string;
  employeeId: string;
}) {
  const { t } = useLingui();
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
      <PageHeader
        title={t`Angajatul nu a fost găsit`}
        description={t`Poate a fost scos din evidența companiei.`}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={employee ? `${employee.lastName} ${employee.firstName}` : t`Angajat`}
        description={employee && [employee.position, employee.workplace].filter(Boolean).join(', ')}
      >
        {employee && (
          <div className="pt-3">
            <EmployeeTrainingStates employee={employee} />
          </div>
        )}
      </PageHeader>
      <PageGrid>
        <TrainingSheets
          title={t`Fișele individuale`}
          className="lg:sticky lg:top-22 lg:col-span-4 lg:col-start-9 lg:row-start-1"
          sheets={sheets.data}
          records={records.isError ? null : records.data?.items}
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
        <TrainingRecordsSection
          className="lg:col-span-8 lg:row-start-1"
          title={t`Instruiri`}
          records={records}
        />
      </PageGrid>
    </>
  );
}
