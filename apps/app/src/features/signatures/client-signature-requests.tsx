import {
  formatEmployeeName,
  signerSlotLabels,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';

import {
  getListClientSignatureRequestsQueryKey,
  type SignatureRequestListResponseItemsItem,
  useListClientSignatureRequests,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { formatDate, roCount } from '@/features/employees/employee-format';
import { formatDay } from '@/features/participants/participant-format';

import { AgreementWarning } from './agreement-warning';
import { requestDocument } from './signature-format';

type SignatureRequest = SignatureRequestListResponseItemsItem;

interface EmployeeGroup {
  employee: SignatureRequest['employee'];
  agreement: SignatureRequest['agreement'];
  requests: SignatureRequest[];
}

function byEmployee(items: readonly SignatureRequest[]): EmployeeGroup[] {
  const groups = new Map<string, EmployeeGroup>();
  for (const item of items) {
    const { employee } = item;
    const group = groups.get(employee.id) ?? {
      employee,
      agreement: item.agreement,
      requests: [],
    };
    group.requests.push(item);
    groups.set(employee.id, group);
  }
  return [...groups.values()].sort((a, b) =>
    formatEmployeeName(a.employee).localeCompare(formatEmployeeName(b.employee), 'ro')
  );
}

const pendingLabel = (count: number) => `${roCount(count, 'semnătură', 'semnături')} în așteptare`;

export function ClientSignatureRequests({
  clientId,
  userId,
}: {
  clientId: string;
  userId: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { state: 'pending' } as const;
  const requests = useListClientSignatureRequests(clientId, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientSignatureRequestsQueryKey(clientId, params), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const items = requests.data?.items ?? [];
  const groups = byEmployee(items);

  return (
    <SectionCard
      data-testid="client-signature-requests"
      title={items.length === 0 ? 'Semnături în așteptare' : pendingLabel(items.length)}
      description="Cine nu a semnat încă rândul lui din fișă, în portal sau din Semnături. Cererile au plecat pe email sau prin SMS la salvarea instruirii."
    >
      {requests.isPending ? (
        <Skeleton className="h-10 w-full" />
      ) : requests.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={requests.isFetching}
              onClick={() => void requests.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca semnăturile în așteptare.
        </Notice>
      ) : items.length === 0 ? (
        <p data-testid="client-signature-requests-empty" className="text-sm text-muted-foreground">
          Nicio semnătură în așteptare.
        </p>
      ) : (
        <ul className="-mx-6 -mb-6 divide-y border-t">
          {groups.map((group) => (
            <li
              key={group.employee.id}
              data-testid="client-signature-requests-employee"
              className="grid gap-2 px-6 py-3"
            >
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  to="/clients/$clientId/employees/$employeeId"
                  params={{ clientId, employeeId: group.employee.id }}
                  className="font-medium hover:underline"
                >
                  {formatEmployeeName(group.employee)}
                </Link>
                <AgreementWarning agreement={group.agreement} />
              </p>
              <ul className="grid gap-1.5 text-sm">
                {group.requests.map((request) => (
                  <li
                    key={request.id}
                    data-testid="client-signature-request"
                    data-kind={request.kind}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1"
                  >
                    <RequestLink
                      clientId={clientId}
                      employeeId={group.employee.id}
                      request={request}
                    />
                    <span className="text-muted-foreground">·</span>
                    <Badge variant="outline">{signerSlotLabels[request.slot]}</Badge>
                    <span data-testid="client-signature-request-signer">
                      {request.signer?.name ?? 'Semnatar care nu mai are acces'}
                    </span>
                    <span className="text-muted-foreground">
                      · cerută pe{' '}
                      <span className="tabular-nums">{formatDay(request.issuedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function RequestLink({
  clientId,
  employeeId,
  request,
}: {
  clientId: string;
  employeeId: string;
  request: SignatureRequest;
}) {
  const { domain } = requestDocument(request);
  return (
    <Link
      to={
        domain === 'ssm'
          ? '/clients/$clientId/employees/$employeeId/training/ssm'
          : '/clients/$clientId/employees/$employeeId/training/psi'
      }
      params={{ clientId, employeeId }}
      className="hover:underline"
    >
      {request.record ? (
        <>
          {trainingPhaseLabels[request.record.phase]} {trainingDomainLabels[request.record.domain]}{' '}
          din <span className="tabular-nums">{formatDate(request.record.heldOn)}</span>
        </>
      ) : (
        request.label
      )}
    </Link>
  );
}
