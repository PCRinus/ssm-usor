import {
  type ClientEmployeeListItem,
  defaultPageSize,
  type ImportInvitee,
  type PortalAccessState,
} from '@ssm-usor/contracts';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, useRouteContext } from '@tanstack/react-router';
import { Briefcase, KeyRound, MapPin } from 'lucide-react';
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
import { keepOpener } from '@/app/opener';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';

import { portalAccessLabels } from './portal-access-format';
import type { RosterRow } from './portal-roster-columns';

const portalRoute = getRouteApi('/_authenticated/clienti/$clientId/portal');

const rosterFilterKeys = ['portal', 'jobPosition', 'workplace'] as const;
export type RosterFilterKey = (typeof rosterFilterKeys)[number];
export type RosterFilters = Pick<ListEmployeesParams, RosterFilterKey>;

const defaultSort = { sort: 'name', order: 'asc' } as const;

type Named = { id: string; name: string };

const accessOrder: PortalAccessState[] = ['active', 'invited', 'expired', 'none', 'revoked'];

function rosterFacets({
  positions,
  workplaces,
  withWorkplaces,
}: {
  positions: readonly Named[] | undefined;
  workplaces: readonly Named[] | undefined;
  withWorkplaces: boolean;
}): ListFilterFacet<RosterFilterKey>[] {
  const named = (items: readonly Named[]) =>
    items.map((item) => ({ value: item.id, label: item.name }));
  return [
    {
      key: 'portal',
      label: 'Acces la portal',
      icon: KeyRound,
      column: 'left',
      options: accessOrder.map((state) => ({ value: state, label: portalAccessLabels[state] })),
    },
    {
      key: 'jobPosition',
      label: 'Post de lucru',
      icon: Briefcase,
      column: 'right',
      options: named(positions ?? []),
      search: { placeholder: 'Caută postul', addLabel: 'Adaugă un post' },
      loading: positions === undefined,
    },
    ...(withWorkplaces
      ? [
          {
            key: 'workplace',
            label: 'Punct de lucru',
            icon: MapPin,
            column: 'right',
            options: named(workplaces ?? []),
            loading: workplaces === undefined,
          } as const,
        ]
      : []),
  ];
}

export const inviteeOf = (row: ClientEmployeeListItem): ImportInvitee => ({
  employeeId: row.id,
  lastName: row.lastName,
  firstName: row.firstName,
  position: row.jobPosition.name,
  email: row.email,
  phone: row.phone,
  current: true,
  portal:
    row.portal.state === 'active'
      ? 'participant'
      : row.portal.state === 'invited'
        ? 'invited'
        : null,
});

export type Chosen = ReadonlyMap<string, ImportInvitee>;
const noneChosen: Chosen = new Map();

// A choice belongs to one search and one set of filters, as on Semnături, so nothing hidden is
// invited; unlike there, it spans the pages.
export function usePortalRoster(clientId: string, userId: string) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const search = portalRoute.useSearch();
  const navigate = portalRoute.useNavigate();
  const { page = 1, q, order = defaultSort.order } = search;
  const sort = search.sort ?? defaultSort.sort;
  const enabled = Boolean(userId && apiRequest.baseUrl);
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled },
  });
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId], enabled },
  });
  const workplaceCount = workplaces.data?.items.length ?? 0;
  const facets = useMemo(
    () =>
      rosterFacets({
        positions: positions.isError ? [] : positions.data?.items,
        workplaces: workplaces.isError ? [] : workplaces.data?.items,
        withWorkplaces: workplaceCount > 1 || (workplaces.isPending && Boolean(search.workplace)),
      }),
    [
      positions.data,
      positions.isError,
      workplaces.data,
      workplaces.isError,
      workplaceCount,
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
    request: apiRequest,
    query: {
      queryKey: [...getListEmployeesQueryKey(clientId, params), userId],
      enabled,
      placeholderData: keepPreviousData,
    },
  });
  const accessParams: ListEmployeesParams = { portal: ['active'], page: 1, pageSize: 1 };
  const withAccess = useListEmployees(clientId, accessParams, {
    request: apiRequest,
    query: { queryKey: [...getListEmployeesQueryKey(clientId, accessParams), userId], enabled },
  });

  const scopeOf = (values: RosterFilters, text: string | undefined) =>
    JSON.stringify({ q: text, ...values });
  const scope = scopeOf(filters, q);
  const [selection, setSelection] = useState<{ scope: string; chosen: Chosen; capped: boolean }>({
    scope,
    chosen: noneChosen,
    capped: false,
  });
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

  const changeSearch = (next: Partial<typeof search>) =>
    navigate({
      state: keepOpener,
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined }),
    });
  const changeFilters = (values: ListFilterValues<RosterFilterKey>) =>
    void changeSearch(listFilters.searchOf(values) as RosterFilters);

  const [choosing, setChoosing] = useState(false);
  const [chooseFailed, setChooseFailed] = useState(false);
  async function chooseUninvited() {
    const next = listFilters.searchOf({ ...listFilters.values, portal: ['none'] }) as RosterFilters;
    setChoosing(true);
    setChooseFailed(false);
    try {
      await changeSearch(next);
      const inviteesParams = { ...(q ? { q } : {}), ...next };
      const answer = await queryClient.fetchQuery({
        queryKey: [...getListEmployeeInviteesQueryKey(clientId, inviteesParams), userId],
        queryFn: ({ signal }) =>
          listEmployeeInvitees(clientId, inviteesParams, { ...apiRequest, signal }),
        staleTime: 0,
      });
      setSelection({
        scope: scopeOf(next, q),
        chosen: new Map(answer.items.map((item) => [item.employeeId, item])),
        capped: answer.total > answer.items.length,
      });
    } catch {
      setChooseFailed(true);
    } finally {
      setChoosing(false);
    }
  }

  return {
    search,
    navigate,
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
    changeSearch,
    changeFilters,
    chooseUninvited,
    choosing,
    chooseFailed,
  };
}

export type PortalRosterState = ReturnType<typeof usePortalRoster>;
