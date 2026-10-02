import { gravityConsequence, probabilityFrequency } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal, Plus, TriangleAlert } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';

import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import {
  type FactorSort,
  type FactorSortKey,
  factorTabs,
  measureCountLabel,
  nextSort,
  parseSortValue,
  sortMenu,
  sortValue,
  visibleFactors,
} from './factor-list';
import type { FactorStore } from './factor-store';
import {
  componentLabels,
  factorCountLabel,
  factorGap,
  type RiskFactor,
} from './risk-evaluation-schema';
import { type FactorEditing, RiskFactorDialog } from './risk-factor-dialog';
import { RiskLevelTile } from './risk-level-tile';
import type { FactorListView } from './use-factor-list-view';

const columns = {
  editable:
    'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)_2rem] [grid-template-areas:"tile_desc_desc_menu"_"._g_p_."_"._m_m_."] @2xl:grid-cols-[4.25rem_minmax(0,1fr)_6.5rem_7.5rem_8.5rem_2rem] @2xl:[grid-template-areas:"tile_desc_g_p_m_menu"]',
  readOnly:
    'grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,1fr)] [grid-template-areas:"tile_desc_desc"_"._g_p"_"._m_m"] @2xl:grid-cols-[4.25rem_minmax(0,1fr)_6.5rem_7.5rem_8.5rem] @2xl:[grid-template-areas:"tile_desc_g_p_m"]',
};

