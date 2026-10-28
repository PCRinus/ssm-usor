import type { DashboardSummary } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import {
  Calendar,
  Check,
  ClipboardCheck,
  Clock,
  FileCheck,
  FileExclamationPoint,
  PenLine,
  RefreshCw,
} from 'lucide-react';
import { useState } from 'react';

import { getGetDashboardSummaryQueryKey, useGetDashboardSummary } from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';
import { useAuth } from '@/features/auth/auth-context';

import {
  countOf,
  firstNameOf,
  formatDueDay,
  formatToday,
  greetingAt,
  nounFor,
  summaryLine,
  waitingSince,
} from './dashboard-format';
import { DashboardItem } from './dashboard-item';
import { dashboardLinks } from './dashboard-links';
import { cardClass, type CardItem, headingClass, ItemsCard } from './dashboard-section';
import { PortfolioCard } from './portfolio-card';
import { TrainingRow } from './training-row';

const autoFitGrid = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))]';

export function DashboardPage() {
  const { session } = useAuth();
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const me = useMe();
  const summary = useGetDashboardSummary({
    request: apiRequest,
    query: {
      queryKey: [...getGetDashboardSummaryQueryKey(), session?.user.id],
      enabled: Boolean(session && apiRequest.baseUrl),
    },
  });
  const [now] = useState(() => new Date());
  const name = firstNameOf(me.data?.profile?.fullName);
  const data = summary.data;

  return (
    <div data-testid="dashboard-page" className="flex flex-col gap-6 sm:gap-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
          {data ? (
            <p
              data-testid="dashboard-greeting"
              className="text-[15px] leading-snug text-dashboard-quiet sm:text-base"
            >
              {`${greetingAt(now)}${name ? `, ${name}` : ''}. ${summaryLine(todoTotal(data), data.trainings.ssm.overdue + data.trainings.psi.overdue)}`}
            </p>
          ) : (
            summary.isPending && <Skeleton className="h-6 w-full max-w-[560px]" />
          )}
        </div>
        <span
          data-testid="dashboard-today"
          className="text-[13px] text-muted-foreground sm:text-sm"
        >
          {formatToday(now)}
        </span>
      </header>
      {summary.isError ? (
        <Notice
          variant="destructive"
          data-testid="dashboard-error"
          action={
            <Button
              variant="outline"
              disabled={summary.isFetching}
              onClick={() => void summary.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          {summary.error instanceof ApiHttpError && summary.error.status === 401
            ? 'Sesiunea nu mai este validă. Deconectează-te și autentifică-te din nou.'
            : 'Nu am putut încărca cifrele dashboardului.'}
        </Notice>
      ) : data ? (
        <DashboardSections data={data} now={now} />
      ) : (
        <DashboardSkeleton />
      )}
    </div>
  );
}

const withCount = (items: CardItem[]) => items.filter((item) => item.count > 0);

const todoTotal = (data: DashboardSummary) =>
  data.todo.mySignatures + data.todo.draftsToIssue + data.todo.clientsMissingData;

function DashboardSections({ data, now }: { data: DashboardSummary; now: Date }) {
  const { todo, trainings, nextDue, portfolio, contracts } = data;
  const total = todoTotal(data);
  const tiles = withCount([
    {
      icon: PenLine,
      count: todo.mySignatures,
      label: nounFor(todo.mySignatures, 'semnătură de dat', 'semnături de dat'),
      detail: 'Ca instructor sau verificator, cu un singur cod',
      target: dashboardLinks.signatures(),
      testId: 'dashboard-todo-signatures',
    },
    {
      icon: FileCheck,
      count: todo.draftsToIssue,
      label: nounFor(todo.draftsToIssue, 'document de emis', 'documente de emis'),
      detail: 'Ciorne complete, neemise',
      target: dashboardLinks.draftsToIssue(),
      testId: 'dashboard-todo-drafts',
    },
    {
      icon: FileExclamationPoint,
      count: todo.clientsMissingData,
      label: nounFor(todo.clientsMissingData, 'client cu date lipsă', 'clienți cu date lipsă'),
      detail: 'Fără date de bază, documentele nu se pot genera',
      alert: true,
      target: dashboardLinks.clients(),
      testId: 'dashboard-todo-missing-data',
    },
  ]);
  const waiting = withCount([
    {
      icon: Clock,
      count: todo.employeeSignatures.pending,
      label: nounFor(todo.employeeSignatures.pending, 'semnătură', 'semnături'),
      detail: todo.employeeSignatures.oldestIssuedAt
        ? waitingSince(todo.employeeSignatures.oldestIssuedAt, now)
        : undefined,
      target: dashboardLinks.clients(),
      testId: 'dashboard-waiting-signatures',
    },
    {
      icon: ClipboardCheck,
      count: todo.testsPending,
      label: nounFor(todo.testsPending, 'test de susținut', 'teste de susținut'),
      detail: 'După instruirea la angajare',
      target: dashboardLinks.testsPending(),
      testId: 'dashboard-waiting-tests',
    },
  ]);
  const contractItems = withCount([
    {
      icon: FileCheck,
      count: contracts?.receivedToConfirm ?? 0,
      label: nounFor(
        contracts?.receivedToConfirm ?? 0,
        'exemplar semnat de confirmat',
        'exemplare semnate de confirmat'
      ),
      detail: 'Primite de la clienți',
      target: dashboardLinks.clients(),
      testId: 'dashboard-contracts-received',
    },
    {
      icon: Calendar,
      count: contracts?.endingWithin60Days ?? 0,
      label: nounFor(contracts?.endingWithin60Days ?? 0, 'contract expiră', 'contracte expiră'),
      detail: 'În următoarele 60 de zile',
      target: dashboardLinks.clients(),
      testId: 'dashboard-contracts-ending',
    },
  ]);
  const bottomCards = 1 + (waiting.length > 0 ? 1 : 0) + (contractItems.length > 0 ? 1 : 0);

  return (
    <>
      <section
        aria-labelledby="dashboard-todo"
        data-testid="dashboard-todo"
        className="rounded-[20px] border border-dashboard-panel-border bg-dashboard-panel p-3.5 sm:p-4"
      >
        <div className="flex items-baseline justify-between gap-3 px-0.5 pb-2.5 sm:px-1 sm:pb-3">
          <h2 id="dashboard-todo" className={headingClass}>
            Ce ai de făcut
          </h2>
          {total > 0 && (
            <span
              data-testid="dashboard-todo-total"
              className="text-[13px] font-medium text-success-foreground tabular-nums sm:text-sm"
            >
              {total} în total
            </span>
          )}
        </div>
        {tiles.length > 0 ? (
          <div className={cn(autoFitGrid, 'gap-2.5 sm:gap-3')}>
            {tiles.map((tile) => (
              <DashboardItem
                key={tile.testId}
                tone={tile.alert ? 'red' : 'lime'}
                surface="tile"
                {...tile}
              />
            ))}
          </div>
        ) : (
          <DashboardItem
            icon={Check}
            tone="lime"
            surface="tile"
            label="Totul e la zi"
            detail={
              nextDue
                ? `Următoarea instruire scadentă: ${formatDueDay(nextDue.on)}, pentru ${countOf(nextDue.employees, 'angajat', 'angajați')}`
                : undefined
            }
            className="border-dashed"
            testId="dashboard-todo-done"
          />
        )}
      </section>

      <section aria-labelledby="dashboard-clients" className="flex flex-col gap-2.5 sm:gap-3.5">
        <h2 id="dashboard-clients" className={cn(headingClass, 'px-0.5 sm:px-1')}>
          Situația clienților
        </h2>
        <div className={cn(cardClass, '@container px-4 py-0.5 sm:px-6')}>
          <TrainingRow domain="ssm" counts={trainings.ssm} />
          <div className="border-t border-muted">
            <TrainingRow domain="psi" counts={trainings.psi} />
          </div>
          {todo.documentsBehind > 0 && (
            <div className="border-t border-muted py-1.5">
              <DashboardItem
                icon={RefreshCw}
                tone="ink"
                surface="row"
                count={todo.documentsBehind}
                label={nounFor(
                  todo.documentsBehind,
                  'document de actualizat',
                  'documente de actualizat'
                )}
                detail="Șablonul sau instrucțiunile s-au schimbat după emitere"
                target={dashboardLinks.documentsBehind()}
                testId="dashboard-documents-behind"
              />
            </div>
          )}
        </div>
      </section>

      <div className={cn(autoFitGrid, 'items-start gap-4')}>
        {waiting.length > 0 && (
          <ItemsCard id="dashboard-waiting" title="Așteptăm de la angajați" items={waiting} />
        )}
        <PortfolioCard portfolio={portfolio} alone={bottomCards === 1} />
        {contractItems.length > 0 && (
          <ItemsCard id="dashboard-contracts" title="Contracte" items={contractItems} />
        )}
      </div>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div
      data-testid="dashboard-loading"
      role="status"
      aria-label="Se încarcă dashboardul"
      className="flex flex-col gap-6 sm:gap-8"
    >
      <div className="rounded-[20px] border border-dashboard-panel-border bg-dashboard-panel p-3.5 sm:p-4">
        <Skeleton className="mx-0.5 mb-2.5 h-6 w-36 bg-card/70 sm:mx-1 sm:mb-3" />
        <div className={cn(autoFitGrid, 'gap-2.5 sm:gap-3')}>
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-[72px] rounded-2xl bg-card/70 sm:h-[76px]" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5 sm:gap-3.5">
        <Skeleton className="mx-0.5 h-6 w-44 sm:mx-1" />
        <Skeleton className={cn(cardClass, 'h-[330px] bg-card md:h-[168px]')} />
      </div>
      <div className={cn(autoFitGrid, 'items-start gap-4')}>
        {[0, 1].map((index) => (
          <Skeleton key={index} className={cn(cardClass, 'h-[236px]')} />
        ))}
      </div>
    </div>
  );
}
