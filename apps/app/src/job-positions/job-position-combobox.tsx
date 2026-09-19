import { normalizeSearch } from '../clients/caen-filter';
import { type ComboboxItem, SearchCombobox } from '../components/search-combobox';
import { employeeCountLabel, staffCategoryShortLabels } from './job-position-schema';
import { useJobPositionOptions } from './use-job-position-options';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Any word of the position's name may start the match.
function positionFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const [name = ''] = value.split('|');
  return normalizeSearch(name)
    .split(/[\s-]+/)
    .some((word) => word.startsWith(query)) || normalizeSearch(name).startsWith(query)
    ? 1
    : 0;
}

// Picks one of the client's job positions (ADR 006), or takes a name the client does not
// have yet: the value is then that name, and the form creates the position on save. A new hire
// into a new post stays one form.
export function JobPositionCombobox({
  id,
  testId,
  clientId,
  userId,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  describedBy,
  modal,
}: {
  id: string;
  testId: string;
  clientId: string;
  userId: string;
  /** The id of a position, or the name of one to create. */
  value: string;
  onChange: (value: string, name: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Inside a dialog, so the list takes the focus the dialog would otherwise trap. */
  modal?: boolean;
}) {
  const positions = useJobPositionOptions(clientId, userId);
  const options = positions.data?.items ?? [];
  const items: ComboboxItem[] = options.map((position) => ({
    value: position.id,
    label: position.name,
    description: `${staffCategoryShortLabels[position.staffCategory]} · ${employeeCountLabel(position.employeeCount).toLowerCase()}`,
    search: `${position.name}|${position.id}`,
  }));

  return (
    <SearchCombobox
      id={id}
      testId={testId}
      items={items}
      value={value}
      onChange={(next) =>
        onChange(next, options.find((position) => position.id === next)?.name ?? next)
      }
      onBlur={onBlur}
      filter={positionFilter}
      placeholder={
        positions.isPending ? 'Se încarcă posturile…' : 'Alege postul sau scrie unul nou'
      }
      searchPlaceholder="Denumirea postului"
      emptyMessage="Scrie cel puțin două litere ca să adaugi un post nou."
      clearLabel="Renunță la postul ales"
      unknownLabel="Adaugă postul"
      unknownValue={(search) => {
        const name = search.trim();
        return name.length >= 2 && !options.some((position) => sameName(position.name, name))
          ? name
          : null;
      }}
      renderUnknown={() => 'post nou'}
      disabled={disabled || positions.isPending}
      invalid={invalid}
      describedBy={describedBy}
      modal={modal}
    />
  );
}
