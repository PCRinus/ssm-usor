import { Button } from '@ssm-usor/ui/components/button';
import { X } from 'lucide-react';

import {
  appliedFacets,
  type ListFilterFacet,
  type ListFilterValues,
  noFilters,
  selectedLabels,
  withFacet,
} from './types';

export function AppliedFilters<Key extends string>({
  facets,
  values,
  onChange,
  testId,
}: {
  facets: readonly ListFilterFacet<Key>[];
  values: ListFilterValues<Key>;
  onChange: (values: ListFilterValues<Key>) => void;
  testId: string;
}) {
  const applied = appliedFacets(facets, values);
  if (applied.length === 0) return null;
  return (
    <div
      role="group"
      aria-label="Filtre active"
      data-testid={testId}
      className="flex flex-wrap items-center gap-2 border-b bg-background/60 px-4 py-2.5 sm:px-5"
    >
      {applied.map((facet) => (
        <span
          key={facet.key}
          data-testid={`${testId}-${facet.key}`}
          className="inline-flex h-8 max-w-full items-center rounded-[10px] border border-input bg-background pl-2.5 text-sm"
        >
          <span className="mr-1.5 shrink-0 text-muted-foreground">{facet.label}</span>
          <span className="truncate font-medium">{selectedLabels(facet, values).join(', ')}</span>
          <button
            type="button"
            aria-label={`Scoate filtrul ${facet.label}`}
            data-testid={`${testId}-${facet.key}-remove`}
            className="relative ml-2 grid h-full w-11 shrink-0 place-items-center rounded-r-[9px] border-l text-muted-foreground outline-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-8 sm:after:inset-y-0"
            onClick={() => onChange(withFacet(values, facet.key, []))}
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <Button
        variant="link"
        size="sm"
        className="px-1 text-foreground"
        data-testid={`${testId}-clear`}
        onClick={() => onChange(noFilters<Key>())}
      >
        Șterge filtrele
      </Button>
    </div>
  );
}
