import type { EmployeeTraining, TrainingStatus } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

type StatusRow = Database['public']['Views']['employee_training_status']['Row'];

export type TrainingStatusRow = Pick<
  StatusRow,
  | 'ssm_state'
  | 'ssm_due_on'
  | 'ssm_last_periodic_on'
  | 'ssm_interval_months'
  | 'ssm_interval_source'
  | 'psi_state'
  | 'psi_due_on'
  | 'psi_last_periodic_on'
  | 'psi_interval_months'
  | 'psi_interval_source'
>;

const statusOf = (
  state: TrainingStatus['state'] | undefined,
  dueOn: string | null | undefined,
  lastPeriodicOn: string | null | undefined,
  intervalMonths: number | null | undefined,
  intervalSource: string | null | undefined
): TrainingStatus => ({
  state: state ?? null,
  dueOn: dueOn ?? null,
  lastPeriodicOn: lastPeriodicOn ?? null,
  intervalMonths: intervalMonths ?? null,
  // The view answers only 'position', 'client' or null.
  intervalSource: (intervalSource ?? null) as TrainingStatus['intervalSource'],
});

export function toEmployeeTraining(row: TrainingStatusRow | null | undefined): EmployeeTraining {
  return {
    ssm: statusOf(
      row?.ssm_state,
      row?.ssm_due_on,
      row?.ssm_last_periodic_on,
      row?.ssm_interval_months,
      row?.ssm_interval_source
    ),
    psi: statusOf(
      row?.psi_state,
      row?.psi_due_on,
      row?.psi_last_periodic_on,
      row?.psi_interval_months,
      row?.psi_interval_source
    ),
  };
}
