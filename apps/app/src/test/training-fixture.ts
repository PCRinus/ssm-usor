import type { TrainingState } from '@ssm-usor/contracts';

export const trainingStatus = (
  state: TrainingState | null,
  dueOn: string | null = null,
  lastPeriodicOn: string | null = null
) => ({ state, dueOn, lastPeriodicOn });

export const untrained = {
  ssm: trainingStatus('untrained'),
  psi: trainingStatus('untrained'),
};
