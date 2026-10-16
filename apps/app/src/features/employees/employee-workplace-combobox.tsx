import type { WorkplaceListResponse } from '@/api/generated/api';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { normalizeSearch } from '@/lib/normalize-search';

type Workplace = WorkplaceListResponse['items'][number];

function workplaceFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  return normalizeSearch(value)
    .split(/[\s,.|-]+/)
    .some((word) => word.startsWith(query))
    ? 1
    : 0;
}

export function EmployeeWorkplaceCombobox({
  id,
  testId,
  workplaces,
  current,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  testId: string;
  /** Undefined while loading. */
  workplaces: readonly Workplace[] | undefined;
  /** The workplace saved on the employee, listed even once it has been archived. */
  current: { id: string; name: string } | null;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const items: ComboboxItem[] = (workplaces ?? []).map((workplace) => ({
    value: workplace.id,
    label: workplace.name,
    description: workplace.isRegisteredOffice ? 'Sediu social' : (workplace.locality ?? undefined),
    search: `${workplace.name}|${workplace.locality ?? ''}|${workplace.id}`,
  }));
  if (current && !items.some((item) => item.value === current.id)) {
    items.push({
      value: current.id,
      label: current.name,
      description: 'Arhivat',
      search: `${current.name}|${current.id}`,
    });
  }

  return (
    <SearchCombobox
      id={id}
      testId={testId}
      items={items}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      filter={workplaceFilter}
      placeholder={workplaces ? 'Alege punctul de lucru' : 'Se încarcă punctele de lucru…'}
      searchPlaceholder="Denumirea sau localitatea"
      emptyMessage="Clientul nu are un punct de lucru cu acest nume."
      clearLabel="Renunță la punctul de lucru ales"
      disabled={disabled || !workplaces}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
