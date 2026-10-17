import { useQueryClient } from '@tanstack/react-query';
import { Navigate } from '@tanstack/react-router';

import {
  getGetPortalTrainingSheetsQueryKey,
  getPortalTrainingSheet,
  useGetPortalTrainingSheets,
  useListPortalTrainingRecords,
} from '@/api/generated/api';
import { PageFailed, PageHeader, PageLoading } from '@/components/page';
import { useParticipation } from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';

import { TrainingRecordsList } from './training-records-list';
import { TrainingSheets } from './training-sheets';

export function TrainingPage() {
  const participation = useParticipation();
  if (participation.employeeId === null) return <Navigate to="/" replace />;
  return (
    <main data-testid="training-page">
      <PageHeader eyebrow={participation.clientName} title="Instruiri" />
      <OwnTraining participantId={participation.participantId} />
    </main>
  );
}

function OwnTraining({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const records = useListPortalTrainingRecords(participantId, { request: apiRequest });
  const sheets = useGetPortalTrainingSheets(participantId, { request: apiRequest });

  return (
    <div className="grid gap-8">
      <TrainingSheets
        sheets={sheets.data}
        failed={sheets.isError}
        loadSheet={(domain) => getPortalTrainingSheet(participantId, domain, apiRequest)}
        onStale={() =>
          void queryClient.invalidateQueries({
            queryKey: getGetPortalTrainingSheetsQueryKey(participantId),
          })
        }
      />
      <section aria-labelledby="training-records-title" className="grid gap-3">
        <h2 id="training-records-title" className="text-lg font-semibold">
          Instruirile tale
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
