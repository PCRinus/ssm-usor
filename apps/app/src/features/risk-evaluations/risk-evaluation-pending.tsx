import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import type { ReactNode } from 'react';

import { RecordHeaderPending } from '@/features/clients/record-header';

import { RiskEvaluationBack } from './risk-evaluation-back';

export function RiskEvaluationPending({ back }: { back?: ReactNode }) {
  return (
    <div className="grid gap-5" aria-busy="true">
      <RecordHeaderPending back={back ?? <RiskEvaluationBack />} />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
