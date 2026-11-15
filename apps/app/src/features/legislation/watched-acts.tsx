import { Button } from '@ssm-usor/ui/components/button';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { getRouteApi } from '@tanstack/react-router';
import { ScrollText, SearchX } from 'lucide-react';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { EmptyState, ListEmpty } from '@/components/empty-state';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import type { ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { SearchInput } from '@/components/search-input';

import { useLegalActs } from './use-legal-acts';
import { watchedActColumns } from './watched-act-columns';
import {
  actNoun,
  pageOf,
  shownWatchedActs,
  tableSort,
  type WatchedAct,
  watchedActFacets,
  type WatchedActFilterKey,
  watchedActFilterKeys,
  type WatchedActListSearch,
  watchedActPageSize,
  type WatchedActSortKey,
} from './watched-act-list';

const route = getRouteApi('/_authenticated/legislatie/acte');

const rowKey = (act: WatchedAct) => act.id;

export function WatchedActs({ userId }: { userId: string }) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const phone = useIsMobile();
  const acts = useLegalActs(userId);
  const all = acts.data?.items;
  const facets = useMemo(() => watchedActFacets(all), [all]);
  const listFilters = listFilterSearch({ keys: watchedActFilterKeys, facets, search });
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(search.q);
  const shown = useMemo(() => (all ? shownWatchedActs(all, search) : undefined), [all, search]);
  const page = search.page ?? 1;
  const total = all?.length ?? 0;

  const changeSearch = (next: Partial<WatchedActListSearch>) =>
    void navigate({
      replace: true,
      resetScroll: false,
      search: (prev) => ({ ...prev, ...next, page: undefined }),
    });
  const changeFilters = (values: ListFilterValues<WatchedActFilterKey>) =>
    changeSearch(listFilters.searchOf(values) as Partial<WatchedActListSearch>);

  return (
    <section aria-label="Acte urmărite" className="grid gap-4">
      <div className="overflow-hidden rounded-lg border bg-card">
        {acts.isSuccess && total === 0 ? (
          <ListEmpty>
            <EmptyState
              icon={ScrollText}
              title="Niciun act urmărit încă"
              data-testid="watched-acts-empty"
            >
              Actele normative citate de documente apar aici după prima verificare pe Portalul
              Legislativ.
            </EmptyState>
          </ListEmpty>
        ) : (
          <>
            {acts.isSuccess && (
              <>
                <ListCardHeader>
                  <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-2xl md:grow">
                    <SearchInput
                      value={search.q}
                      onSearch={(next) => changeSearch({ q: next || undefined })}
                      placeholder={phone ? 'Caută acte' : 'Caută după număr sau titlu'}
                      label="Caută după numărul sau titlul actului"
                      testId="watched-acts-search"
                    />
                    <ListFilters
                      facets={facets}
                      values={listFilters.values}
                      onChange={changeFilters}
                      total={shown?.length}
                      applyLabel={(pending) =>
                        `Arată ${actNoun(
                          shownWatchedActs(all ?? [], {
                            q: search.q,
                            ...(listFilters.searchOf(pending) as Partial<WatchedActListSearch>),
                          }).length
                        )}`
                      }
                      countLabel={actNoun}
                      testId="watched-acts-filters"
                    />
                  </div>
                  <ListCount testId="watched-acts-count">
                    {narrowed ? (
                      <>
                        <b className="font-semibold text-foreground">{shown?.length ?? 0}</b> din{' '}
                        {phone ? total : `${actNoun(total)}`}
                      </>
                    ) : (
                      actNoun(total)
                    )}
                  </ListCount>
                </ListCardHeader>
                <AppliedFilters
                  facets={facets}
                  values={listFilters.values}
                  onChange={changeFilters}
                  testId="watched-acts-applied-filters"
                />
              </>
            )}
            <DataTable
              testId="watched-acts"
              rowTestId="watched-act"
              label="Acte urmărite"
              columns={watchedActColumns}
              data={shown && pageOf(shown, page)}
              rowKey={rowKey}
              meta={{ page, pageSize: watchedActPageSize, total: shown?.length ?? 0 }}
              noun={['act', 'acte']}
              status={acts.status}
              isFetching={acts.isFetching}
              sort={tableSort(search)}
              onSortChange={(next) =>
                changeSearch({
                  sort: next.sort as WatchedActSortKey,
                  order: next.order === 'asc' ? undefined : next.order,
                })
              }
              onPageChange={(next) =>
                void navigate({
                  search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }),
                })
              }
              error={
                <>
                  <p role="alert" className="text-sm">
                    Nu am putut încărca actele urmărite.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    disabled={acts.isFetching}
                    onClick={() => void acts.refetch()}
                  >
                    Încearcă din nou
                  </Button>
                </>
              }
              empty={
                <EmptyState
                  icon={SearchX}
                  title="Niciun act nu se potrivește"
                  data-testid="watched-acts-empty-filtered"
                  actions={
                    <Button
                      variant="outline"
                      data-testid="watched-acts-empty-clear"
                      onClick={
                        filtered ? () => changeFilters({}) : () => changeSearch({ q: undefined })
                      }
                    >
                      {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                    </Button>
                  }
                >
                  {filtered
                    ? `Niciun act urmărit nu se potrivește filtrelor alese${search.q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau șterge-le pe toate.`
                    : `Niciun act urmărit nu se potrivește căutării „${search.q}”. Caută după număr, nume sau subiect.`}
                </EmptyState>
              }
            />
          </>
        )}
      </div>
    </section>
  );
}
