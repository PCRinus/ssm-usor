import { Trans, useLingui } from '@lingui/react/macro';
import { searchTerms } from '@ssm-usor/contracts';
import { Input } from '@ssm-usor/ui/components/input';
import { Link, Navigate } from '@tanstack/react-router';
import { ChevronRight, Search, UsersRound } from 'lucide-react';
import { useState } from 'react';

import { useListPortalClientEmployees } from '@/api/generated/api';
import { cardClass, Page, PageFailed, PageGrid, PageHeader, PageLoading } from '@/components/page';
import { isAdministrator, useParticipation } from '@/features/participation/participation-context';
import { useApiRequest } from '@/lib/request';

import { EmployeeTrainingStates } from './employee-training-states';

export function EmployeesPage() {
  const { t } = useLingui();
  const participation = useParticipation();
  if (!isAdministrator(participation)) return <Navigate to="/" replace />;
  return (
    <Page testId="employees-page">
      <PageHeader
        eyebrow={participation.clientName}
        title={t`Angajați`}
        description={t`Stadiul instruirii fiecărui angajat; deschide unul pentru instruirile și fișele lui.`}
      />
      <EmployeeList participantId={participation.participantId} />
    </Page>
  );
}

function EmployeeList({ participantId }: { participantId: string }) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const [query, setQuery] = useState('');
  const employees = useListPortalClientEmployees(participantId, { request: apiRequest });
  if (employees.isPending) return <PageLoading />;
  if (employees.isError) return <PageFailed onRetry={() => void employees.refetch()} />;
  const items = employees.data.items;
  if (items.length === 0) {
    return (
      <div
        data-testid="employees-empty"
        className="grid justify-items-center gap-3 rounded-xl border border-dashed px-4 py-8 text-center"
      >
        <UsersRound aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-muted-foreground">
          <Trans>Niciun angajat înregistrat încă.</Trans>
        </p>
      </div>
    );
  }
  const terms = searchTerms(query);
  const shown = items.filter((employee) => {
    const name = searchTerms(`${employee.lastName} ${employee.firstName}`).join(' ');
    return terms.every((term) => name.includes(term));
  });
  return (
    <PageGrid>
      <div className="grid gap-4 lg:col-span-8">
        <label className="relative block">
          <span className="sr-only">
            <Trans>Caută un angajat după nume</Trans>
          </span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            data-testid="employees-search"
            placeholder={t`Caută după nume`}
            className="h-12 bg-card pl-9 sm:h-11"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {shown.length === 0 ? (
          <p data-testid="employees-no-match" className="py-4 text-center text-muted-foreground">
            <Trans>Niciun angajat cu acest nume.</Trans>
          </p>
        ) : (
          <ul className={`${cardClass} divide-y overflow-hidden`} data-testid="employees-list">
            {shown.map((employee) => (
              <li key={employee.id}>
                <Link
                  to="/angajati/$employeeId"
                  params={{ employeeId: employee.id }}
                  data-testid="employee-row"
                  className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset sm:px-5 sm:py-4"
                >
                  <span className="grid min-w-0 flex-1 gap-2.5">
                    <span className="grid gap-0.5">
                      <span className="font-semibold break-words">
                        {employee.lastName} {employee.firstName}
                      </span>
                      <span className="text-sm break-words text-muted-foreground">
                        {[employee.position, employee.workplace].filter(Boolean).join(', ')}
                      </span>
                    </span>
                    <EmployeeTrainingStates employee={employee} />
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-muted-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageGrid>
  );
}
