import type { TestState, TrainingDomain } from '@ssm-usor/contracts';

import { createDataTableColumns } from '@/components/data-table/columns';
import { TestStatesCell } from '@/features/knowledge-tests/test-state-badge';

export function testStateColumn<
  TData extends { tests: Record<TrainingDomain, { state: TestState | null }> },
>() {
  return createDataTableColumns<TData>().display({
    id: 'tests',
    header: 'Testare',
    meta: { cellClassName: 'whitespace-nowrap text-sm', skeletonClassName: 'w-24' },
    cell: ({ row }) => <TestStatesCell tests={row.original.tests} />,
  });
}
