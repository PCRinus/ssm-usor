import {
  type ClientEmployeeListItem,
  defaultPageSize,
  type ImportInvitee,
  portalAccessStates,
  portalStandingOf,
} from '@ssm-usor/contracts';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { KeyRound } from 'lucide-react';
import { useMemo, useState } from 'react';

import {
  getListEmployeeInviteesQueryKey,
  getListEmployeesQueryKey,
  getListJobPositionsQueryKey,
  getListWorkplacesQueryKey,
  listEmployeeInvitees,
  type ListEmployeesParams,
  useListEmployees,
  useListJobPositions,
  useListWorkplaces,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { keepOpener } from '@/app/opener';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { clientPlaceFacets, workplacePlaces } from '@/features/employees/worker-filters';

import { portalAccessLabels } from './portal-access-format';
import type { RosterRow } from './portal-roster-columns';

const portalRoute = getRouteApi('/_authenticated/clienti/$clientId/portal');

const rosterFilterKeys = ['portal', 'jobPosition', 'workplace'] as const;
export type RosterFilterKey = (typeof rosterFilterKeys)[number];
export type RosterFilters = Pick<ListEmployeesParams, RosterFilterKey>;

export const defaultSort = { sort: 'name', order: 'asc' } as const;

function rosterFacets(places: Parameters<typeof clientPlaceFacets>[0]) {
  const portal: ListFilterFacet<RosterFilterKey> = {
    key: 'portal',
    label: 'Acces la portal',
    icon: KeyRound,
    column: 'left',
    options: portalAccessStates.map((state) => ({
      value: state,
      label: portalAccessLabels[state],
    })),
  };
  return [portal, ...clientPlaceFacets(places)] as ListFilterFacet<RosterFilterKey>[];
}

export const inviteeOf = (row: ClientEmployeeListItem): ImportInvitee => ({
  employeeId: row.id,
  lastName: row.lastName,
  firstName: row.firstName,
  position: row.jobPosition.name,
  email: row.email,
  phone: row.phone,
  current: true,
  portal: portalStandingOf(row.portal.state),
});

export type Chosen = ReadonlyMap<string, ImportInvitee>;
const noneChosen: Chosen = new Map();

// A choice belongs to one search and one set of filters, as on Semnături, so nothing hidden is
// invited; unlike there, it spans the pages.
export function usePortalRoster(clientId: string) {
  const { request, queryClient, ready, key } = useApi();
  const search = portalRoute.useSearch();
  const navigate = portalRoute.useNavigate();
  const { page = 1, q, order = defaultSort.order } = search;
  const sort = search.sort ?? defaultSort.sort;
  const enabled = ready;
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)), enabled },
  });
  const workplaces = useListWorkplaces(clientId, {
    request,
    query: { queryKey: key(getListWorkplacesQueryKey(clientId)), enabled },
  });
  const facets = useMemo(
    () =>
      rosterFacets({
        positions: positions.isError ? [] : positions.data?.items,
        ...workplacePlaces(
          { isPending: workplaces.isPending, isError: workplaces.isError, data: workplaces.data },
          Boolean(search.workplace)
        ),
      }),
    [
      positions.data,
      positions.isError,
      workplaces.data,
      workplaces.isError,
      workplaces.isPending,
      search.workplace,
    ]
  );
  const listFilters = listFilterSearch({ keys: rosterFilterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as RosterFilters;
  const narrowed = listFilters.applied || Boolean(q);
  const params: ListEmployeesParams = {
    ...(q ? { q } : {}),
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...filters,
  };
  const employees = useListEmployees(clientId, params, {
    request,
    query: {
      queryKey: key(getListEmployeesQueryKey(clientId, params)),
      enabled,
      placeholderData: keepPreviousData,
    },
  });
  const accessParams: ListEmployeesParams = { portal: ['active'], page: 1, pageSize: 1 };
  const withAccess = useListEmployees(clientId, accessParams, {
    request,
    query: { queryKey: key(getListEmployeesQueryKey(clientId, accessParams)), enabled },
  });

  const scopeOf = (values: RosterFilters, text: string | undefined) =>
    JSON.stringify({ q: text, ...values });
  const scope = scopeOf(filters, q);
  const [selection, setSelection] = useState<{ scope: string; chosen: Chosen; capped: boolean }>({
    scope,
    chosen: noneChosen,
    capped: false,
  });
  // Dropped, not only hidden, so an earlier search's choice does not return with its filters.
  if (selection.scope !== scope) setSelection({ scope, chosen: noneChosen, capped: false });
  // A worker invited meanwhile, from their row or by a colleague, leaves the choice once the list
  // shows it, so that the batch does not invite them again.
  const taken = (employees.data?.items ?? []).filter(
    (row) => selection.chosen.has(row.id) && portalStandingOf(row.portal.state) !== null
  );
  if (selection.scope === scope && taken.length > 0) {
    const kept = new Map(selection.chosen);
    for (const row of taken) kept.delete(row.id);
    setSelection({ ...selection, chosen: kept });
  }
  const chosen = selection.scope === scope ? selection.chosen : noneChosen;
  const capped = selection.scope === scope && selection.capped;
  const choose = (rows: RosterRow[], on: boolean) =>
    setSelection((current) => {
      const next = new Map(current.scope === scope ? current.chosen : noneChosen);
      for (const row of rows) {
        if (on) next.set(row.id, inviteeOf(row));
        else next.delete(row.id);
      }
      return { scope, chosen: next, capped: current.scope === scope && current.capped };
    });
  const clearChoice = () => setSelection({ scope, chosen: noneChosen, capped: false });

  const listSearch = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<RosterFilterKey>) =>
      listFilters.searchOf(values) as RosterFilters,
    state: keepOpener,
  });
  const { changeSearch } = listSearch;

  const [choosing, setChoosing] = useState(false);
  const [chooseOutcome, setChooseOutcome] = useState<'failed' | 'nobody' | null>(null);
  const readInvitees = (values: RosterFilters) => {
    const inviteesParams = { ...(q ? { q } : {}), ...values };
    return queryClient.fetchQuery({
      queryKey: key(getListEmployeeInviteesQueryKey(clientId, inviteesParams)),
      queryFn: ({ signal }) =>
        listEmployeeInvitees(clientId, inviteesParams, { ...request, signal }),
      staleTime: 0,
    });
  };

  async function chooseUninvited() {
    const next = listFilters.searchOf({ ...listFilters.values, portal: ['none'] }) as RosterFilters;
    setChoosing(true);
    setChooseOutcome(null);
    try {
      const answer = await readInvitees(next);
      if (answer.items.length === 0) {
        setChooseOutcome('nobody');
        return;
      }
      await changeSearch(next);
      setSelection({
        scope: scopeOf(next, q),
        chosen: new Map(answer.items.map((item) => [item.employeeId, item])),
        capped: answer.total > answer.items.length,
      });
    } catch {
      setChooseOutcome('failed');
    } finally {
      setChoosing(false);
    }
  }

  // The standing is read again as the batch opens: a choice may have waited on other pages while
  // someone was invited.
  async function freshChoice() {
    const answer = await readInvitees(filters);
    const now = new Map(answer.items.map((item) => [item.employeeId, item]));
    return [...chosen.keys()].flatMap((id) => {
      const current = now.get(id) ?? chosen.get(id);
      return current ? [current] : [];
    });
  }

  return {
    search,
    q,
    sort,
    order,
    params,
    facets,
    listFilters,
    filters,
    narrowed,
    employees,
    withAccess,
    chosen,
    capped,
    choose,
    clearChoice,
    ...listSearch,
    chooseUninvited,
    choosing,
    chooseOutcome,
    freshChoice,
  };
}

export type PortalRosterState = ReturnType<typeof usePortalRoster>;
