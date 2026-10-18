import { plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, Navigate } from '@tanstack/react-router';
import { ChevronLeft, CircleCheck, PenLine } from 'lucide-react';

import {
  type PortalSigningAgreementsResponse,
  useListPortalClientSignatureRequests,
  useListPortalSigningAgreements,
} from '@/api/generated/api';
import {
  cardClass,
  Page,
  PageFailed,
  PageGrid,
  PageHeader,
  PageLoading,
  SectionLabel,
} from '@/components/page';
import {
  isAdministrator,
  type Participation,
  useParticipation,
} from '@/features/participation/participation-context';
import { useFormatDate, useFormatList } from '@/lib/format';
import { trainingDomainMessages, trainingPhaseMessages } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

import { AgreementPdfButton } from './agreement-pdf-button';
import { employeeNameOf, type PortalSignatureRequest } from './signing-items';
import { slotRoleMessages } from './signing-messages';

type AgreementItem = PortalSigningAgreementsResponse['items'][number];

export function ClientSignaturesPage() {
  const { t } = useLingui();
  const participation = useParticipation();
  if (!isAdministrator(participation)) return <Navigate to="/" replace />;
  return (
    <Page testId="client-signatures-page">
      <Link
        to="/angajati"
        className="-mb-3 -ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm px-1 text-sm font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:-mb-5"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        <Trans>Angajați</Trans>
      </Link>
      <PageHeader
        eyebrow={participation.clientName}
        title={t`Semnături`}
        description={t`Actele adiționale care așteaptă semnătura angajatorului și instruirile pe care angajații nu le-au semnat încă.`}
      />
      <PageGrid>
        <div className="grid gap-8 lg:col-span-8">
          <Agreements participation={participation} />
          <PendingRequests participantId={participation.participantId} />
        </div>
      </PageGrid>
    </Page>
  );
}