export function RiskFactorsCard({
  id,
  factors,
  store,
  readOnly,
  view,
  tools,
  empty,
  removalConsequence,
  editorContext,
}: {
  id: string;
  factors: RiskFactor[];
  store: FactorStore;
  readOnly: boolean;
  view: FactorListView;
  tools?: ReactNode;
  empty: ReactNode;
  /** Continues "<factor> și măsurile lui …" in the removal dialog. */
  removalConsequence: string;
  editorContext?: string;
}) {
  const [editing, setEditing] = useState<FactorEditing>(null);
  const [removing, setRemoving] = useState<RiskFactor | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeFactor(factor: RiskFactor) {
    setError(null);
    setPending(true);
    try {
      await store.remove(factor.id);
      toast.success('Factorul a fost șters.');
    } catch (cause) {
      setError(
        store.failure(
          cause,
          'Nu am putut șterge factorul. Verifică conexiunea și încearcă din nou.'
        )
      );
      await store.refresh();
    }
    setPending(false);
    setRemoving(null);
  }

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="risk-factors-card"
      className={cn(factors.length > 0 && 'overflow-hidden pb-0')}
      title={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          Factori de risc
          <span
            data-testid="risk-factors-count"
            className="text-sm font-normal text-muted-foreground"
          >
            {factorCountLabel(factors.length)}
          </span>
        </span>
      }
      action={
        !readOnly && (
          <>
            {tools}
            <Button
              variant="tonal"
              size="sm"
              data-testid="risk-factor-add"
              onClick={() => setEditing('new')}
            >
              <Plus aria-hidden="true" />
              Adaugă un factor
            </Button>
          </>
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="risk-factors-error">
          {error}
        </Notice>
      )}
      {factors.length === 0 ? (
        <p data-testid="risk-factors-empty" className="text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <FactorList
          factors={factors}
          readOnly={readOnly}
          view={view}
          onEdit={setEditing}
          onRemove={setRemoving}
        />
      )}
      <RiskFactorDialog
        factors={factors}
        store={store}
        editing={editing}
        context={editorContext}
        onClose={() => setEditing(null)}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !pending && setRemoving(null)}
      >
        {removing && (
          <DialogContent data-testid="risk-factor-remove-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi factorul de risc?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{removing.description}</span> și
                măsurile lui {removalConsequence}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={pending} onClick={() => setRemoving(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="risk-factor-remove-confirm"
                disabled={pending}
                onClick={() => void removeFactor(removing)}
              >
                {pending ? 'Se șterge…' : 'Șterge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </SectionCard>
  );
}

function FactorList({
  factors,
  readOnly,
  view,
  onEdit,
  onRemove,
}: {
  factors: RiskFactor[];
  readOnly: boolean;
  view: FactorListView;
  onEdit: (factor: RiskFactor) => void;
  onRemove: (factor: RiskFactor) => void;
}) {
  const baseId = useId();
  const { tab, sort, cell, setTab, setSort } = view;
  const tabs = factorTabs(factors);
  const rows = visibleFactors(factors, { tab, cell, sort });
  const tabId = (value: string) => `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel`;
  const layout = readOnly ? columns.readOnly : columns.editable;

  function onTabKey(event: KeyboardEvent) {
    const index = tabs.findIndex((item) => item.tab === tab);
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = tabs[next]!.tab;
    setTab(target);
    document.getElementById(tabId(target))?.focus();
  }

  return (
    <div className="-mx-6 min-w-0 @container">
      <div
        role="tablist"
        aria-label="Componente"
        className="flex gap-1 overflow-x-auto px-6 pb-3.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((item) => (
          <button
            key={item.tab}
            type="button"
            role="tab"
            id={tabId(item.tab)}
            aria-selected={item.tab === tab}
            aria-controls={panelId}
            tabIndex={item.tab === tab ? 0 : -1}
            data-testid="risk-factors-tab"
            onClick={() => setTab(item.tab)}
            onKeyDown={onTabKey}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-selected:bg-muted aria-selected:text-foreground"
          >
            {item.tab === 'all' ? 'Toți' : componentLabels[item.tab]}{' '}
            <span className="font-normal tabular-nums">{item.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)}>
        <div className="flex items-center gap-2.5 px-6 pb-3 @2xl:hidden">
          <label
            htmlFor={`${baseId}-sort`}
            className="text-sm whitespace-nowrap text-muted-foreground"
          >
            Sortează după
          </label>
          <NativeSelect
            id={`${baseId}-sort`}
            size="sm"
            data-testid="risk-factors-sort"
            value={sortValue(sort)}
            onChange={(event) => setSort(parseSortValue(event.target.value))}
          >
            {sortMenu(sort).map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {cell && (
          <div
            data-testid="risk-factors-filter"
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t bg-muted/55 px-6 py-2.5 text-sm"
          >
            <span>
              Doar factorii cu gravitate {cell.gravityClass} și probabilitate{' '}
              {cell.probabilityClass}.
            </span>
            <button
              type="button"
              onClick={view.clearCell}
              className="cursor-pointer rounded-sm font-medium underline underline-offset-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              Arată toți
            </button>
          </div>
        )}
        <div role="table" aria-label="Factori de risc">
          <div
            role="row"
            className={cn('hidden items-center gap-x-3.5 border-t px-6 py-1.5 @2xl:grid', layout)}
          >
            <SortHeader sortKey="level" label="Nivel" sort={sort} onSort={setSort} />
            <div role="columnheader" className="text-sm font-medium">
              Factor de risc
            </div>
            <SortHeader sortKey="gravity" label="Gravitate" sort={sort} onSort={setSort} centered />
            <SortHeader
              sortKey="probability"
              label="Probabilitate"
              sort={sort}
              onSort={setSort}
              centered
            />
            <SortHeader sortKey="measures" label="Măsuri" sort={sort} onSort={setSort} />
            {!readOnly && (
              <div role="columnheader">
                <span className="sr-only">Acțiuni</span>
              </div>
            )}
          </div>
          {rows.map((factor) => (
            <FactorRow
              key={factor.id}
              factor={factor}
              withComponent={tab === 'all'}
              readOnly={readOnly}
              layout={layout}
              onEdit={() => onEdit(factor)}
              onRemove={() => onRemove(factor)}
            />
          ))}
        </div>
        {rows.length === 0 && (
          <p className="border-t px-6 py-6 text-sm text-muted-foreground">
            Niciun factor în această filă cu clasele alese.
          </p>
        )}
      </div>
    </div>
  );
}

function SortHeader({
  sortKey,
  label,
  sort,
  onSort,
  centered = false,
}: {
  sortKey: FactorSortKey;
  label: string;
  sort: FactorSort;
  onSort: (sort: FactorSort) => void;
  centered?: boolean;
}) {
  const order = sort?.key === sortKey ? sort.order : null;
  return (
    <div
      role="columnheader"
      aria-sort={order === 'asc' ? 'ascending' : order === 'desc' ? 'descending' : 'none'}
      className={cn(centered && 'flex justify-center')}
    >
      <Button
        variant="ghost"
        size="sm"
        data-testid={`risk-factors-sort-${sortKey}`}
        className={cn('gap-1.5', !centered && '-ml-2.5')}
        onClick={() => onSort(nextSort(sort, sortKey))}
      >
        {label}
        {order === 'asc' ? (
          <ArrowUp aria-hidden="true" />
        ) : order === 'desc' ? (
          <ArrowDown aria-hidden="true" />
        ) : (
          <ArrowUpDown aria-hidden="true" className="opacity-50" />
        )}
      </Button>
    </div>
  );
}

function FactorRow({
  factor,
  withComponent,
  readOnly,
  layout,
  onEdit,
  onRemove,
}: {
  factor: RiskFactor;
  withComponent: boolean;
  readOnly: boolean;
  layout: string;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const gap = readOnly ? null : factorGap(factor);
  const group = withComponent
    ? factor.group.charAt(0).toLocaleLowerCase('ro') + factor.group.slice(1)
    : factor.group;
  const consequence = gravityConsequence(factor.gravityClass);
  const period = probabilityFrequency(factor.probabilityClass).period;
  return (
    <div
      role="row"
      data-testid="risk-factor-row"
      {...rowClickProps(readOnly ? undefined : onEdit)}
      className={cn(
        'grid gap-x-3 gap-y-2.5 border-t px-6 py-3 @2xl:gap-x-3.5 @2xl:gap-y-0',
        layout,
        !readOnly && 'cursor-pointer hover:bg-muted/45'
      )}
    >
      <div role="cell" className="[grid-area:tile]">
        <RiskLevelTile level={factor.riskLevel} />
      </div>
      <div role="cell" className="grid min-w-0 content-start gap-0.5 [grid-area:desc]">
        <p className="text-sm wrap-anywhere">{factor.description}</p>
        <p className="text-[0.8125rem] text-muted-foreground wrap-anywhere">
          {withComponent && (
            <>
              <span data-testid="risk-component">{componentLabels[factor.component]}</span>,{' '}
            </>
          )}
          <span data-testid="risk-group">{group}</span>
        </p>
      </div>
      <ClassCell
        testId="risk-factor-gravity-class"
        area="[grid-area:g]"
        label="Gravitate"
        value={factor.gravityClass}
        meaning={consequence}
      />
      <ClassCell
        testId="risk-factor-probability-class"
        area="[grid-area:p]"
        label="Probabilitate"
        value={factor.probabilityClass}
        meaning={period}
      />
      <div
        role="cell"
        className="grid content-start gap-0.5 text-[0.8125rem] text-muted-foreground [grid-area:m] @2xl:pt-2 @2xl:text-sm"
      >
        <p data-testid="risk-factor-measures">{measureCountLabel(factor.measures.length)}</p>
      </div>
      {gap && (
        // Placed by column only, so it takes a row of its own under the row's content.
        <div
          role="cell"
          data-testid="risk-factor-gap"
          className="flex items-start gap-2 rounded-md border border-warning-border bg-warning px-3 py-2 text-[0.8125rem] text-warning-foreground [grid-column:2/-2] @2xl:mt-2.5"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {gap}
        </div>
      )}
      {!readOnly && (
        <div role="cell" className="[grid-area:menu]">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                data-testid="risk-factor-actions"
                aria-label={`Acțiuni pentru ${factor.description}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="risk-factor-edit" onSelect={onEdit}>
                Modifică
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="risk-factor-remove"
                variant="destructive"
                onSelect={onRemove}
              >
                Șterge
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// One element for both layouts, so a screen reader meets each class once.
function ClassCell({
  testId,
  area,
  label,
  value,
  meaning,
}: {
  testId: string;
  area: string;
  label: string;
  value: number;
  meaning: string;
}) {
  return (
    <div
      role="cell"
      data-testid={testId}
      title={meaning}
      className={cn('min-w-0 text-sm @2xl:pt-2 @2xl:text-center', area)}
    >
      <span className="text-muted-foreground @2xl:sr-only">{label} </span>
      <span className="font-medium tabular-nums">{value}</span>
      <span className="block text-[0.8125rem] text-muted-foreground @2xl:sr-only">{meaning}</span>
    </div>
  );
}
