import {
  countOf,
  formatEmployeeName,
  signerSlotLabels,
  type SortOrder,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Link, useRouteContext } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

import {
  getListClientSignatureRequestsQueryKey,
  type SignatureRequestListResponseItemsItem,
  useListClientSignatureRequests,
} from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { HelpLink } from '@/components/help-link';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { formatDate, formatDay } from '@/lib/dates';

import { AgreementWarning } from './agreement-warning';
import { requestDocument } from './signature-format';

type SignatureRequest = SignatureRequestListResponseItemsItem;
type SortKey = 'employee' | 'issuedAt';

const pendingLabel = (count: number) => `${countOf(count, 'semnătură', 'semnături')} în așteptare`;

const collator = new Intl.Collator('ro');
const dayMs = 24 * 60 * 60 * 1000;

function waitingFor(issuedAt: string) {
  const days = Math.floor((Date.now() - Date.parse(issuedAt)) / dayMs);
  if (days < 1) return 'de azi';
  return days === 1 ? 'de o zi' : `de ${countOf(days, 'zi', 'zile')}`;
}

const byEmployee = (a: SignatureRequest, b: SignatureRequest) =>
  collator.compare(formatEmployeeName(a.employee), formatEmployeeName(b.employee));
const byIssued = (a: SignatureRequest, b: SignatureRequest) =>
  Date.parse(a.issuedAt) - Date.parse(b.issuedAt);

function sorted(items: readonly SignatureRequest[], sort: SortKey, order: SortOrder) {
  const [first, then] = sort === 'employee' ? [byEmployee, byIssued] : [byIssued, byEmployee];
  const direction = order === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => direction * (first(a, b) || then(a, b)));
}

function signatureColumns(clientId: string) {
  const helper = createDataTableColumns<SignatureRequest>();
  return helper.columns([
    helper.accessor((row) => formatEmployeeName(row.employee), {
      id: 'employee',
      header: 'Lucrător',
      enableSorting: true,
      meta: { cellClassName: 'font-medium', skeletonClassName: 'w-32', personal: true },
      cell: ({ row, getValue }) => (
        <>
          <Link
            to="/clienti/$clientId/angajati/$employeeId"
            state={openedHere}
            params={{ clientId, employeeId: row.original.employee.id }}
            data-testid="client-signature-request-employee"
            className="hover:underline"
          >
            {getValue()}
          </Link>
          <span className="mt-1.5 block empty:hidden">
            <AgreementWarning agreement={row.original.agreement} />
          </span>
        </>
      ),
    }),
    helper.display({
      id: 'document',
      header: 'Ce se semnează',
      meta: { skeletonClassName: 'w-48' },
      cell: ({ row }) => (
        <span data-testid="client-signature-request-document" data-kind={row.original.kind}>
          <RequestLink clientId={clientId} request={row.original} />
        </span>
      ),
    }),
    helper.display({
      id: 'slot',
      header: 'Rubrica',
      meta: { skeletonClassName: 'w-20' },
      cell: ({ row }) => <Badge variant="outline">{signerSlotLabels[row.original.slot]}</Badge>,
    }),
    helper.display({
      id: 'signer',
      header: 'Semnatar',
      meta: { skeletonClassName: 'w-28', personal: true },
      cell: ({ row }) => (
        <span data-testid="client-signature-request-signer">
          {row.original.signer ? (
            <Masked>{row.original.signer.name}</Masked>
          ) : (
            'Semnatar care nu mai are acces'
          )}
        </span>
      ),
    }),
    helper.accessor((row) => row.issuedAt, {
      id: 'issuedAt',
      header: 'Cerută',
      enableSorting: true,
      meta: { cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ getValue }) => (
        <>
          {formatDay(getValue())}
          <CellNote>{waitingFor(getValue())}</CellNote>
        </>
      ),
    }),
  ]);
}

export function ClientSignatureRequests({
  clientId,
  userId,
  hideWhenEmpty = false,
}: {
  clientId: string;
  userId: string;
  hideWhenEmpty?: boolean;
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
  const [sort, setSort] = useState<{ sort: SortKey; order: SortOrder }>({
    sort: 'employee',
    order: 'asc',
  });
  const columns = useMemo(() => signatureColumns(clientId), [clientId]);
  const items = requests.data?.items;
  const rows = useMemo(
    () => (items ? sorted(items, sort.sort, sort.order) : undefined),
    [items, sort]
  );
  const count = items?.length ?? 0;
  if (hideWhenEmpty && requests.isSuccess && count === 0) return null;

  return (
    <section
      data-testid="client-signature-requests"
      data-sheet-panel
      aria-labelledby={`client-signature-requests-${clientId}`}
      className="scroll-mt-32 overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex min-h-8 items-center px-6 pt-6 pb-4">
        <h2
          id={`client-signature-requests-${clientId}`}
          data-slot="section-card-title"
          className="inline text-lg leading-snug font-semibold"
        >
          {count === 0 ? 'Semnături în așteptare' : pendingLabel(count)}
        </h2>
        <HelpLink
          topic="portal.semnaturi"
          label="Ajutor: Semnături în așteptare"
          className="ml-1"
        />
      </div>
      {requests.isError ? (
        <div className="px-6 pb-6">
          <LoadFailed busy={requests.isFetching} onRetry={() => void requests.refetch()}>
            Nu am putut încărca semnăturile în așteptare.
          </LoadFailed>
        </div>
      ) : requests.isSuccess && count === 0 ? (
        <p
          data-testid="client-signature-requests-empty"
          className="px-6 pb-6 text-sm text-muted-foreground"
        >
          Nicio semnătură în așteptare.
        </p>
      ) : (
        <DataTable
          testId="client-signature-requests-table"
          rowTestId="client-signature-request"
          label="Semnături în așteptare"
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          status={requests.isPending ? 'pending' : 'success'}
          sort={sort}
          onSortChange={(next) => setSort({ sort: next.sort as SortKey, order: next.order })}
          empty={null}
        />
      )}
    </section>
  );
}

function RequestLink({ clientId, request }: { clientId: string; request: SignatureRequest }) {
  const { domain } = requestDocument(request);
  return (
    <Link
      to={
        domain === 'ssm'
          ? '/clienti/$clientId/angajati/$employeeId/instruire/ssm'
          : '/clienti/$clientId/angajati/$employeeId/instruire/su'
      }
      params={{ clientId, employeeId: request.employee.id }}
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
