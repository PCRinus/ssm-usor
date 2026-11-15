import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Search } from 'lucide-react';
import { type Ref, useId, useState } from 'react';

import { DatePicker } from '@/components/date-picker';
import { normalizeSearch } from '@/lib/normalize-search';

import type { ListFilterFacet, ListFilterOption } from './types';

export function FilterOptions<Key extends string>({
  facet,
  options = facet.options,
  selected,
  onToggle,
  roomy = false,
  testId,
}: {
  facet: ListFilterFacet<Key>;
  options?: readonly ListFilterOption[];
  selected: readonly string[] | undefined;
  onToggle: (value: string) => void;
  roomy?: boolean;
  testId: string;
}) {
  const id = useId();
  return (
    <ul className="grid gap-px" aria-label={facet.label}>
      {options.map((option) => {
        const checked = selected?.includes(option.value) ?? false;
        if (option.onlyWhenChosen && !checked) return null;
        const optionId = `${id}-${option.value}`;
        return (
          <li key={option.value}>
            <label
              htmlFor={optionId}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-sm hover:bg-muted',
                roomy ? 'min-h-11' : 'min-h-9'
              )}
            >
              <Checkbox
                id={optionId}
                checked={checked}
                data-testid={`${testId}-${facet.key}-${option.value}`}
                onCheckedChange={() => onToggle(option.value)}
              />
              {option.label}
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// The chosen values first, so a long list does not hide them.
export function SearchableFilterOptions<Key extends string>({
  facet,
  selected,
  onToggle,
  roomy,
  testId,
  className,
  searchRef,
}: {
  facet: ListFilterFacet<Key>;
  selected: readonly string[] | undefined;
  onToggle: (value: string) => void;
  roomy?: boolean;
  testId: string;
  className?: string;
  searchRef?: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState('');
  const [chosenAtOpen] = useState(() => selected ?? []);
  const term = normalizeSearch(query.trim());
  const matching = facet.options.filter(
    (option) => !term || normalizeSearch(option.label).includes(term)
  );
  const first = matching.filter((option) => chosenAtOpen.includes(option.value));
  const rest = matching.filter((option) => !chosenAtOpen.includes(option.value));
  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="shrink-0 px-1 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            aria-label={facet.search?.placeholder ?? facet.label}
            placeholder={facet.search?.placeholder}
            data-testid={`${testId}-${facet.key}-search`}
            autoComplete="off"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain">
        {first.length > 0 && (
          <>
            <FilterOptions
              facet={facet}
              options={first}
              selected={selected}
              onToggle={onToggle}
              roomy={roomy}
              testId={testId}
            />
            {rest.length > 0 && <hr className="my-1 border-border" />}
          </>
        )}
        <FilterOptions
          facet={facet}
          options={rest}
          selected={selected}
          onToggle={onToggle}
          roomy={roomy}
          testId={testId}
        />
        {matching.length === 0 && (
          <p className="px-2.5 py-3 text-sm text-muted-foreground">Niciun rezultat.</p>
        )}
      </div>
    </div>
  );
}

export function PeriodFilter<Key extends string>({
  facet,
  selected,
  onChange,
  testId,
}: {
  facet: ListFilterFacet<Key>;
  selected: readonly string[] | undefined;
  onChange: (selected: string[]) => void;
  testId: string;
}) {
  const id = useId();
  const [from = '', to = ''] = selected ?? [];
  const ends = [
    { end: 'from', label: 'De la', value: from, max: to || undefined },
    { end: 'to', label: 'Până la', value: to, min: from || undefined },
  ] as const;
  return (
    <div className="grid gap-2 px-2.5 pt-1" role="group" aria-label={facet.label}>
      {ends.map((each) => (
        <div key={each.end} className="grid gap-1">
          <label htmlFor={`${id}-${each.end}`} className="text-[13px] text-muted-foreground">
            {each.label}
          </label>
          <DatePicker
            id={`${id}-${each.end}`}
            value={each.value}
            min={'min' in each ? each.min : undefined}
            max={'max' in each ? each.max : undefined}
            testId={`${testId}-${facet.key}-${each.end}`}
            onChange={(value) => onChange(each.end === 'from' ? [value, to] : [from, value])}
          />
        </div>
      ))}
    </div>
  );
}
