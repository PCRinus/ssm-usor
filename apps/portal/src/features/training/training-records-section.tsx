import type { PortalTrainingRecordsResponse } from '@/api/generated/api';
import { PageFailed, PageLoading } from '@/components/page';

import type { PendingSignatures } from './pending-signatures';
import { TrainingRecordsList } from './training-records-list';

type RecordsQuery = {
  data: PortalTrainingRecordsResponse | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => unknown;
};

export function TrainingRecordsSection({
  title,
  records,
  pending,
  className,
}: {
  title: string;
  records: RecordsQuery;
  pending?: PendingSignatures;
  className?: string;
}) {
  return (
    <section aria-label={title} className={className}>
      {records.isPending ? (
        <PageLoading />
      ) : records.isError || !records.data ? (
        <PageFailed onRetry={() => void records.refetch()} />
      ) : (
        <TrainingRecordsList records={records.data.items} pending={pending} />
      )}
    </section>
  );
}
