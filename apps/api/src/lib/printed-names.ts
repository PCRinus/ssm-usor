import { type DocumentSet, withLegalFormsKept } from '@ssm-usor/contracts';

const legalNameOf = (party: unknown) => {
  const name = (party as { legalName?: unknown } | null)?.legalName;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
};

const everyString = (value: unknown, change: (text: string) => string): unknown => {
  if (typeof value === 'string') return change(value);
  if (Array.isArray(value)) return value.map((item) => everyString(item, change));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, everyString(item, change)])
    );
  }
  return value;
};

/**
 * The client's and the provider's names wherever the data prints them, with no-break spaces
 * that keep a legal form on its name's line. In the file only: the snapshot keeps the names as
 * stored, which the data is compared with.
 */
export const printedNames =
  (set: DocumentSet) =>
  (data: Record<string, unknown>): Record<string, unknown> => {
    if (set !== 'occupational_safety') return data;
    const names = [legalNameOf(data.client), legalNameOf(data.provider)]
      .filter((name): name is string => name !== null)
      .map((name) => [name, withLegalFormsKept(name)] as const)
      .filter(([name, kept]) => name !== kept)
      .sort(([a], [b]) => b.length - a.length);
    if (names.length === 0) return data;
    return everyString(data, (text) =>
      names.reduce((printed, [name, kept]) => printed.replaceAll(name, kept), text)
    ) as Record<string, unknown>;
  };
