import { formatEmployeeName } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import {
  type ErrorComponentProps,
  getRouteApi,
  Link,
  Outlet,
  useMatches,
} from '@tanstack/react-router';
import { Check, ChevronRight, TriangleAlert, Undo2, UserRoundMinus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  getGetEmployeeParticipantQueryKey,
  getGetSigningAgreementStateQueryKey,
  useGetEmployeeParticipant,
  useGetSigningAgreementState,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener, openedHere } from '@/app/opener';
import { NotFound, RouteError } from '@/app/route-states';
import { BackLink } from '@/components/back-link';
import { phoneBleed } from '@/components/page-spacing';
import { SectionNav, SectionNavLink } from '@/components/section-nav';
import { TabSheet } from '@/components/tab-sheet';
import { RecordHeader } from '@/features/clients/record-header';
import { agreementAwaitsEmployer, agreementSigned } from '@/features/signatures/signature-format';

import { EmployeePending } from './employee-pending';
import { employeeSections } from './employee-sections';
import { type EmployeeStatusChange, EmployeeStatusDialog } from './employee-status-dialog';
import { useEmployee } from './use-employee';

const employeeRoute = getRouteApi('/_authenticated/clienti/$clientId/angajati/$employeeId');
const clientRoute = getRouteApi('/_authenticated/clienti/$clientId');

const portalTab = '/clienti/$clientId/angajati/$employeeId/portal';

type AgreementFlag = 'unsigned' | 'awaits-employer';

const flagLabels: Record<AgreementFlag, { header: string; tab: string }> = {
  unsigned: { header: 'Act adițional nesemnat', tab: 'actul adițional nu e semnat' },
  'awaits-employer': {
    header: 'Act adițional: așteaptă angajatorul',
    tab: 'actul adițional așteaptă semnătura angajatorului',
  },
};

// Only someone who signs in the portal is asked to sign the agreement, as on the Portal tab. A
// withdrawn agreement was settled by hand, and a former worker or an archived client's worker
// signs nothing more, so none of them is flagged.
function useAgreementFlag(
  clientId: string,
  employeeId: string,
  watch: boolean
): AgreementFlag | null {
  const { request, ready, key } = useApi();
  const access = useGetEmployeeParticipant(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetEmployeeParticipantQueryKey(clientId, employeeId)),
      enabled: ready && watch,
    },
  });
  const agreement = useGetSigningAgreementState(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetSigningAgreementStateQueryKey(clientId, employeeId)),
      enabled: ready && watch,
    },
  });
  if (!watch || !access.data || !agreement.data) return null;
  if (!access.data.participant && !access.data.invitation) return null;
  const current = agreement.data.agreement;
  if (agreementSigned(current?.state) || current?.state === 'withdrawn') return null;
  return agreementAwaitsEmployer(current) ? 'awaits-employer' : 'unsigned';
}

// The last word stays with the chevron, so a wrapped name never leaves it alone on a line.
function LinkText({ children }: { children: string }) {
  const text = children.trim();
  const split = text.lastIndexOf(' ') + 1;
  return (
    <>
      {text.slice(0, split)}
      <span className="whitespace-nowrap">
        {text.slice(split)}
        <ChevronRight
          aria-hidden="true"
          className="ml-0.5 inline size-3.5 align-[-2px] text-section-tab-foreground"
        />
      </span>
    </>
  );
}

const factLink = 'underline-offset-[3px] hover:underline';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

