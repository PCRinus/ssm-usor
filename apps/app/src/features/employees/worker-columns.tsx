import {
  type EmployeeTraining,
  formatEmployeeName,
  type TestState,
  type TrainingDomain,
  trainingDomainLabels,
  trainingDomains,
} from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { TestStatesLine } from '@/features/knowledge-tests/test-state-badge';
import { TrainingStateCell } from '@/features/trainings/training-state-badge';

import { formatDate } from './employee-format';

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
}

const narrow = 'w-px';
const twoLines = (text: string) => () => (
  <span className="whitespace-normal leading-tight">{text}</span>
);

// Sortable column ids are the API sort keys.
export function workerColumns<TData extends WorkerRow>(testIdPrefix: string) {
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
            state={openedHere}
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
      meta: { cellClassName: 'max-w-48 truncate', skeletonClassName: 'w-28' },
    }),
    training: trainingDomains.map((domain) =>
      helper.accessor((row) => row.training[domain].state, {
        id: domain === 'ssm' ? 'ssmTraining' : 'suTraining',
        header: twoLines(`Instruire ${trainingDomainLabels[domain]}`),
        enableSorting: true,
        meta: { headerClassName: narrow, skeletonClassName: 'w-20' },
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
          <span className="text-muted-foreground">—</span>
        );
      },
    }),
    hiredAt: helper.accessor((row) => row.hiredAt, {
      id: 'hiredAt',
      header: twoLines('Angajat din'),
      enableSorting: true,
      meta: {
        headerClassName: narrow,
        cellClassName: 'tabular-nums text-muted-foreground',
        skeletonClassName: 'w-24',
      },
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    terminatedAt: helper.accessor((row) => row.terminatedAt, {
      id: 'terminatedAt',
      header: twoLines('Data încetării'),
      enableSorting: true,
      meta: { headerClassName: narrow, cellClassName: 'tabular-nums', skeletonClassName: 'w-24' },
      cell: ({ getValue }) => {
        const terminatedAt = getValue();
        return terminatedAt ? formatDate(terminatedAt) : null;
      },
    }),
  };
}
