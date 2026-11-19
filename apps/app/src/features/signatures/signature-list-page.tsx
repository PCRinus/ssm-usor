import {
  countOf,
  defaultPageSize,
  formatEmployeeName,
  type SignatureListFilters,
  type SignatureListSortKey,
  signatureListSubjects,
  SIGNING_SESSION_MAX_ITEMS,
  trainingDomainLabels,
  trainingDomains,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { keepPreviousData } from '@tanstack/react-query';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  Building2,
  FileText,
  GraduationCap,
  PenLine,
  SearchX,
  Signature,
  TriangleAlert,
} from 'lucide-react';
import { useState } from 'react';

import {
  getListMySignaturesQueryKey,
  getListMySignaturesQueryOptions,
  type ListMySignaturesParams,
  useListMySignatures,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import type { DataTableSort } from '@/components/data-table/columns';
import { DataTable } from '@/components/data-table/data-table';
import { EmptyState } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';
import { ListCardHeader, ListCount } from '@/components/list-card-header';
import { AppliedFilters } from '@/components/list-filters/applied-filters';
import { ListFilters } from '@/components/list-filters/list-filters';
import { PendingCountLabel } from '@/components/list-filters/pending-count-label';
import type { ListFilterFacet, ListFilterValues } from '@/components/list-filters/types';
import { listFilterSearch } from '@/components/list-filters/url';
import { useListSearch } from '@/components/list-filters/use-list-search';
import { Masked } from '@/components/replay';
import { SearchInput } from '@/components/search-input';
import { useEveryClient } from '@/features/employees/worker-filters';
import { WorkersListError } from '@/features/employees/workers-list';

import { AgreementWarning } from './agreement-warning';
import {
  rowName,
  signAsPhrase,
  signatureColumns,
  signatureNoun,
  workerNoun,
  workerTab,
} from './signature-list-columns';
import {
  choose,
  type Chosen,
  chosenState,
  forSigning,
  noneChosen,
  requestsOf,
  rowRequests,
  type SignatureRow,
  stillListed,
} from './signature-selection';
import { SigningDialog } from './signing-dialog';

const route = getRouteApi('/_authenticated/semnaturi');

const defaultSort: DataTableSort & { sort: SignatureListSortKey } = {
  sort: 'issuedAt',
  order: 'asc',
};

const filterKeys = [
  'client',
  'domain',
  'kind',
] as const satisfies readonly (keyof SignatureListFilters)[];

type FilterKey = (typeof filterKeys)[number];

const subjectLabels: Record<(typeof signatureListSubjects)[number], string> = {
  ...trainingPhaseLabels,
  test: 'Test',
};

function facetsOf(clients: readonly { id: string; name: string }[] | undefined) {
  return [
    {
      key: 'client',
      label: 'Client',
      icon: Building2,
      column: 'left',
      options: (clients ?? []).map((client) => ({ value: client.id, label: client.name })),
      search: { placeholder: 'Caută clientul', addLabel: 'Adaugă un client' },
      loading: clients === undefined,
    },
    {
      key: 'domain',
      label: 'Domeniu',
      icon: GraduationCap,
      column: 'left',
      options: trainingDomains.map((domain) => ({
        value: domain,
        label: trainingDomainLabels[domain],
      })),
    },
    {
      key: 'kind',
      label: 'Ce semnezi',
      icon: FileText,
      column: 'right',
      options: signatureListSubjects.map((subject) => ({
        value: subject,
        label: subjectLabels[subject],
      })),
    },
  ] satisfies ListFilterFacet<FilterKey>[];
}

const rowKey = (row: SignatureRow) => row.id;

function useSignatures(params: ListMySignaturesParams) {
  const { request, ready, key } = useApi();
  return useListMySignatures(params, {
    request,
    query: {
      queryKey: key(getListMySignaturesQueryKey(params)),
      enabled: ready,
      placeholderData: keepPreviousData,
    },
  });
}

function overLimitMessage(chosen: Chosen, rows: number) {
  const over = chosen.size - SIGNING_SESSION_MAX_ITEMS;
  const limit = `Cu un cod semnezi cel mult ${SIGNING_SESSION_MAX_ITEMS}.`;
  if (rows > 1) {
    return `${limit} Debifează ${signatureNoun(over)}, un rând întreg sau fișe dintr-un rând deschis; pe ele le semnezi apoi cu alt cod.`;
  }
  const perSheet = new Map<string, number>();
  for (const request of chosen.values()) {
    const sheet = `${request.rowId}:${request.employee.id}`;
    perSheet.set(sheet, (perSheet.get(sheet) ?? 0) + 1);
  }
  let sheets = 0;
  let freed = 0;
  for (const count of [...perSheet.values()].sort((a, b) => b - a)) {
    if (freed >= over) break;
    freed += count;
    sheets += 1;
  }
  return `${limit} Deschide rândul și debifează ${sheets === 1 ? 'o fișă; pe ea o semnezi' : `${countOf(sheets, 'fișă', 'fișe')}; pe ele le semnezi`} apoi cu alt cod.`;
}

export function SignatureListPage() {
  const search = route.useSearch();
  const { page = 1, sort = defaultSort.sort, order = defaultSort.order, q } = search;
  const navigate = route.useNavigate();
  const { request: apiRequest, ready, key } = useApi();
  const phone = useIsMobile();
  const clients = useEveryClient();
  const facets = facetsOf(clients.data);
  const listFilters = listFilterSearch({ keys: filterKeys, facets, search });
  const filters = listFilters.searchOf(listFilters.values) as SignatureListFilters;
  const filtered = listFilters.applied;
  const narrowed = filtered || Boolean(q);
  const params: ListMySignaturesParams = {
    page,
    pageSize: defaultPageSize,
    sort,
    order,
    ...(q ? { q } : {}),
    ...filters,
  };
  const signatures = useSignatures(params);
  const rows = signatures.data?.items;
  const meta = signatures.data ?? { page, pageSize: defaultPageSize, total: 0 };
  const unfilteredSignatures = signatures.data?.unfilteredSignatures ?? 0;
  const listStatus = !apiRequest.baseUrl ? 'error' : signatures.status;

  // What is chosen belongs to one search: a new filter or search starts from nothing chosen, so
  // nothing hidden is signed.
  const scope = JSON.stringify({ q, ...filters });
  const [selection, setSelection] = useState<{ scope: string; chosen: Chosen }>({
    scope,
    chosen: noneChosen,
  });
  const kept = selection.scope === scope ? selection.chosen : noneChosen;
  const chosen = stillListed(kept, rows);
  // Kept in the state, not only hidden: a pruned request must not come back on another page,
  // nor an earlier search's choice when its filters come back.
  if (selection.scope !== scope || chosen !== selection.chosen) {
    setSelection({ scope, chosen });
  }
  const update = (change: (current: Chosen) => Chosen) =>
    setSelection((current) => ({
      scope,
      chosen: stillListed(change(current.scope === scope ? current.chosen : noneChosen), rows),
    }));
  const chosenRows = new Set([...chosen.values()].map((request) => request.rowId)).size;
  const overLimit = chosen.size > SIGNING_SESSION_MAX_ITEMS;
  const [signing, setSigning] = useState(false);
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set());

  const { changeQuery, changeFilters, onSortChange, onPageChange } = useListSearch({
    search,
    navigate,
    defaultSort,
    searchOf: (values: ListFilterValues<FilterKey>) =>
      listFilters.searchOf(values) as SignatureListFilters,
  });
  const pendingQuery = (pending: ListFilterValues<FilterKey>) => {
    const counted: ListMySignaturesParams = {
      ...params,
      ...(listFilters.searchOf(pending) as SignatureListFilters),
      page: 1,
      pageSize: 1,
    };
    return getListMySignaturesQueryOptions(counted, {
      request: apiRequest,
      query: {
        queryKey: key(getListMySignaturesQueryKey(counted)),
        enabled: ready,
      },
    });
  };
  const toggleOpen = (row: SignatureRow) =>
    setOpened((current) => {
      const next = new Set(current);
      if (!next.delete(row.id)) next.add(row.id);
      return next;
    });
  const showToolbar = signatures.isSuccess && (unfilteredSignatures > 0 || narrowed);

  return (
    <div data-testid="signatures-page" className="space-y-7">
      <div className="flex items-center gap-1.5">
        <h1 className="text-3xl font-semibold tracking-tight">Semnături</h1>
        <HelpLink topic="semnaturi.lista" label="Ajutor: Semnături" />
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        {chosen.size > 0 ? (
          <div
            role="region"
            aria-label="Rânduri alese"
            data-testid="signatures-selection"
            className="flex min-h-17 flex-wrap items-center gap-x-4 gap-y-2 border-b border-success-border bg-success px-5 py-3"
          >
            <p aria-live="polite" className="text-sm">
              <b className="text-[15px] font-semibold tabular-nums">
                {signatureNoun(chosen.size)} {chosen.size === 1 ? 'aleasă' : 'alese'}
              </b>{' '}
              <span className="text-muted-foreground">
                {chosenRows === 1
                  ? 'dintr-un rând'
                  : `din ${countOf(chosenRows, 'rând', 'rânduri')}`}
              </span>
            </p>
            <Button
              variant="link"
              className="h-auto p-0 text-foreground underline"
              data-testid="signatures-clear-selection"
              onClick={() => update(() => noneChosen)}
            >
              Deselectează tot
            </Button>
            <Button
              className="h-11 w-full sm:ml-auto sm:w-auto"
              data-testid="signatures-sign"
              disabled={overLimit}
              aria-describedby={overLimit ? 'signatures-limit' : undefined}
              onClick={() => setSigning(true)}
            >
              <PenLine aria-hidden="true" />
              Semnează ({chosen.size})
            </Button>
            {overLimit && (
              <p
                id="signatures-limit"
                data-testid="signatures-limit"
                className="flex w-full items-start gap-2 text-sm font-medium text-warning-foreground"
              >
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {overLimitMessage(chosen, chosenRows)}
              </p>
            )}
          </div>
        ) : (
          showToolbar && (
            <ListCardHeader>
              <div className="order-last flex w-full gap-2 md:order-none md:w-auto md:max-w-xl md:grow">
                <SearchInput
                  value={q}
                  onSearch={changeQuery}
                  placeholder={phone ? 'Caută un nume' : 'Caută după numele unui lucrător'}
                  label="Caută după numele unui lucrător"
                  testId="signatures-search"
                />
                <ListFilters
                  facets={facets}
                  values={listFilters.values}
                  onChange={changeFilters}
                  total={
                    signatures.isSuccess && !signatures.isPlaceholderData
                      ? signatures.data.signatures
                      : undefined
                  }
                  applyLabel={(pending) => (
                    <PendingCountLabel
                      query={pendingQuery(pending)}
                      count={(data) => data.signatures}
                      noun={signatureNoun}
                    />
                  )}
                  countLabel={signatureNoun}
                  testId="signatures-filters"
                />
              </div>
              <ListCount testId="signatures-count">
                {narrowed ? (
                  <>
                    <b className="font-semibold text-foreground">{signatures.data.signatures}</b>{' '}
                    din {phone ? unfilteredSignatures : signatureNoun(unfilteredSignatures)}
                  </>
                ) : (
                  signatureNoun(signatures.data.signatures)
                )}
              </ListCount>
            </ListCardHeader>
          )
        )}
        <AppliedFilters
          facets={facets}
          values={listFilters.values}
          onChange={changeFilters}
          testId="signatures-applied-filters"
        />
        <DataTable
          testId="signatures-table"
          rowTestId="signatures-row"
          label="Ce ai de semnat"
          columns={signatureColumns}
          data={rows}
          rowKey={rowKey}
          selection={{
            state: (row) => chosenState(chosen, rowRequests(row)),
            onChange: (changed, on) =>
              update((current) => choose(current, changed.flatMap(rowRequests), on)),
            label: (row) => `Alege ${rowName(row)}, ${row.client.name}`,
            pageLabel: 'Alege toate rândurile din pagină',
            testId: 'signatures-select',
          }}
          expansion={{
            canExpand: (row) => row.workers.length > 1,
            isOpen: (row) => opened.has(row.id),
            onToggle: toggleOpen,
            label: (row) => `Lucrătorii din ${rowName(row)}`,
            testId: 'signatures-open',
            render: (row) => (
              <SignatureWorkers
                row={row}
                chosen={chosen}
                onChange={(requests, on) => update((current) => choose(current, requests, on))}
              />
            ),
          }}
          meta={meta}
          noun={['rând', 'rânduri']}
          status={listStatus}
          isFetching={signatures.isFetching}
          isPlaceholderData={signatures.isPlaceholderData}
          sort={{ sort, order }}
          onSortChange={onSortChange}
          onPageChange={onPageChange}
          error={
            <WorkersListError
              error={signatures.error}
              testId="signatures"
              onRetry={apiRequest.baseUrl ? () => void signatures.refetch() : undefined}
              retrying={signatures.isFetching}
              message="Nu am putut încărca ce ai de semnat. Încearcă din nou."
            />
          }
          empty={
            narrowed ? (
              <EmptyState
                icon={SearchX}
                title="Nimic de semnat nu se potrivește"
                data-testid="signatures-empty-filtered"
                actions={
                  <Button
                    variant="outline"
                    data-testid="signatures-empty-filtered-clear"
                    onClick={() => (filtered ? changeFilters({}) : changeQuery(undefined))}
                  >
                    {filtered ? 'Șterge filtrele' : 'Șterge căutarea'}
                  </Button>
                }
              >
                {filtered
                  ? `Niciun rând nu se potrivește filtrelor alese${q ? ' și căutării' : ''}. Scoate unul dintre filtrele de mai sus sau pornește din nou de la tot ce ai de semnat.`
                  : `Niciun lucrător nu se potrivește căutării „${q}”. Caută după numele unui lucrător.`}
              </EmptyState>
            ) : (
              <EmptyState
                icon={Signature}
                title="Nu ai nimic de semnat"
                data-testid="signatures-empty"
              >
                Când înregistrezi o instruire sau o fișă de test și te alegi semnatar, rândul ei
                apare aici.
              </EmptyState>
            )
          }
        />
      </div>
      <SigningDialog
        requests={forSigning(chosen)}
        open={signing}
        onClose={() => setSigning(false)}
        onGone={(ids) =>
          update((current) =>
            choose(
              current,
              ids.map((id) => current.get(id)).filter((request) => request !== undefined),
              false
            )
          )
        }
      />
    </div>
  );
}

