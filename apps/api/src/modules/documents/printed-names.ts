import { type DocumentSet, withLegalFormsKept } from '@ssm-usor/contracts';

const parties = ['client', 'provider'] as const;

const withNameKept = (party: unknown) =>
  party &&
  typeof party === 'object' &&
  typeof (party as { legalName?: unknown }).legalName === 'string'
    ? { ...party, legalName: withLegalFormsKept((party as { legalName: string }).legalName) }
    : party;

// In the file only: the snapshot keeps the names as stored, which the data is compared with.
export const printedNames =
  (set: DocumentSet) =>
  (data: Record<string, unknown>): Record<string, unknown> =>
    set === 'occupational_safety'
      ? Object.fromEntries(
          Object.entries(data).map(([name, value]) => [
            name,
            (parties as readonly string[]).includes(name) ? withNameKept(value) : value,
          ])
        )
      : data;
