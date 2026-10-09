import {
  type BuiltInDocumentTypeKey,
  documentSetOf,
  type MissingDocumentData,
} from '@ssm-usor/contracts';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useRouteContext } from '@tanstack/react-router';

import { getGetDocumentReadinessQueryKey, useGetDocumentReadiness } from '@/api/generated/api';
import { useMe } from '@/features/account/use-me';
import { MissingDataList } from '@/features/missing-data/missing-data-list';
import { documentMissingGroups } from '@/features/missing-data/missing-rows';
import { startWayBack } from '@/features/missing-data/way-back';

import { setParams } from './document-sets';

export function DocumentMissingRows({
  clientId,
  userId,
  typeKey,
  missing,
  testId,
}: {
  clientId: string;
  userId: string;
  typeKey: BuiltInDocumentTypeKey;
  missing: readonly MissingDocumentData[];
  testId: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = setParams(documentSetOf(typeKey));
  // A refusal names only codes; the readiness names the positions and evaluations behind them,
  // so the rows are those of the generation form. Without it the codes still lead somewhere.
  const readiness = useGetDocumentReadiness(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getGetDocumentReadinessQueryKey(clientId, params), userId],
      staleTime: 0,
    },
  });
  const isOwner = useMe().data?.membership?.role === 'owner';

  if (readiness.isPending) return <Skeleton className="h-16 w-full" />;
  const groups = documentMissingGroups({
    missing,
    clientId,
    clash: readiness.data?.workersRepresentativeClash ?? null,
    undecidedJobPositions: readiness.data?.undecidedJobPositions ?? [],
    incompleteRiskEvaluations: readiness.data?.incompleteRiskEvaluations ?? [],
    currentEmployeeCount: readiness.data?.currentEmployeeCount,
    canEditOrganization: isOwner,
  });
  return (
    <MissingDataList
      groups={groups}
      testId={testId}
      onFollow={() => startWayBack({ userId, clientId, to: 'document', typeKey })}
    />
  );
}