function SignatureWorkers({
  row,
  chosen,
  onChange,
}: {
  row: SignatureRow;
  chosen: Chosen;
  onChange: (requests: ReturnType<typeof requestsOf>, on: boolean) => void;
}) {
  const picked = row.workers.filter(
    (worker) => chosenState(chosen, worker.requests) === true
  ).length;
  return (
    <div data-testid="signatures-row-workers">
      <h3 className="mb-1 text-[13px] font-semibold text-section-tab-foreground">
        Semnezi {signAsPhrase(row.slots)} pe fișele a {workerNoun(row.workers.length)}
        {picked > 0 && ` · ${picked === 1 ? 'una aleasă' : `${picked} alese`}`}
      </h3>
      <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
        {row.workers.map((worker) => {
          const name = formatEmployeeName(worker.employee);
          const requests = requestsOf(row, worker);
          const state = chosenState(chosen, requests);
          return (
            <li
              key={worker.employee.id}
              data-testid="signatures-worker"
              className="flex min-w-0 items-start gap-2.5 border-b border-section-tab py-2"
            >
              <Checkbox
                className="mt-0.5"
                aria-label={`Alege ${row.phase ? 'instruirea' : 'fișa de test a'} lui ${name}`}
                data-testid="signatures-worker-select"
                checked={state}
                onCheckedChange={() => onChange(requests, state !== true)}
              />
              <span className="flex min-w-0 flex-col items-start gap-1.5">
                <Link
                  {...workerTab(row, worker)}
                  className="font-medium break-words hover:underline"
                >
                  <Masked>{name}</Masked>
                </Link>
                <AgreementWarning agreement={worker.agreement} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
