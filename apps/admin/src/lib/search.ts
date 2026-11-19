export const oneOf = <T extends string>(values: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;

// The first page is the address without a page, so a list has one address for it.
export function pageParam(value: unknown): number | undefined {
  const page = Number(value);
  return Number.isInteger(page) && page > 1 ? page : undefined;
}
