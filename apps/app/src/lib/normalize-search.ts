// Lowercase without diacritics, so "extractia" finds "Extracția".
export const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
