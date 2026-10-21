import { formatEmployeeName, maxPageSize } from '@ssm-usor/contracts';
import { Link, useRouteContext } from '@tanstack/react-router';

import {
  type EmployeeListResponse,
  getListEmployeesQueryKey,
  useListEmployees,
} from '@/api/generated/api';
import { type ComboboxItem, SearchCombobox } from '@/components/search-combobox';
import { normalizeSearch } from '@/lib/normalize-search';

export type EmployeeOption = EmployeeListResponse['items'][number];

export interface Administrator {
  fullName: string;
  jobTitle: string;
  // The employee the administrator also is; their entry then stands for both.
  employeeId: string | null;
}

export const administratorValue = 'administrator';

const administratorChoice = (administrator: Administrator) =>
  administrator.employeeId ?? administratorValue;

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
// is typed in by hand. A responsible person may be the client's legal representative, who holds
// most of the roles at a small client and is often not an employee, so they can come first.
export function EmployeeCombobox({
  id,
  testId = 'responsible-employee',
  clientId,
  userId,
  value,
  administrator,
  onSelect,
  onSelectAdministrator,
  disabled,
  invalid,
  describedBy,
}: {
  id: string;
  testId?: string;
  clientId: string;
  userId: string;
  value: string;
  // Null when the client has no legal representative recorded; undefined offers no entry.
  administrator?: Administrator | null;
  onSelect: (employee: EmployeeOption | null) => void;
  onSelectAdministrator?: () => void;
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
  const items: ComboboxItem[] = options
    .filter((employee) => employee.id !== administrator?.employeeId)
    .map((employee) => ({
      value: employee.id,
      label: formatEmployeeName(employee),
      description: employee.jobTitle,
      search: `${formatEmployeeName(employee)}|${employee.jobTitle}|${employee.id}`,
    }));
  if (administrator) {
    const choice = administratorChoice(administrator);
    items.unshift({
      value: choice,
      label: administrator.fullName,
      description: administrator.jobTitle,
      search: `${administrator.fullName}|${administrator.jobTitle}|${choice}`,
    });
  }

  return (
    <SearchCombobox
      id={id}
      testId={testId}
      items={items}
      value={value}
      onChange={(choice) => {
        if (administrator && choice === administratorChoice(administrator)) {
          onSelectAdministrator?.();
        } else onSelect(options.find((employee) => employee.id === choice) ?? null);
      }}
      filter={employeeFilter}
      placeholder={employees.isPending ? 'Se încarcă angajații…' : 'Alege un angajat'}
      searchPlaceholder="Numele sau funcția"
      emptyMessage="Niciun angajat cu acest nume."
      clearLabel="Renunță la angajatul ales"
      disabled={disabled || employees.isPending}
      invalid={invalid}
      describedBy={describedBy}
      note={
        administrator === null && (
          <>
            Administratorul nu este completat în Detalii.{' '}
            <Link
              to="/clients/$clientId/details"
              params={{ clientId }}
              search={{ focus: 'legal-representative-name' }}
              data-testid="responsible-employee-administrator-missing"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Completează
            </Link>
          </>
        )
      }
    />
  );
}
