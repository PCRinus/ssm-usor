import type { EmployeeTraining, TrainingStatus } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

type StatusRow = Database['public']['Views']['employee_training_status']['Row'];

export type TrainingStatusRow = Pick<
  StatusRow,
  | 'ssm_state'
  | 'ssm_due_on'
  | 'ssm_last_periodic_on'
  | 'psi_state'
  | 'psi_due_on'
  | 'psi_last_periodic_on'
>;

const statusOf = (
  state: TrainingStatus['state'] | undefined,
  dueOn: string | null | undefined,
  lastPeriodicOn: string | null | undefined
): TrainingStatus => ({
  state: state ?? null,
  dueOn: dueOn ?? null,
  lastPeriodicOn: lastPeriodicOn ?? null,
});

export function toEmployeeTraining(row: TrainingStatusRow | null | undefined): EmployeeTraining {
  return {
    ssm: statusOf(row?.ssm_state, row?.ssm_due_on, row?.ssm_last_periodic_on),
    psi: statusOf(row?.psi_state, row?.psi_due_on, row?.psi_last_periodic_on),
  };
}
