import type { SigningAgreementParty } from '@ssm-usor/contracts';

export type AgreementStateRow = {
  state: string;
  storage_path: string | null;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

/** The employee signs first, the employer after, each once, while the agreement is not settled. */
export const awaits = (row: AgreementStateRow | null, party: SigningAgreementParty) =>
  !!row &&
  row.state === 'generated' &&
  (party === 'employee'
    ? row.employee_signed_at === null
    : row.employee_signed_at !== null && row.employer_signed_at === null && !!row.storage_path);

export const awaitedParty = (row: AgreementStateRow): SigningAgreementParty | null =>
  awaits(row, 'employee') ? 'employee' : awaits(row, 'employer') ? 'employer' : null;
