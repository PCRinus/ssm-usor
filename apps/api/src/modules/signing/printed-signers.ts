import type { SignerSlot, TestSheetSignerSlot } from '@ssm-usor/contracts';

// The portal's request lists name whom a signature will print, so they ask here as signing does.

export type RecordSigners = {
  occupation: string;
  admitted_by_name: string | null;
  admitted_by_job_title: string | null;
  employees: { last_name: string; first_name: string };
  trainings: {
    trainer_name: string;
    trainer_job_title: string;
    verifier_name: string | null;
    verifier_job_title: string | null;
  };
};

export function printedSlot(slot: SignerSlot, record: RecordSigners) {
  switch (slot) {
    case 'trainee':
      return {
        name: `${record.employees.last_name} ${record.employees.first_name}`,
        jobTitle: record.occupation,
      };
    case 'trainer':
      return { name: record.trainings.trainer_name, jobTitle: record.trainings.trainer_job_title };
    case 'verifier':
      return {
        name: record.trainings.verifier_name ?? '',
        jobTitle: record.trainings.verifier_job_title ?? '',
      };
    case 'admitter':
      return { name: record.admitted_by_name ?? '', jobTitle: record.admitted_by_job_title ?? '' };
  }
}

type TestSheetNames = {
  employees: { last_name: string; first_name: string };
  test_results: { examiner_name: string | null };
};

export type TestSheetSigners = {
  employees: TestSheetNames['employees'] & {
    job_title: string;
    job_positions: { name: string } | null;
  };
  test_results: TestSheetNames['test_results'] & { examiner_job_title: string | null };
};

export const printedTestSheetName = (slot: TestSheetSignerSlot, sheet: TestSheetNames) =>
  slot === 'trainee'
    ? `${sheet.employees.last_name} ${sheet.employees.first_name}`
    : (sheet.test_results.examiner_name ?? '');

export const printedTestSheetSlot = (slot: TestSheetSignerSlot, sheet: TestSheetSigners) => ({
  name: printedTestSheetName(slot, sheet),
  jobTitle:
    slot === 'trainee'
      ? sheet.employees.job_positions?.name?.trim() || sheet.employees.job_title
      : (sheet.test_results.examiner_job_title ?? ''),
});

// The database keeps a result's examiner whole: both the name and the function, or neither.
export const resultExaminer = (result: {
  examiner_name: string | null;
  examiner_job_title: string | null;
}) =>
  result.examiner_name !== null && result.examiner_job_title !== null
    ? { name: result.examiner_name, jobTitle: result.examiner_job_title }
    : null;
