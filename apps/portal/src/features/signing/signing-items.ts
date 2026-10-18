import type { SigningAgreementState } from '@ssm-usor/contracts';

import {
  type PortalSignatureRequestsResponse,
  type PortalSigningAgreementsResponse,
  type SigningAgreementResponse,
  useGetPortalSigningAgreementState,
  useListPortalSignatureRequests,
  useListPortalSigningAgreements,
} from '@/api/generated/api';
import {
  isAdministrator,
  type Participation,
} from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';

export type PortalSignatureRequest = PortalSignatureRequestsResponse['items'][number];
type AwaitedAgreement = PortalSigningAgreementsResponse['items'][number];
export type OwnAgreement = SigningAgreementResponse['agreement'];

export type SigningItem =
  | { kind: 'agreement'; key: string; employeeId: string; party: 'employee' }
  | {
      kind: 'agreement';
      key: string;
      employeeId: string;
      party: 'employer';
      employeeName: string;
      employeeSignedAt: string | null;
    }
  | { kind: 'request'; key: string; request: PortalSignatureRequest };

export const agreementKey = (employeeId: string) => `agreement:${employeeId}`;
const requestKey = (requestId: string) => `request:${requestId}`;

export const settledAgreementStates: ReadonlySet<SigningAgreementState> = new Set([
  'signed_electronically',
  'signed_on_paper',
]);

export const awaitsEmployee = (agreement: OwnAgreement) =>
  agreement?.state === 'generated' && agreement.employeeSignedAt === null;

export const employeeNameOf = (employee: { lastName: string; firstName: string }) =>
  `${employee.lastName} ${employee.firstName}`;

export function useSigningItems(participation: Participation) {
  const apiRequest = useApiRequest();
  const { participantId } = participation;
  const administrator = isAdministrator(participation);
  const requests = useListPortalSignatureRequests(participantId, { request: apiRequest });
  const ownAgreement = useGetPortalSigningAgreementState(participantId, {
    request: apiRequest,
    query: { enabled: !administrator },
  });
  const agreements = useListPortalSigningAgreements(participantId, {
    request: apiRequest,
    query: { enabled: administrator },
  });
  const agreementQuery = administrator ? agreements : ownAgreement;

  const items: SigningItem[] = [];
  if (
    !administrator &&
    participation.employeeId &&
    awaitsEmployee(ownAgreement.data?.agreement ?? null)
  ) {
    items.push({
      kind: 'agreement',
      key: agreementKey(participation.employeeId),
      employeeId: participation.employeeId,
      party: 'employee',
    });
  }
  if (administrator) {
    for (const each of agreements.data?.items.filter((item) => item.awaitingEmployer) ?? []) {
      items.push(employerItem(each));
    }
  }
  for (const request of requests.data?.items ?? []) {
    items.push({ kind: 'request', key: requestKey(request.id), request });
  }

  return {
    items,
    ownAgreement: ownAgreement.data?.agreement ?? null,
    isPending: requests.isPending || agreementQuery.isPending,
    isError: requests.isError || agreementQuery.isError,
    refetch: () => {
      void requests.refetch();
      void agreementQuery.refetch();
    },
  };
}

function employerItem({ employee, agreement }: AwaitedAgreement): SigningItem {
  return {
    kind: 'agreement',
    key: agreementKey(employee.id),
    employeeId: employee.id,
    party: 'employer',
    employeeName: employeeNameOf(employee),
    employeeSignedAt: agreement.employeeSignedAt,
  };
}

export const unsettledAgreement = (request: PortalSignatureRequest) =>
  request.agreementState === null || !settledAgreementStates.has(request.agreementState);