export function EmployeeLayout() {
  const { clientId, employeeId } = employeeRoute.useParams();
  const { client } = clientRoute.useLoaderData();
  const readOnly = client.archivedAt !== null;
  const query = useEmployee(clientId, employeeId);
  const [change, setChange] = useState<EmployeeStatusChange | null>(null);
  const flushSheet = useMatches({
    select: (matches) => matches.some((match) => match.staticData.flushSheet),
  });
  const employee = query.data?.employee;
  const former = employee?.status === 'terminated';
  const flag = useAgreementFlag(clientId, employeeId, Boolean(employee) && !former && !readOnly);
  if (!employee) return <EmployeePending />;

  return (
    <div data-testid="employee-layout">
      <div className="mb-5 space-y-5">
        <RecordHeader
          back={
            <BackLink
              to="/clienti/$clientId/angajati"
              params={{ clientId }}
              label="Înapoi la lucrători"
            />
          }
          title={formatEmployeeName(employee)}
          personal
          facts={
            <>
              <Fact label="Post">
                <Link
                  to="/clienti/$clientId/posturi/$jobPositionId"
                  params={{ clientId, jobPositionId: employee.jobPosition.id }}
                  state={openedHere}
                  data-testid="employee-header-position"
                  className={factLink}
                >
                  <LinkText>{employee.jobPosition.name}</LinkText>
                </Link>
              </Fact>
              <Fact label="Client">
                <Link
                  to="/clienti/$clientId/angajati"
                  params={{ clientId }}
                  data-testid="employee-header-client"
                  className={factLink}
                >
                  <LinkText>{client.legalName}</LinkText>
                </Link>
              </Fact>
              <div className="flex items-center">
                <dt className="sr-only">Situație</dt>
                <dd>
                  {former ? (
                    <Badge variant="outline" data-testid="employee-status">
                      Fost lucrător
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      data-testid="employee-status"
                      className="border-success-border bg-success text-success-foreground"
                    >
                      <Check aria-hidden="true" className="stroke-[2.5]" />
                      Lucrător actual
                    </Badge>
                  )}
                </dd>
              </div>
              {flag && (
                <div className="flex items-center">
                  <dt className="sr-only">Atenție</dt>
                  <dd>
                    <Link
                      to={portalTab}
                      params={{ clientId, employeeId }}
                      state={keepOpener}
                      resetScroll={false}
                      data-testid="employee-agreement-flag"
                      data-flag={flag}
                      className={`inline-flex items-center gap-1.5 font-medium text-warning-foreground ${factLink}`}
                    >
                      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
                      {flagLabels[flag].header}
                    </Link>
                  </dd>
                </div>
              )}
            </>
          }
          actions={
            !readOnly && (
              <Button
                variant={former ? 'secondary' : 'destructive-soft'}
                size="sm"
                className="max-sm:h-9 max-sm:w-full"
                data-testid="employee-status-action"
                onClick={() => setChange({ employee, action: former ? 'reactivate' : 'terminate' })}
              >
                {former ? <Undo2 aria-hidden="true" /> : <UserRoundMinus aria-hidden="true" />}
                {former ? 'Anulează trecerea la foști…' : 'Trece la foști lucrători…'}
              </Button>
            )
          }
        />
        {readOnly && (
          <Notice variant="warning" data-testid="employee-client-archived" title="Client arhivat">
            Datele lucrătorului pot fi consultate și descărcate, dar nu modificate.
          </Notice>
        )}
      </div>
      <SectionNav label="Secțiunile lucrătorului" variant="folder" className={phoneBleed}>
        {employeeSections.map(({ to, label, icon, exact }) => (
          <SectionNavLink
            key={to}
            to={to}
            params={{ clientId, employeeId }}
            activeOptions={{ exact }}
            data-testid="employee-section"
            icon={icon}
            marker={
              to === portalTab &&
              flag && (
                <span data-testid="employee-portal-flag" className="-ml-0.5 inline-flex">
                  <TriangleAlert aria-hidden="true" className="size-3.5 text-warning-foreground" />
                  <span className="sr-only">, {flagLabels[flag].tab}</span>
                </span>
              )
            }
          >
            {label}
          </SectionNavLink>
        ))}
      </SectionNav>
      <TabSheet flush={flushSheet}>
        <Outlet />
      </TabSheet>
      <EmployeeStatusDialog clientId={clientId} change={change} onClose={() => setChange(null)} />
    </div>
  );
}

export function EmployeeNotFound() {
  const { clientId } = employeeRoute.useParams();
  return (
    <NotFound
      testId="employee-not-found"
      title="Lucrătorul nu a fost găsit"
      description="Nu există niciun lucrător cu acest identificator la acest client."
      action={
        <Button size="lg" asChild>
          <Link to="/clienti/$clientId/angajati" params={{ clientId }}>
            Înapoi la lucrători
          </Link>
        </Button>
      }
    />
  );
}

export function EmployeeError({ error }: ErrorComponentProps) {
  const { clientId } = clientRoute.useParams();
  return (
    <RouteError
      error={error}
      testId="employee-error"
      title="Lucrătorul nu a putut fi încărcat"
      retryTestId="employee-retry"
      explainForbidden
      back={
        <BackLink
          to="/clienti/$clientId/angajati"
          params={{ clientId }}
          label="Înapoi la lucrători"
        />
      }
    />
  );
}
