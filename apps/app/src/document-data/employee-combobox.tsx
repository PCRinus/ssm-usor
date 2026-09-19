import { formatEmployeeName, maxPageSize } from '@ssm-usor/contracts';
import { useRouteContext } from '@tanstack/react-router';

import {
  type EmployeeListResponse,
  getListEmployeesQueryKey,
  useListEmployees,
} from '../api/generated/api';
import { normalizeSearch } from '../clients/caen-filter';
import { type ComboboxItem, SearchCombobox } from '../components/search-combobox';

export type EmployeeOption = EmployeeListResponse['items'][number];

// Item search text is "<last name> <first name>|<job title>|<id>". Any word of the name or
// the job title may start the match; the id only keeps two namesakes apart.
function employeeFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const [name = '', jobTitle = ''] = value.split('|');
  const words = normalizeSearch(`${name} ${jobTitle}`).split(/[\s-]+/);
  return words.some((word) => word.startsWith(query)) ? 1 : 0;
}

const listParams = { page: 1, pageSize: maxPageSize, sort: 'name', order: 'asc' } as const;

// The first page by name is enough for the handful of people a client designates; anyone else
// is typed in by hand.
export function EmployeeCombobox({
  id,
  clientId,
  userId,
  value,
  onSelect,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  clientId: string;
  userId: string;
  value: string;
  onSelect: (employee: EmployeeOption | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const employees = useListEmployees(clientId, listParams, {
    request: apiRequest,
    query: { queryKey: [...getListEmployeesQueryKey(clientId, listParams), userId] },
  });
  const options = employees.data?.items ?? [];
  const items: ComboboxItem[] = options.map((employee) => ({
    value: employee.id,
    label: formatEmployeeName(employee),
    description: employee.jobTitle,
    search: `${formatEmployeeName(employee)}|${employee.jobTitle}|${employee.id}`,
  }));

  return (
    <SearchCombobox
      id={id}
      testId="responsible-employee"
      items={items}
      value={value}
      onChange={(employeeId) =>
        onSelect(options.find((employee) => employee.id === employeeId) ?? null)
      }
      filter={employeeFilter}
      placeholder={employees.isPending ? 'Se încarcă angajații…' : 'Alege un angajat'}
      searchPlaceholder="Numele sau funcția"
      emptyMessage="Niciun angajat cu acest nume."
      clearLabel="Renunță la angajatul ales"
      disabled={disabled || employees.isPending}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}
