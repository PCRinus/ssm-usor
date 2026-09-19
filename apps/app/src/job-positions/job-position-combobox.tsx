import { useState } from 'react';

import { normalizeSearch } from '../clients/caen-filter';
import { type ComboboxItem, SearchCombobox } from '../components/search-combobox';
import { JobPositionDialog } from './job-position-dialog';
import { employeeCountLabel, staffCategoryShortLabels } from './job-position-schema';
import { useJobPositionOptions } from './use-job-position-options';

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

// Picks one of the client's job positions (ADR 006). A row under the list, always there,
// opens the same dialog as the "Posturi de lucru" section with the typed text as the name, and
// the position it saves becomes the choice: a new hire into a new post stays one form, and the
// post gets its category where it is created.
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
  /** The id of one of the client's positions. */
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
  // `null` is closed; a string is what the new position's name starts as.
  const [adding, setAdding] = useState<string | null>(null);
  const options = positions.data?.items ?? [];
  const items: ComboboxItem[] = options.map((position) => ({
    value: position.id,
    label: position.name,
    description: `${staffCategoryShortLabels[position.staffCategory]} · ${employeeCountLabel(position.employeeCount).toLowerCase()}`,
    search: `${position.name}|${position.id}`,
  }));

  return (
    <>
      <SearchCombobox
        id={id}
        testId={testId}
        items={items}
        value={value}
        onChange={(next) =>
          onChange(next, options.find((position) => position.id === next)?.name ?? '')
        }
        onBlur={onBlur}
        filter={positionFilter}
        placeholder={positions.isPending ? 'Se încarcă posturile…' : 'Alege postul de lucru'}
        searchPlaceholder="Denumirea postului"
        emptyMessage="Clientul nu are un post cu acest nume."
        clearLabel="Renunță la postul ales"
        action={{
          label: 'Adaugă un post nou…',
          testId: `${testId}-add`,
          onSelect: setAdding,
        }}
        disabled={disabled || positions.isPending}
        invalid={invalid}
        describedBy={describedBy}
        modal={modal}
      />
      <JobPositionDialog
        clientId={clientId}
        editing={adding === null ? null : 'new'}
        initialName={adding ?? ''}
        onSaved={(position) => onChange(position.id, position.name)}
        onClose={() => setAdding(null)}
      />
    </>
  );
}
