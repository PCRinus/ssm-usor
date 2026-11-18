import {
  countOf,
  defaultPageSize,
  employeeInviteesLimit,
  formatEmployeeName,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Plus, Send, UsersRound } from 'lucide-react';
import { useMemo } from 'react';

import { type ListEmployeesParams, useListEmployees } from '@/api/generated/api';
import { keepOpener } from '@/app/opener';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListActions, ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { Notice } from '@/components/notice';
import { SearchInput } from '@/components/search-input';
import { pendingWorkersLabel, workerNoun } from '@/features/employees/employee-format';
import { WorkersCount, WorkersListError, WorkersNoMatch } from '@/features/employees/workers-list';

import type { ParticipantMessage } from './participant-actions';
import { portalRosterColumns, type RosterRow } from './portal-roster-columns';
import type { PortalAccessActions } from './use-portal-access-actions';
import { defaultSort, type PortalRosterState, type RosterFilters } from './use-portal-roster';

export function PortalRoster({
  clientId,
  roster,
  readOnly,
  gettingStarted,
  actions,
  message,
  onInvite,
  onInviteChosen,
  openingBatch,
}: {
  clientId: string;
  roster: PortalRosterState;
  readOnly: boolean;
  gettingStarted: boolean;
  actions: PortalAccessActions;
  message: ParticipantMessage;
  onInvite: (row: RosterRow) => void;
  onInviteChosen: () => void;
  openingBatch: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const phone = useIsMobile();
  const { employees, withAccess, chosen, narrowed, listFilters, facets, q, params } = roster;
  const meta = employees.data ?? { page: params.page ?? 1, pageSize: defaultPageSize, total: 0 };
  const unfilteredTotal = employees.data?.unfilteredTotal ?? 0;
  const listStatus = !apiRequest.baseUrl ? 'error' : employees.status;
  const columns = useMemo(
    () => portalRosterColumns({ readOnly, actions, onInvite }),
    [readOnly, actions, onInvite]
  );
  const accessTotal = withAccess.data?.total;
  const titleId = `portal-roster-${clientId}`;

  return (
    <section
      data-testid="portal-roster"
      data-sheet-panel
      aria-labelledby={titleId}
      className="scroll-mt-32 overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex min-h-8 items-center px-6 pt-6 pb-3">
        <h2
          id={titleId}
          data-slot="section-card-title"
          className="inline text-lg leading-snug font-semibold"
        >
          Lucrătorii și accesul la portal
        </h2>
        <HelpLink
          topic="portal.lucratori"
          label="Ajutor: Lucrătorii și accesul la portal"
          className="ml-1"
        />
      </div>
      {unfilteredTotal === 0 && !narrowed && employees.isSuccess ? (
        <ListEmpty className="border-t">
          <NoWorkers clientId={clientId} readOnly={readOnly} />
        </ListEmpty>
      ) : (
        <>
          {chosen.size > 0 && !readOnly ? (
            <div
              role="region"
              aria-label="Lucrători aleși"
              data-testid="portal-selection"
              className="flex min-h-17 flex-wrap items-center gap-x-4 gap-y-2 border-y border-success-border bg-success px-6 py-3"
            >
              <p aria-live="polite" className="text-sm">
                <b className="text-[15px] font-semibold tabular-nums">
                  {countOf(chosen.size, 'lucrător ales', 'lucrători aleși')}
                </b>
              </p>
              <Button
                variant="link"
                className="h-auto p-0 text-foreground underline"
                data-testid="portal-clear-selection"
                onClick={roster.clearChoice}
              >
                Deselectează tot
              </Button>
              <Button
                className="w-full sm:ml-auto sm:w-auto"
                data-testid="portal-invite-chosen"
                disabled={openingBatch}
                onClick={onInviteChosen}
              >
                <Send aria-hidden="true" />
                Invită selectați ({chosen.size})
              </Button>
              {roster.capped && (
                <p data-testid="portal-selection-capped" className="w-full text-sm">
                  Se aleg odată cel mult {workerNoun(employeeInviteesLimit)}, primii după nume.
                  Invită-i, apoi alege-i pe ceilalți.
                </p>
              )}
            </div>
          ) : (
            <ListCardHeader data-testid="portal-roster-toolbar" className="px-6 pt-0">
              <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-2xl md:grow">
                <SearchInput
                  value={q}
                  onSearch={(next) => void roster.changeSearch({ q: next || undefined })}
                  placeholder={phone ? 'Caută lucrători' : 'Caută după nume sau marcă'}
                  label="Caută lucrători"
                  testId="portal-roster-search"
                />
                <ListFilters
                  facets={facets}
                  values={roster.filters}
                  onChange={roster.changeFilters}
                  total={
                    employees.isSuccess && !employees.isPlaceholderData ? meta.total : undefined
                  }
                  applyLabel={(pending) => (
                    <PendingLabel
                      clientId={clientId}
                      params={{
                        ...params,
                        page: 1,
                        pageSize: 1,
                        ...(listFilters.searchOf(pending) as RosterFilters),
                      }}
                    />
                  )}
                  countLabel={workerNoun}
                  testId="portal-roster-filters"
                />
              </div>
              <ListActions
                count={
                  employees.isSuccess && (
                    <ListCount testId="portal-roster-count">
                      {narrowed ? (
                        <WorkersCount
                          total={meta.total}
                          unfilteredTotal={unfilteredTotal}
                          narrowed
                          short={phone}
                        />
                      ) : (
                        accessTotal !== undefined && accessCount(accessTotal, unfilteredTotal)
                      )}
                    </ListCount>
                  )
                }
              >
                {!readOnly && !gettingStarted && (
                  <Button
                    data-testid="portal-invite-uninvited"
                    disabled={roster.choosing}
                    onClick={() => void roster.chooseUninvited()}
                  >
                    <Send aria-hidden="true" />
                    Invită lucrători
                  </Button>
                )}
              </ListActions>
            </ListCardHeader>
          )}
          {roster.chooseOutcome === 'failed' && (
            <div className="border-t px-6 py-3">
              <Notice variant="destructive" data-testid="portal-choose-error">
                Nu am putut alege lucrătorii fără invitație. Încearcă din nou.
              </Notice>
            </div>
          )}
          {roster.chooseOutcome === 'nobody' && (
            <div className="border-t px-6 py-3">
              <Notice variant="info" data-testid="portal-choose-nobody">
                Toți lucrătorii au deja acces sau o invitație. Cei cu invitația expirată sau cu
                accesul revocat au Retrimite sau Invită pe rândul lor.
              </Notice>
            </div>
          )}
          {message && (
            <div className="border-t px-6 py-3">
              <Notice variant={message.variant} data-testid="portal-roster-message">
                {message.text}
              </Notice>
            </div>
          )}
          <AppliedFilters
            facets={facets}
            values={roster.filters}
            onChange={roster.changeFilters}
            testId="portal-roster-applied-filters"
          />
          <DataTable
            testId="portal-roster-table"
            rowTestId="portal-roster-row"
            label="Lucrătorii și accesul la portal"
            columns={columns}
            data={employees.data?.items}
            rowKey={(row) => row.id}
            selection={
              readOnly
                ? undefined
                : {
                    state: (row) => chosen.has(row.id),
                    onChange: roster.choose,
                    label: (row) => `Alege ${formatEmployeeName(row)}`,
                    pageLabel: 'Alege toți lucrătorii din pagină',
                    testId: 'portal-roster-select',
                  }
            }
            meta={meta}
            noun={['lucrător', 'lucrători']}
            status={listStatus}
            isFetching={employees.isFetching}
            isPlaceholderData={employees.isPlaceholderData}
            sort={{ sort: roster.sort, order: roster.order }}
            onSortChange={(next) =>
              void roster.changeSearch({
                sort: next.sort === defaultSort.sort ? undefined : (next.sort as 'portal'),
                order: next.order === defaultSort.order ? undefined : next.order,
              })
            }
            onPageChange={(next) =>
              void roster.navigate({
                search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
                state: keepOpener,
              })
            }
            error={
              <WorkersListError
                error={employees.error}
                testId="portal-roster"
                notFound="Clientul nu mai există în organizația ta."
                onRetry={apiRequest.baseUrl ? () => void employees.refetch() : undefined}
                retrying={employees.isFetching}
              />
            }
            empty={
              <WorkersNoMatch
                former={false}
                filtered={listFilters.applied}
                q={q}
                testId="portal-roster-empty-filtered"
                onClear={() =>
                  listFilters.applied
                    ? roster.changeFilters({})
                    : void roster.changeSearch({ q: undefined })
                }
              />
            }
          />
        </>
      )}
    </section>
  );
}

function accessCount(withAccess: number, workers: number) {
  const of = `din ${workerNoun(workers)}`;
  return withAccess === 0 ? `Niciunul cu acces, ${of}` : `${withAccess} cu acces, ${of}`;
}

function PendingLabel({ clientId, params }: { clientId: string; params: ListEmployeesParams }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const total = useListEmployees(clientId, params, {
    request: apiRequest,
    query: { enabled: Boolean(apiRequest.baseUrl), placeholderData: keepPreviousData },
  }).data?.total;
  return pendingWorkersLabel(total);
}

export function NoWorkers({ clientId, readOnly }: { clientId: string; readOnly: boolean }) {
  return (
    <EmptyState
      icon={UsersRound}
      title="Clientul nu are încă lucrători"
      data-testid="portal-no-workers"
      actions={
        !readOnly && (
          <Button asChild data-testid="portal-add-workers">
            <Link to="/clienti/$clientId/angajati" params={{ clientId }}>
              <Plus aria-hidden="true" />
              Adaugă lucrători
            </Link>
          </Button>
        )
      }
    >
      {readOnly
        ? 'Clientul arhivat nu are lucrători actuali, deci nimeni de invitat în portal.'
        : 'Portalul e pentru lucrătorii clientului și pentru administratorul lui. Adaugă întâi lucrătorii, pe tabul Lucrători; apoi îi inviți de aici.'}
    </EmptyState>
  );
}
