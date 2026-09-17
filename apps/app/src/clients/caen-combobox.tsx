import { caenClasses, caenClassName } from '@ssm-usor/contracts';

import { type ComboboxItem, SearchCombobox } from '../components/search-combobox';
import { caenFilter } from './caen-filter';

const items: readonly ComboboxItem[] = caenClasses.map((entry) => ({
  value: entry.code,
  label: entry.code,
  description: entry.name,
  search: `${entry.code} ${entry.name}`,
}));

export function CaenCombobox(props: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <SearchCombobox
      {...props}
      testId="client-caen"
      items={items}
      filter={caenFilter}
      placeholder="Caută după cod sau activitate"
      searchPlaceholder="Cod sau cuvinte din denumire"
      emptyMessage="Niciun cod CAEN nu se potrivește. Încearcă alte cuvinte."
      clearLabel="Șterge codul selectat"
      unknownValue={(search) =>
        /^[0-9]{4}$/.test(search) && !caenClassName(search) ? search : null
      }
      renderUnknown={(code) => (caenClassName(code) ? null : 'cod care nu apare în CAEN Rev. 3')}
    />
  );
}
