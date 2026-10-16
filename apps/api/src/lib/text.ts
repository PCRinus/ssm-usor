export const filled = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;
