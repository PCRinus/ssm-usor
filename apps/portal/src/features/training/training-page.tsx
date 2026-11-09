import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';

import {
  getGetPortalTrainingSheetsQueryKey,
  getPortalTrainingSheet,
  getPortalTrainingSheetLink,
  useGetPortalTrainingSheets,
  useListPortalSignatureRequests,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { Page, PageGrid, PageHeader } from '@/components/page';
import { useParticipation } from '@/features/participation/participation-context';
import { TestsSection } from '@/features/tests/tests-section';
import { useApiRequest } from '@/lib/request';

import { pendingByRecord } from './pending-signatures';
import { TrainingRecordsSection } from './training-records-section';
import { TrainingSheets } from './training-sheets';

export function TrainingPage() {
  const { t } = useLingui();
  const participation = useParticipation();
  if (participation.employeeId === null) return <Navigate to="/" replace />;
  return (
    <Page testId="training-page">
      <PageHeader
        title={t`Instruirile tale`}
        description={t`Fiecare instruire la care ai participat, cea mai recentă prima. Fișele adună aceste rânduri.`}
      />
      <OwnTraining participantId={participation.participantId} />
    </Page>
  );
}

function OwnTraining({ participantId }: { participantId: string }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const records = useListPortalTrainingRecords(participantId, { request: apiRequest });
  const sheets = useGetPortalTrainingSheets(participantId, { request: apiRequest });
  const requests = useListPortalSignatureRequests(participantId, { request: apiRequest });

  return (
    <PageGrid>
      <div className="grid gap-6 lg:sticky lg:top-22 lg:col-span-4 lg:col-start-9 lg:row-start-1">
        <TrainingSheets
          title={t`Fișele tale`}
          sheets={sheets.data}
          records={records.isError ? null : records.data?.items}
          failed={sheets.isError}
          loadSheet={(domain, sequence) =>
            getPortalTrainingSheet(
              participantId,
              domain,
              sequence ? { sequence } : undefined,
              apiRequest
            )
          }
          links={{
            loadLink: (domain, sequence, signal) =>
              getPortalTrainingSheetLink(
                participantId,
                domain,
                { sequence },
                { ...apiRequest, signal }
              ),
            linkScope: [participantId],
          }}
          onStale={() =>
            void queryClient.invalidateQueries({
              queryKey: getGetPortalTrainingSheetsQueryKey(participantId),
            })
          }
        />
        <TestsSection participantId={participantId} />
      </div>
      <TrainingRecordsSection
        className="lg:col-span-8 lg:row-start-1"
        title={t`Instruirile tale`}
        records={records}
        pending={requests.data && pendingByRecord(requests.data.items, true)}
      />
    </PageGrid>
  );
}
