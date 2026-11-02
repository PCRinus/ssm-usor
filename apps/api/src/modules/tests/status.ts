import type { EmployeeTests, TestStatus } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

type StatusRow = Database['public']['Views']['employee_test_status']['Row'];

export const testStatusFields =
  'ssm_state, ssm_awaiting_test, ssm_last_passed_on, su_state, su_awaiting_test, su_last_passed_on, su_due_on';

export const testStatusColumns = `test_status(${testStatusFields})` as const;

export type TestStatusRow = Pick<
  StatusRow,
  | 'ssm_state'
  | 'ssm_awaiting_test'
  | 'ssm_last_passed_on'
  | 'su_state'
  | 'su_awaiting_test'
  | 'su_last_passed_on'
  | 'su_due_on'
>;

const statusOf = (
  state: TestStatus['state'] | undefined,
  awaitingTest: TestStatus['awaitingTest'] | undefined,
  lastPassedOn: string | null | undefined,
  dueOn: string | null | undefined
): TestStatus => ({
  state: state ?? null,
  awaitingTest: awaitingTest ?? null,
  lastPassedOn: lastPassedOn ?? null,
  dueOn: dueOn ?? null,
});

export function toEmployeeTests(row: TestStatusRow | null | undefined): EmployeeTests {
  return {
    ssm: statusOf(row?.ssm_state, row?.ssm_awaiting_test, row?.ssm_last_passed_on, null),
    su: statusOf(row?.su_state, row?.su_awaiting_test, row?.su_last_passed_on, row?.su_due_on),
  };
}
