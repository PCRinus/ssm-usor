import {
  type DutiesAcknowledgementStatus,
  type EmployeeTraining,
  formatEmployeeName,
  type TestState,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
} from '@ssm-usor/contracts';
import { type HistoryState, Link, type ParsedLocation } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import {
  createDataTableColumns,
  narrowHeader,
  twoLineHeader,
} from '@/components/data-table/columns';
import { dutiesListLines } from '@/features/duties-acknowledgements/duties-format';
import { TestStatesLine } from '@/features/knowledge-tests/test-state-badge';
import { TrainingStateCell } from '@/features/trainings/training-state-badge';
import { formatDate } from '@/lib/dates';

interface WorkerRow {
  id: string;
  clientId: string;
  lastName: string;
  firstName: string;
  employeeNumber: string | null;
  jobPosition: { name: string };
  hiredAt: string;
  terminatedAt: string | null;
  training: EmployeeTraining;
  tests: Record<TrainingDomain, { state: TestState | null }>;
  signaturesPending: number;
  dutiesAcknowledgement: DutiesAcknowledgementStatus | null;
}

// Sortable column ids are the API sort keys.
export function workerColumns<TData extends WorkerRow>(
  testIdPrefix: string,
  openState: (current: ParsedLocation['state']) => HistoryState = openedHere
) {
  const helper = createDataTableColumns<TData>();
  return {
    name: helper.accessor((row) => formatEmployeeName(row), {
      id: 'name',
      header: 'Lucrător',
      enableSorting: true,
      meta: { cellClassName: 'font-medium', skeletonClassName: 'w-40', personal: true },
      cell: ({ row, getValue }) => (
        <>
          <Link
            to="/clienti/$clientId/angajati/$employeeId"
            state={openState}
            params={{ clientId: row.original.clientId, employeeId: row.original.id }}
            data-testid={`${testIdPrefix}-open`}
            className="hover:underline"
          >
            {getValue()}
          </Link>
          {row.original.employeeNumber && <CellNote>Marca {row.original.employeeNumber}</CellNote>}
        </>
      ),
    }),
    // The post the person fills; the contract title is on their page (ADR 006).
    jobPosition: helper.accessor((row) => row.jobPosition.name, {
      id: 'jobPosition',
      header: 'Post de lucru',
      enableSorting: true,
      meta: { cellClassName: 'max-w-48', skeletonClassName: 'w-28' },
      cell: ({ row, getValue }) => {
        const status = row.original.dutiesAcknowledgement;
        const line = status ? dutiesListLines[status] : undefined;
        return (
          <>
            <span className="block truncate">{getValue()}</span>
            {line && (
              <CellNote
                data-testid={`${testIdPrefix}-duties`}
                className="whitespace-nowrap text-warning-foreground"
              >
                {line}
              </CellNote>
            )}
          </>
        );
      },
    }),
    // Sorted only where the employees have a state: current employees of an active client.
    training: (sortable: boolean) =>
      trainingDomains.map((domain) =>
        helper.accessor((row) => row.training[domain].state, {
          id: domain === 'ssm' ? 'ssmTraining' : 'suTraining',
          header: twoLineHeader(`Instruire ${trainingDomainLabels[domain]}`),
          enableSorting: sortable,
          meta: { headerClassName: narrowHeader, skeletonClassName: 'w-20' },
          cell: ({ row }) => <TrainingStateCell training={row.original.training} domain={domain} />,
        })
      ),
    tests: helper.display({
      id: 'tests',
      header: 'Testare',
      meta: { skeletonClassName: 'w-24' },
      cell: ({ row }) => <TestStatesLine tests={row.original.tests} />,
    }),
    signatures: helper.accessor((row) => row.signaturesPending, {
      id: 'signatures',
      header: 'De semnat',
      enableSorting: false,
      meta: { skeletonClassName: 'w-24' },
      cell: ({ getValue }) => {
        const pending = getValue();
        return pending > 0 ? (
          <span data-testid={`${testIdPrefix}-signatures`}>{pending} în așteptare</span>
        ) : (
          <CellEmpty />
        );
      },
    }),
    hiredAt: helper.accessor((row) => row.hiredAt, {
      id: 'hiredAt',
      header: twoLineHeader('Angajat din'),
      enableSorting: true,
      meta: {
        headerClassName: narrowHeader,
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-24',
      },
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    terminatedAt: helper.accessor((row) => row.terminatedAt, {
      id: 'terminatedAt',
      header: twoLineHeader('Data încetării'),
      enableSorting: true,
      meta: {
        headerClassName: narrowHeader,
        cellClassName: 'tabular-nums',
        skeletonClassName: 'w-24',
      },
      cell: ({ getValue }) => {
        const terminatedAt = getValue();
        return terminatedAt ? formatDate(terminatedAt) : null;
      },
    }),
  };
}
