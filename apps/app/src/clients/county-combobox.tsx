import { romanianCounties } from '@ssm-usor/contracts';

import { type ComboboxItem, SearchCombobox } from '../components/search-combobox';
import { countyFilter } from './county-filter';

const items: readonly ComboboxItem[] = romanianCounties.map((county) => ({
  value: county.code,
  label: county.name,
  description: county.code,
  search: `${county.name}|${county.code}`,
}));

export function CountyCombobox(props: {
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
      testId="client-county"
      items={items}
      filter={countyFilter}
      placeholder="Alege județul"
      searchPlaceholder="Numele județului"
      emptyMessage="Niciun județ cu acest nume."
      clearLabel="Șterge județul selectat"
    />
  );
}