function Agreements({ participation }: { participation: Participation }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const agreements = useListPortalSigningAgreements(participation.participantId, {
    request: apiRequest,
  });
  const awaiting = agreements.data?.items.filter((item) => item.awaitingEmployer) ?? [];
  const signed = agreements.data?.items.filter((item) => !item.awaitingEmployer) ?? [];

  return (
    <section aria-labelledby="agreements-title" className="grid gap-2.5" data-testid="agreements">
      <div className="flex items-end justify-between gap-3">
        <SectionLabel id="agreements-title">
          <Trans>Acte adiționale de semnat de angajator</Trans>
        </SectionLabel>
      </div>
      {agreements.isPending ? (
        <PageLoading />
      ) : agreements.isError ? (
        <PageFailed onRetry={() => void agreements.refetch()} />
      ) : (
        <>
          {awaiting.length === 0 ? (
            <p
              data-testid="agreements-none"
              className="rounded-xl border border-dashed px-4 py-4 text-sm text-foreground/80 sm:px-5"
            >
              <Trans>Niciun act adițional nu așteaptă semnătura ta.</Trans>
            </p>
          ) : (
            <>
              <ul className={cn(cardClass, 'divide-y overflow-hidden')}>
                {awaiting.map((item) => (
                  <AgreementRow key={item.employee.id} item={item} participation={participation} />
                ))}
              </ul>
              {awaiting.length > 1 && (
                <Button asChild className="h-12 w-full text-base sm:w-fit sm:px-6">
                  <Link to="/semneaza" search={{ doar: 'acte' }} data-testid="agreements-sign-all">
                    <PenLine aria-hidden="true" />
                    {t`Semnează toate (${awaiting.length})`}
                  </Link>
                </Button>
              )}
            </>
          )}
          {signed.length > 0 && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
                {t({
                  message: plural(signed.length, {
                    one: 'Un act adițional semnat electronic de ambele părți',
                    few: '# acte adiționale semnate electronic de ambele părți',
                    other: '# de acte adiționale semnate electronic de ambele părți',
                  }),
                })}
              </summary>
              <ul className={cn(cardClass, 'mt-2 divide-y overflow-hidden')}>
                {signed.map((item) => (
                  <AgreementRow key={item.employee.id} item={item} participation={participation} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}

function AgreementRow({
  item,
  participation,
}: {
  item: AgreementItem;
  participation: Participation;
}) {
  const { t } = useLingui();
  const formatDate = useFormatDate();
  const day = (iso: string | null) => (iso ? formatDate(iso.slice(0, 10), 'short') : '');
  const { agreement } = item;
  return (
    <li
      data-testid="agreement-row"
      data-awaiting={item.awaitingEmployer}
      className="grid gap-3 px-4 py-3.5 sm:flex sm:items-center sm:px-5"
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="font-semibold">{employeeNameOf(item.employee)}</span>
        <span className="text-sm text-muted-foreground">
          {item.awaitingEmployer
            ? t`Semnat de angajat pe ${day(agreement.employeeSignedAt)}; așteaptă semnătura ta.`
            : t`Semnat electronic pe ${day(agreement.employerSignedAt ?? agreement.signedAt)}.`}
        </span>
      </span>
      <span className="flex gap-2">
        <AgreementPdfButton participation={participation} employeeId={item.employee.id} />
        {item.awaitingEmployer && (
          <Button asChild className="h-10 px-4">
            <Link to="/semneaza" search={{ acord: item.employee.id }} data-testid="agreement-sign">
              <Trans>Semnează</Trans>
            </Link>
          </Button>
        )}
      </span>
    </li>
  );
}

function PendingRequests({ participantId }: { participantId: string }) {
  const apiRequest = useApiRequest();
  const requests = useListPortalClientSignatureRequests(participantId, { request: apiRequest });
  const byEmployee = new Map<string, PortalSignatureRequest[]>();
  for (const request of requests.data?.items ?? []) {
    const id = request.record.employee.id;
    byEmployee.set(id, [...(byEmployee.get(id) ?? []), request]);
  }

  return (
    <section
      aria-labelledby="pending-title"
      className="grid gap-2.5"
      data-testid="client-pending-requests"
    >
      <SectionLabel id="pending-title">
        <Trans>Semnături în așteptare</Trans>
      </SectionLabel>
      {requests.isPending ? (
        <PageLoading />
      ) : requests.isError ? (
        <PageFailed onRetry={() => void requests.refetch()} />
      ) : byEmployee.size === 0 ? (
        <p
          data-testid="client-pending-none"
          className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-4 text-sm text-foreground/80 sm:px-5"
        >
          <CircleCheck aria-hidden="true" className="size-4 text-success-foreground" />
          <Trans>Toate instruirile trimise spre semnare sunt semnate.</Trans>
        </p>
      ) : (
        <ul className={cn(cardClass, 'divide-y overflow-hidden')}>
          {[...byEmployee.values()].map((items) => (
            <EmployeeRequests key={items[0]!.record.employee.id} items={items} />
          ))}
        </ul>
      )}
    </section>
  );
}

function byRecord(requests: PortalSignatureRequest[]) {
  const records = new Map<string, PortalSignatureRequest[]>();
  for (const request of requests) {
    records.set(request.record.id, [...(records.get(request.record.id) ?? []), request]);
  }
  return records;
}

function EmployeeRequests({ items }: { items: PortalSignatureRequest[] }) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const formatList = useFormatList();
  const employee = items[0]!.record.employee;
  return (
    <li data-testid="client-pending-employee" className="grid gap-2 px-4 py-3.5 sm:px-5">
      <Link
        to="/angajati/$employeeId"
        params={{ employeeId: employee.id }}
        className="w-fit font-semibold underline-offset-4 hover:underline"
      >
        {employeeNameOf(employee)}
      </Link>
      <ul className="grid gap-2.5">
        {[...byRecord(items).values()].map((requests) => {
          const { record } = requests[0]!;
          const phase = i18n._(trainingPhaseMessages[record.phase]);
          const domain = i18n._(trainingDomainMessages[record.domain]);
          const day = formatDate(record.heldOn, 'short');
          const people = formatList(
            requests.map(
              (request) => `${request.signerName} (${i18n._(slotRoleMessages[request.slot])})`
            )
          );
          return (
            <li key={record.id} data-testid="client-pending-request" className="grid text-sm">
              <span className="font-medium">
                <time dateTime={record.heldOn} className="tabular-nums">
                  {day}
                </time>
                {' · '}
                {t`${phase} ${domain}`}
              </span>
              <span className="text-foreground/80">{t`Așteaptă semnătura: ${people}.`}</span>
            </li>
          );
        })}
      </ul>
    </li>
  );
}
