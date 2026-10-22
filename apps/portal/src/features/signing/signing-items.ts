import { SIGNING_SESSION_MAX_ITEMS, type SigningAgreementState } from '@ssm-usor/contracts';
import type { QueryClient } from '@tanstack/react-query';

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

export const signingLimit = SIGNING_SESSION_MAX_ITEMS;

export const agreementKey = (employeeId: string) => `agreement:${employeeId}`;
const requestKey = (requestId: string) => `request:${requestId}`;

export const settledAgreementStates: ReadonlySet<SigningAgreementState> = new Set([
  'signed_electronically',
  'signed_on_paper',
  'in_contract',
]);

export type OwnAgreementState = SigningAgreementResponse;

// The agreement awaits the employee from their first sign-in, before any member records it.
export const awaitsEmployee = (agreement: OwnAgreement) =>
  agreement === null || agreement.awaiting === 'employee';

export const employeeNameOf = (employee: { lastName: string; firstName: string }) =>
  `${employee.lastName} ${employee.firstName}`;

export function useSigningItems(participation: Participation) {
  const apiRequest = useApiRequest();
  const { participantId, employeeId } = participation;
  const administrator = isAdministrator(participation);
  const requests = useListPortalSignatureRequests(participantId, { request: apiRequest });
  // An administrator who is also an employee signs their own agreement as the employee.
  const ownAgreement = useGetPortalSigningAgreementState(participantId, {
    request: apiRequest,
    query: { enabled: employeeId !== null },
  });
  const agreements = useListPortalSigningAgreements(participantId, {
    request: apiRequest,
    query: { enabled: administrator },
  });
  const agreementQueries = [
    ...(employeeId !== null ? [ownAgreement] : []),
    ...(administrator ? [agreements] : []),
  ];

  const items: SigningItem[] = [];
  const own = ownAgreement.data?.agreement ?? null;
  if (employeeId && ownAgreement.data && awaitsEmployee(own) && !ownAgreement.data.unavailable) {
    items.push({
      kind: 'agreement',
      key: agreementKey(employeeId),
      employeeId,
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
    ownAgreement: own,
    isPending: requests.isPending || agreementQueries.some((query) => query.isPending),
    isError: requests.isError || agreementQueries.some((query) => query.isError),
    refetch: () => {
      void requests.refetch();
      for (const query of agreementQueries) void query.refetch();
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
  request.agreement === null || !settledAgreementStates.has(request.agreement.state);

// The employees whose agreement the warning on a record no longer applies to: those signed along
// with it, and the participant's own once they signed it, while the employer's signature waits.
export function agreementsSettledFor(
  ownEmployeeId: string | null,
  ownAgreement: OwnAgreement,
  signedAlong: Iterable<string> = []
): ReadonlySet<string> {
  const settled = new Set(signedAlong);
  if (ownEmployeeId && ownAgreement?.employeeSignedAt) settled.add(ownEmployeeId);
  return settled;
}

export function defaultChoice(items: SigningItem[], keys?: ReadonlySet<string>) {
  const wanted = keys ? items.filter((item) => keys.has(item.key)) : items;
  return new Set(wanted.slice(0, signingLimit).map((item) => item.key));
}

const signingQuery =
  /\/portal\/participants\/[^/]+\/(?:.*\/)?(?:signature-requests|signing-agreements?|training-records|sheets|tests)(?:\/|$)/;

export function invalidateSigningQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey: [key] }) => typeof key === 'string' && signingQuery.test(key),
  });
}
