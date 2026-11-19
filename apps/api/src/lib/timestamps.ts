export const toIso = (value: string) => new Date(value).toISOString();

export const toIsoOrNull = (value: string | null) => (value ? toIso(value) : null);
