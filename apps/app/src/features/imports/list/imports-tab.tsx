import { defaultPageSize, formatCount, type ImportKind } from '@ssm-usor/contracts';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { CircleCheck, ScanText, Sparkles, UsersRound } from 'lucide-react';
import { useMemo } from 'react';

import { EmptyState, ListEmpty } from '@/components/empty-state';
import {
  FilterTab,
  FilterTabs,
  ListActions,
  ListCardHeader,
  ListCount,
} from '@/components/list-card-header';

import { openCount, openImportsOf } from '../open-imports';
import { WayBadge, wayClass } from '../start-ways';
import { useCreditsBalance } from '../use-credits-balance';
import { useMyImports } from '../use-my-imports';
import { ClosedImportsTable } from './closed-imports-table';
import { importTabOf } from './import-sections';
import { CreditsAvailable } from './imports-credits';
import type { ImportsSearch } from './imports-search';
import { NewImportButton } from './new-import-button';
import { OpenImportsList } from './open-imports-list';
import { useActiveClients } from './use-active-clients';
import { closedCountLabel, useClosedImports, useClosedTotal } from './use-closed-imports';
import { type NewImportWay, useNewImport } from './use-new-import';

const toggles = [
  { status: undefined, label: 'Deschise', testId: 'imports-filter-open' },
  { status: 'closed', label: 'Încheiate', testId: 'imports-filter-closed' },
] as const;

const openLabel = (count: number) => (count === 1 ? '1 deschis' : `${formatCount(count)} deschise`);

export function ImportsTab({ kind, search }: { kind: ImportKind; search: ImportsSearch }) {
  const { status, page = 1 } = search;
  const closed = status === 'closed';
  const path = importTabOf(kind);
  const navigate = useNavigate({ from: path });
  const { items } = useMyImports();
  const groups = useMemo(() => (items ? openImportsOf(items, kind) : null), [items, kind]);
  const closedTotal = useClosedTotal(kind);
  const otherClosedTotal = useClosedTotal(kind === 'client' ? 'employees' : 'client');
  const closedPage = useClosedImports({ kind, page, pageSize: defaultPageSize }, closed);
  const { start, dialogs } = useNewImport();
  const open = groups ? openCount(groups) : 0;
  const never = groups !== null && open === 0 && closedTotal === 0;
  const accountNever = never && items?.length === 0 && otherClosedTotal === 0;

  if (never && !closed) {
    return (
      <div data-testid={`imports-tab-${kind}`}>
        <FirstImport kind={kind} accountNever={accountNever} onStart={start} />
        {dialogs}
      </div>
    );
  }

  return (
    <div data-testid={`imports-tab-${kind}`}>
      <ListCardHeader data-testid="imports-toolbar">
        <FilterTabs label="Filtrează importurile">
          {toggles.map((toggle) => (
            <FilterTab
              key={toggle.label}
              to={path}
              search={toggle.status ? { status: toggle.status } : {}}
              data-testid={toggle.testId}
              active={toggle.status === status}
              replace
              resetScroll={false}
            >
              {toggle.label}
            </FilterTab>
          ))}
        </FilterTabs>
        <ListActions
          count={
            closed
              ? closedPage.isSuccess && (
                  <ListCount testId="imports-count">
                    {closedCountLabel(closedPage.data.total)}
                  </ListCount>
                )
              : groups && <ListCount testId="imports-count">{openLabel(open)}</ListCount>
          }
        >
          {!closed && <NewImportButton kind={kind} onStart={start} />}
        </ListActions>
      </ListCardHeader>
      {closed ? (
        <ClosedImportsTable
          kind={kind}
          page={page}
          onPageChange={(next) =>
            void navigate({ search: (prev) => ({ ...prev, page: next }), resetScroll: false })
          }
        />
      ) : !groups ? (
        <div className="grid gap-3 px-5 py-6" aria-busy="true">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : open === 0 ? (
        <ListEmpty>
          <EmptyState
            icon={CircleCheck}
            title={
              kind === 'client'
                ? 'Niciun import de client deschis'
                : 'Niciun import de lucrători deschis'
            }
            data-testid="imports-open-empty"
          />
        </ListEmpty>
      ) : (
        <OpenImportsList groups={groups} />
      )}
      {dialogs}
    </div>
  );
}

function FirstImport({
  kind,
  accountNever,
  onStart,
}: {
  kind: ImportKind;
  accountNever: boolean;
  onStart: (way: NewImportWay) => void;
}) {
  const { balance } = useCreditsBalance();
  const clients = useActiveClients(undefined, 1, kind === 'employees');
  const noClients = kind === 'employees' && clients.isSuccess && clients.data.total === 0;
  const card =
    kind === 'client'
      ? {
          title: 'Adaugă primul client cu AI',
          text: 'Încarci dosarul SSM și SU, iar AI-ul citește documentele și îți propune datele.',
          icon: Sparkles,
        }
      : noClients
        ? {
            title: 'Adaugă lucrători cu AI din fișe',
            text: 'După primul client, fotografiezi fișele lui pe hârtie și AI-ul îți propune lucrătorii.',
            icon: UsersRound,
          }
        : {
            title: 'Adaugă lucrători cu AI din fișe',
            text: 'Fotografiezi fișele individuale pe hârtie, iar AI-ul îți propune lucrătorii și instruirile lor.',
            icon: Sparkles,
          };
  const Icon = card.icon;
  const content = (
    <>
      <WayBadge primary={!noClients}>
        <Icon className="size-5" />
      </WayBadge>
      <span className="text-[15px] font-semibold">{card.title}</span>
      <span className="text-sm leading-snug text-muted-foreground">{card.text}</span>
    </>
  );
  return (
    <ListEmpty className="grid justify-items-center gap-5">
      <EmptyState
        icon={kind === 'client' ? ScanText : UsersRound}
        title={
          kind === 'employees'
            ? 'Niciun import de lucrători încă'
            : accountNever
              ? 'Niciun import încă'
              : 'Niciun import de client încă'
        }
        titleAs="h2"
        data-testid="imports-first"
        className="py-0"
      />
      {noClients ? (
        <div
          aria-disabled="true"
          data-testid="imports-first-start"
          className={cn(wayClass, 'w-full max-w-md opacity-60 hover:bg-card')}
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          data-testid="imports-first-start"
          className={cn(wayClass, 'w-full max-w-md border-primary/40')}
          onClick={() => onStart(kind === 'client' ? 'new' : 'employees')}
        >
          {content}
        </button>
      )}
      {kind === 'client' && accountNever && balance && (
        <CreditsAvailable balance={balance} lead="have" className="text-sm text-muted-foreground" />
      )}
    </ListEmpty>
  );
}
