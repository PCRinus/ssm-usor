import { formatEmployeeName, trainingDomainLabels } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useRouteContext } from '@tanstack/react-router';
import { PenLine, Signature } from 'lucide-react';
import { useState } from 'react';

import {
  getListMySignatureRequestsQueryKey,
  type SignatureRequestListResponseItemsItem,
  useListMySignatureRequests,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';
import { Notice } from '@/components/notice';
import { useAuth } from '@/features/auth/auth-context';
import { formatDate } from '@/features/employees/employee-format';
import { formatDay } from '@/features/participants/participant-format';

import { AgreementWarning } from './agreement-warning';
import { requestDocument, signAsLabel, signingBatchLimit, trainingCount } from './signature-format';
import { SigningDialog } from './signing-dialog';

type SignatureRequest = SignatureRequestListResponseItemsItem;

interface ClientGroup {
  client: SignatureRequest['client'];
  requests: SignatureRequest[];
}

function byClient(items: readonly SignatureRequest[]): ClientGroup[] {
  const groups = new Map<string, ClientGroup>();
  for (const item of items) {
    const group = groups.get(item.client.id) ?? { client: item.client, requests: [] };
    group.requests.push(item);
    groups.set(item.client.id, group);
  }
  return [...groups.values()].sort((a, b) => a.client.name.localeCompare(b.client.name, 'ro'));
}

const countLabel = (count: number) => `${trainingCount(count)} de semnat`;

export function SignatureRequestsPage() {
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const requests = useListMySignatureRequests({
    request: apiRequest,
    query: {
      queryKey: [...getListMySignatureRequestsQueryKey(), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  // The batch the signing session will sign with one code; kept to the requests still listed.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const items = requests.data?.items ?? [];
  const chosen = items.filter((item) => selected.has(item.id));
  const overLimit = chosen.length > signingBatchLimit;
  const [signing, setSigning] = useState(false);

  function toggle(ids: string[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  return (
    <div data-testid="signature-requests-page" className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Semnături</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Instruirile pe care le ai de semnat ca instructor, ca verificator sau la „Admite la
            lucru”. Alegi rândurile, ceri un cod și le semnezi pe toate odată.
          </p>
        </div>
        {items.length > 0 && (
          <Button
            data-testid="signature-requests-sign"
            disabled={chosen.length === 0 || overLimit}
            aria-describedby={overLimit ? 'signature-requests-limit' : undefined}
            onClick={() => setSigning(true)}
          >
            <PenLine aria-hidden="true" />
            {chosen.length > 0 ? `Semnează (${chosen.length})` : 'Semnează'}
          </Button>
        )}
      </div>

      {overLimit && (
        <Notice
          variant="warning"
          id="signature-requests-limit"
          data-testid="signature-requests-limit"
        >
          Ai ales {trainingCount(chosen.length)}. Cu un cod semnezi cel mult {signingBatchLimit};
          debifează {chosen.length - signingBatchLimit}, iar pe celelalte le semnezi apoi cu alt
          cod.
        </Notice>
      )}

      {requests.isError || !apiRequest.baseUrl ? (
        <Notice
          variant="destructive"
          data-testid="signature-requests-error"
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
          {requests.error instanceof ApiHttpError && requests.error.status === 401
            ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
            : 'Nu am putut încărca cererile de semnare. Încearcă din nou.'}
        </Notice>
      ) : !requests.data ? (
        <div className="grid gap-3" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-card px-5 py-10">
          <EmptyState icon={Signature} data-testid="signature-requests-empty">
            Nu ai nimic de semnat. Când înregistrezi o instruire și te alegi semnatar, rândul ei
            apare aici.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-5">
          {byClient(items).map((group) => {
            const ids = group.requests.map((request) => request.id);
            const picked = ids.filter((id) => selected.has(id)).length;
            return (
              <section
                key={group.client.id}
                data-testid="signature-requests-client"
                aria-labelledby={`signature-requests-client-${group.client.id}`}
                className="overflow-hidden rounded-lg border bg-card"
              >
                <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
                  <Checkbox
                    aria-label={`Alege toate instruirile de la ${group.client.name}`}
                    data-testid="signature-requests-client-select"
                    checked={picked === 0 ? false : picked === ids.length ? true : 'indeterminate'}
                    onCheckedChange={(checked) => toggle(ids, checked === true)}
                  />
                  <h2
                    id={`signature-requests-client-${group.client.id}`}
                    className="min-w-0 flex-1 font-semibold"
                  >
                    <Link
                      to="/clients/$clientId/trainings"
                      params={{ clientId: group.client.id }}
                      className="hover:underline"
                    >
                      {group.client.name}
                    </Link>
                  </h2>
                  <span className="text-sm text-muted-foreground">
                    {countLabel(group.requests.length)}
                  </span>
                </header>
                <ul className="divide-y">
                  {group.requests.map((request) => (
                    <RequestRow
                      key={request.id}
                      request={request}
                      checked={selected.has(request.id)}
                      onCheckedChange={(on) => toggle([request.id], on)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <SigningDialog
        requests={byClient(chosen).flatMap((group) => group.requests)}
        open={signing}
        onClose={() => setSigning(false)}
      />
    </div>
  );
}

function RequestRow({
  request,
  checked,
  onCheckedChange,
}: {
  request: SignatureRequest;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const document = requestDocument(request);
  const name = formatEmployeeName(request.employee);
  return (
    <li
      data-testid="signature-request"
      data-kind={request.kind}
      className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-1 px-5 py-3 sm:grid-cols-[auto_1fr_auto]"
    >
      <Checkbox
        className="mt-0.5"
        aria-label={`Alege ${document.noun} lui ${name} din ${formatDate(document.day)}`}
        data-testid="signature-request-select"
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            to={
              document.domain === 'ssm'
                ? '/clients/$clientId/employees/$employeeId/training/ssm'
                : '/clients/$clientId/employees/$employeeId/training/psi'
            }
            params={{ clientId: request.client.id, employeeId: request.employee.id }}
            data-testid="signature-request-employee"
            className="font-medium hover:underline"
          >
            {name}
          </Link>
          <Badge variant="secondary">{trainingDomainLabels[document.domain]}</Badge>
          <AgreementWarning agreement={request.agreement} />
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {document.summary} · {signAsLabel(request.slot)}
        </p>
      </div>
      <p className="col-start-2 text-sm text-muted-foreground sm:col-start-auto sm:text-right">
        Cerută pe <span className="tabular-nums">{formatDay(request.issuedAt)}</span>
      </p>
    </li>
  );
}
