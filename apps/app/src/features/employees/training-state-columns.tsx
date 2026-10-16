import { type EmployeeTraining, trainingDomainLabels, trainingDomains } from '@ssm-usor/contracts';

import { createDataTableColumns } from '@/components/data-table/columns';
import { TrainingStateCell } from '@/features/trainings/training-state-badge';

export function trainingStateColumns<TData extends { training: EmployeeTraining }>() {
  const helper = createDataTableColumns<TData>();
  return trainingDomains.map((domain) =>
    helper.display({
      id: domain === 'ssm' ? 'trainingSsm' : 'trainingPsi',
      header: `Instruire ${trainingDomainLabels[domain]}`,
      meta: { cellClassName: 'whitespace-nowrap text-sm', skeletonClassName: 'w-20' },
      cell: ({ row }) => <TrainingStateCell training={row.original.training} domain={domain} />,
    })
  );
}
