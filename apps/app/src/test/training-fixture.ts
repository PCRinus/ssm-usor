import type {
  KnowledgeTest,
  TestState,
  TestStatus,
  TrainingIntervalSource,
  TrainingState,
  TrainingStatus,
} from '@ssm-usor/contracts';

export const trainingStatus = (
  state: TrainingState | null,
  dueOn: string | null = null,
  lastPeriodicOn: string | null = null,
  intervalMonths: number | null = null,
  intervalSource: TrainingIntervalSource | null = null
): TrainingStatus => ({ state, dueOn, lastPeriodicOn, intervalMonths, intervalSource });

export const untrained = {
  ssm: trainingStatus('untrained'),
  su: trainingStatus('untrained'),
};

export const testStatus = (
  state: TestState | null,
  awaitingTest: KnowledgeTest | null = null,
  lastPassedOn: string | null = null,
  dueOn: string | null = null
): TestStatus => ({ state, awaitingTest, lastPassedOn, dueOn });

export const noTests = { ssm: testStatus('none'), su: testStatus('none') };

export const employeeTests = (
  ssm: TestStatus = testStatus('none'),
  su: TestStatus = testStatus('none')
) => ({
  ssm: { status: ssm, results: [], attempts: [] },
  su: { status: su, results: [], attempts: [] },
});
