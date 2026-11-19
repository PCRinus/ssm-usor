import {
  type BuiltInDocumentTypeKey,
  documentSetOf,
  type MissingDocumentData,
} from '@ssm-usor/contracts';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';

import { getGetDocumentReadinessQueryKey, useGetDocumentReadiness } from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { useMe } from '@/features/account/use-me';
import { MissingDataList } from '@/features/missing-data/missing-data-list';
import { documentMissingGroups } from '@/features/missing-data/missing-rows';
import { useStartWayBack } from '@/features/missing-data/way-back';
import { SensitiveGroupsNoneButton } from '@/features/risk-evaluations/sensitive-groups-none-button';

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
  const { request, key } = useApi();
  const set = documentSetOf(typeKey);
  const params = setParams(set);
  // A refusal names only codes; the readiness names the positions and evaluations behind them,
  // so the rows are those of the generation form. Without it the codes still lead somewhere.
  const readiness = useGetDocumentReadiness(clientId, params, {
    request,
    query: {
      queryKey: key(getGetDocumentReadinessQueryKey(clientId, params)),
      staleTime: 0,
    },
  });
  const isOwner = useMe().data?.membership?.role === 'owner';
  const startWayBack = useStartWayBack();

  if (readiness.isPending) return <Skeleton className="h-16 w-full" />;
  const groups = documentMissingGroups({
    missing,
    clientId,
    clash: readiness.data?.workersRepresentativeClash ?? null,
    undecidedJobPositions: readiness.data?.undecidedJobPositions ?? [],
    incompleteRiskEvaluations: readiness.data?.incompleteRiskEvaluations ?? [],
    incompleteFireSubstances: readiness.data?.incompleteFireSubstances ?? [],
    currentEmployeeCount: readiness.data?.currentEmployeeCount,
    canEditOrganization: isOwner,
    set,
  });
  return (
    <MissingDataList
      groups={groups}
      testId={testId}
      onFollow={() => startWayBack({ userId, clientId, to: 'document', typeKey })}
      renderAction={() => <SensitiveGroupsNoneButton clientId={clientId} />}
    />
  );
}
