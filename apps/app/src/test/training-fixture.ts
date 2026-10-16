import type { TrainingIntervalSource, TrainingState, TrainingStatus } from '@ssm-usor/contracts';

export const trainingStatus = (
  state: TrainingState | null,
  dueOn: string | null = null,
  lastPeriodicOn: string | null = null,
  intervalMonths: number | null = null,
  intervalSource: TrainingIntervalSource | null = null
): TrainingStatus => ({ state, dueOn, lastPeriodicOn, intervalMonths, intervalSource });

export const untrained = {
  ssm: trainingStatus('untrained'),
  psi: trainingStatus('untrained'),
};
