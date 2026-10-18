import type { SigningAgreementParty } from '@ssm-usor/contracts';

export type AgreementStateRow = {
  state: string;
  storage_path: string | null;
  employee_signed_at: string | null;
  employer_signed_at: string | null;
};

/**
 * The employee signs first, from their first sign-in, before any member records the agreement
 * (ADR 023: the act is the first thing the portal offers); the employer after, each once, while
 * the agreement is not settled.
 */
export const awaits = (row: AgreementStateRow | null, party: SigningAgreementParty) =>
  party === 'employee'
    ? row === null || (row.state === 'generated' && row.employee_signed_at === null)
    : !!row &&
      row.state === 'generated' &&
      row.employee_signed_at !== null &&
      row.employer_signed_at === null &&
      !!row.storage_path;

export const awaitedParty = (row: AgreementStateRow): SigningAgreementParty | null =>
  awaits(row, 'employee') ? 'employee' : awaits(row, 'employer') ? 'employer' : null;
