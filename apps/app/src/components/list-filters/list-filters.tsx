import { Button } from '@ssm-usor/ui/components/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@ssm-usor/ui/components/drawer';
import { Popover, PopoverContent, PopoverTrigger } from '@ssm-usor/ui/components/popover';
import { useIsMobile } from '@ssm-usor/ui/hooks/use-mobile';
import { cn } from '@ssm-usor/ui/lib/utils';
import { ChevronDown, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from 'lucide-react';
import {
  type ComponentProps,
  forwardRef,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { FilterOptions, PeriodFilter, SearchableFilterOptions } from './filter-options';
import {
  appliedFacets,
  type ListFilterFacet,
  type ListFilterValues,
  noFilters,
  selectedLabels,
  toggled,
  withFacet,
} from './types';

export interface ListFiltersProps<Key extends string> {
  facets: readonly ListFilterFacet<Key>[];
  values: ListFilterValues<Key>;
  onChange: (values: ListFilterValues<Key>) => void;
  // Undefined while the list loads, so the panel never names an earlier count.
  total: number | undefined;
  countLabel: (count: number) => string;
  // The phone sheet's button, which applies a selection: it names how many rows that would show,
  // so it may load them. Rendered only while the sheet is open.
  applyLabel: (pending: ListFilterValues<Key>) => ReactNode;
  testId: string;
  // The panel's edge that lines up with the button's: its end where the button closes the
  // toolbar, its start where the button leads it.
  align?: 'start' | 'end';
}

const closeClass =
  'grid size-11 place-items-center rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50';

const FiltersButton = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof Button> & { applied: number; testId: string }
>(function FiltersButton({ applied, testId, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="outline"
      data-testid={testId}
      className={cn(
        'h-auto min-h-9 self-stretch border-success-border bg-success text-foreground shadow-none hover:bg-[color-mix(in_oklab,var(--success)_85%,var(--success-border))]',
        className
      )}
      {...props}
    >
      <SlidersHorizontal aria-hidden="true" />
      Filtre
      {applied > 0 && (
        <>
          <span
            data-testid={`${testId}-count`}
            aria-hidden="true"
            className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums"
          >
            {applied}
          </span>
          <span className="sr-only">
            {applied === 1 ? ', 1 filtru aplicat' : `, ${applied} filtre aplicate`}
          </span>
        </>
      )}
    </Button>
  );
});

export function ListFilters<Key extends string>(props: ListFiltersProps<Key>) {
  const phone = useIsMobile();
  const [open, setOpen] = useState(false);
  const [drilled, setDrilled] = useState<Key | null>(null);
  const applied = appliedFacets(props.facets, props.values).length;
  const button = (
    <FiltersButton
      applied={applied}
      testId={props.testId}
      aria-expanded={open}
      aria-haspopup="dialog"
      onClick={phone ? () => setOpen(true) : undefined}
    />
  );
  if (phone) {
    return (
      <>
        {button}
        <Drawer
          open={open}
          onOpenChange={(next, details) => {
            // Escape in a facet's own list goes back to the filters, keeping what was chosen.
            if (!next && drilled !== null && details.reason === 'escape-key') {
              details.cancel();
              setDrilled(null);
              return;
            }
            if (!next) setDrilled(null);
            setOpen(next);
          }}
        >
          <DrawerContent data-testid={`${props.testId}-sheet`} className="h-[85dvh] bg-card">
            <FilterSheet
              {...props}
              drilled={drilled}
              onDrill={setDrilled}
              onClose={() => {
                setDrilled(null);
                setOpen(false);
              }}
            />
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align={props.align ?? 'end'}
        sideOffset={8}
        collisionPadding={16}
        aria-label="Filtre"
        data-testid={`${props.testId}-panel`}
        className="flex max-h-(--radix-popover-content-available-height) w-[min(45rem,calc(100vw-2rem))] flex-col rounded-xl p-0"
      >
        <FilterPanel {...props} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function FacetHeading<Key extends string>({ facet }: { facet: ListFilterFacet<Key> }) {
  const Icon = facet.icon;
  return (
    <h3 className="flex h-7 items-center gap-2 px-2.5 text-sm font-semibold">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      {facet.label}
    </h3>
  );
}

function FilterPanel<Key extends string>({
  facets,
  values,
  onChange,
  total,
  countLabel,
  testId,
  onClose,
}: ListFiltersProps<Key> & { onClose: () => void }) {
  const toggle = (facet: ListFilterFacet<Key>, value: string) =>
    onChange(withFacet(values, facet.key, toggled(values[facet.key], value)));
  return (
    <>
      <div className="grid min-h-0 gap-x-6 gap-y-1 overflow-y-auto overscroll-contain p-4 pb-2 sm:grid-cols-2">
        {(['left', 'right'] as const).map((column) => (
          <div key={column}>
            {facets
              .filter((facet) => facet.column === column)
              .map((facet) => (
                <section key={facet.key} className="pb-3">
                  <FacetHeading facet={facet} />
                  {facet.period ? (
                    <PeriodFilter
                      facet={facet}
                      selected={values[facet.key]}
                      onChange={(selected) => onChange(withFacet(values, facet.key, selected))}
                      testId={testId}
                    />
                  ) : facet.search ? (
                    <SearchableFacet
                      facet={facet}
                      values={values}
                      onToggle={(value) => toggle(facet, value)}
                      testId={testId}
                    />
                  ) : (
                    <FilterOptions
                      facet={facet}
                      selected={values[facet.key]}
                      onToggle={(value) => toggle(facet, value)}
                      testId={testId}
                    />
                  )}
                </section>
              ))}
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t px-4 py-3">
        <Button
          variant="link"
          className="px-1 text-foreground"
          data-testid={`${testId}-clear`}
          disabled={appliedFacets(facets, values).length === 0}
          onClick={() => onChange(noFilters<Key>())}
        >
          Șterge filtrele
        </Button>
        <Button data-testid={`${testId}-show`} onClick={onClose}>
          <span aria-live="polite">
            {total === undefined ? 'Arată rezultatele' : `Arată ${countLabel(total)}`}
          </span>
        </Button>
      </div>
    </>
  );
}

function SearchableFacet<Key extends string>({
  facet,
  values,
  onToggle,
  testId,
}: {
  facet: ListFilterFacet<Key>;
  values: ListFilterValues<Key>;
  onToggle: (value: string) => void;
  testId: string;
}) {
  const [adding, setAdding] = useState(false);
  const chosen = facet.options.filter((option) => values[facet.key]?.includes(option.value));
  return (
    <div className="grid gap-1.5 px-1">
      {chosen.length > 0 && (
        <ul
          className="flex flex-wrap gap-1.5 px-1.5 pt-1"
          aria-label={`Valori alese: ${facet.label}`}
        >
          {chosen.map((option) => (
            <li
              key={option.value}
              className="inline-flex h-7 items-center rounded-lg border border-input bg-background pl-2 text-[13px] font-medium"
            >
              {option.label}
              <button
                type="button"
                aria-label={`Scoate ${option.label}`}
                data-testid={`${testId}-${facet.key}-remove-${option.value}`}
                className="ml-1.5 grid size-6 place-items-center rounded-r-lg border-l text-muted-foreground hover:text-foreground"
                onClick={() => onToggle(option.value)}
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Popover open={adding} onOpenChange={setAdding}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            data-testid={`${testId}-${facet.key}-add`}
            className="justify-start font-normal text-muted-foreground shadow-none"
          >
            <Plus aria-hidden="true" />
            {facet.search?.addLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex h-80 w-72 flex-col p-2">
          <SearchableFilterOptions
            facet={facet}
            selected={values[facet.key]}
            onToggle={onToggle}
            testId={testId}
            className="flex-1"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function FilterSheet<Key extends string>({
  facets,
  values,
  onChange,
  applyLabel,
  testId,
  drilled: drilledKey,
  onDrill,
  onClose,
}: ListFiltersProps<Key> & {
  drilled: Key | null;
  onDrill: (key: Key | null) => void;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(values);
  // A sheet of one group has nothing to choose between, so its options show at once.
  const [expanded, setExpanded] = useState<Key | null>(() =>
    facets.length === 1 && !facets[0]!.search ? facets[0]!.key : null
  );
  const drilled = facets.find((facet) => facet.key === drilledKey) ?? null;
  const rows = useRef(new Map<Key, HTMLButtonElement>());
  const search = useRef<HTMLInputElement>(null);
  const cameBackFrom = useRef<Key | null>(null);
  useEffect(() => {
    if (drilledKey !== null) {
      search.current?.focus();
      cameBackFrom.current = drilledKey;
    } else if (cameBackFrom.current !== null) {
      rows.current.get(cameBackFrom.current)?.focus();
      cameBackFrom.current = null;
    }
  }, [drilledKey]);
  const toggle = (facet: ListFilterFacet<Key>, value: string) =>
    setPending((current) => withFacet(current, facet.key, toggled(current[facet.key], value)));
  const apply = () => {
    onChange(pending);
    onClose();
  };
  const footer = (
    <DrawerFooter className="flex bg-card">
      <Button
        variant="outline"
        size="lg"
        data-testid={`${testId}-clear`}
        onClick={() => setPending(noFilters<Key>())}
      >
        Șterge filtrele
      </Button>
      <Button size="lg" className="flex-1" data-testid={`${testId}-apply`} onClick={apply}>
        <span aria-live="polite">{applyLabel(pending)}</span>
      </Button>
    </DrawerFooter>
  );

  if (drilled) {
    return (
      <>
        <DrawerHeader className="justify-between pt-2 pr-2 pb-2 pl-1">
          <span className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Înapoi la filtre"
              data-testid={`${testId}-back`}
              onClick={() => onDrill(null)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <DrawerTitle className="text-[17px] font-semibold">{drilled.label}</DrawerTitle>
          </span>
          <DrawerClose aria-label="Închide" className={closeClass}>
            <X aria-hidden="true" className="size-5" />
          </DrawerClose>
        </DrawerHeader>
        <DrawerBody className="flex flex-col px-3">
          <SearchableFilterOptions
            facet={drilled}
            selected={pending[drilled.key]}
            onToggle={(value) => toggle(drilled, value)}
            roomy
            testId={testId}
            className="flex-1"
            searchRef={search}
          />
        </DrawerBody>
        {footer}
      </>
    );
  }

  return (
    <>
      <DrawerHeader className="justify-between pt-2 pr-2 pb-2 pl-5">
        <DrawerTitle className="text-[17px] font-semibold">Filtre</DrawerTitle>
        <DrawerClose aria-label="Închide" className={closeClass}>
          <X aria-hidden="true" className="size-5" />
        </DrawerClose>
      </DrawerHeader>
      <DrawerBody className="px-2">
        {facets.map((facet) => {
          const labels = selectedLabels(facet, pending);
          const summary = (
            <span
              className={cn(
                'ml-auto truncate pl-3 text-sm',
                labels.length > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
              )}
            >
              {labels.length > 0 ? labels.join(', ') : 'Toate'}
            </span>
          );
          const rowClass =
            'flex min-h-13 w-full items-center gap-2 border-b px-3 text-left text-[15px] font-medium';
          const remember = (row: HTMLButtonElement | null) => {
            if (row) rows.current.set(facet.key, row);
            else rows.current.delete(facet.key);
          };
          if (facet.search) {
            return (
              <button
                key={facet.key}
                ref={remember}
                type="button"
                data-testid={`${testId}-open-${facet.key}`}
                className={rowClass}
                onClick={() => onDrill(facet.key)}
              >
                {facet.label}
                {summary}
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            );
          }
          const isOpen = expanded === facet.key;
          return (
            <div key={facet.key} className="border-b">
              <button
                ref={remember}
                type="button"
                aria-expanded={isOpen}
                data-testid={`${testId}-group-${facet.key}`}
                className={cn(rowClass, 'border-b-0')}
                onClick={() => setExpanded(isOpen ? null : facet.key)}
              >
                {facet.label}
                {summary}
                <ChevronDown
                  className={cn(
                    'size-4 shrink-0 text-muted-foreground transition-transform',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden
                />
              </button>
              {isOpen && (
                <div className={cn('pb-2', facet.period ? 'px-1 pb-4' : 'pl-5')}>
                  {facet.period ? (
                    <PeriodFilter
                      facet={facet}
                      selected={pending[facet.key]}
                      onChange={(selected) =>
                        setPending((current) => withFacet(current, facet.key, selected))
                      }
                      testId={testId}
                    />
                  ) : (
                    <FilterOptions
                      facet={facet}
                      selected={pending[facet.key]}
                      onToggle={(value) => toggle(facet, value)}
                      roomy
                      testId={testId}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </DrawerBody>
      {footer}
    </>
  );
}
