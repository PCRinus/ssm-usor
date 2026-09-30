// Lowercase without diacritics, so "extractia" finds "Extracția".
export const normalizeSearch = (value: string) =>
  value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// cmdk filter over "<code> <name>" values: code prefixes rank first, then names that
// contain every word of the query. Returns 0 to hide an entry.
export function caenFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const code = value.slice(0, 4);
  if (code.startsWith(query.replace(/\s+/g, ''))) return 1;
  const name = normalizeSearch(value.slice(5));
  const words = query.split(/\s+/);
  if (words.every((word) => name.includes(word))) return name.startsWith(query) ? 0.8 : 0.5;
  return 0;
}
