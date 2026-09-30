import { normalizeSearch } from './caen-filter';

// Item search text is "<name>|<code>". Matches the name from its start or any word,
// or the registration code exactly.
export function countyFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const [rawName = '', code = ''] = value.split('|');
  const name = normalizeSearch(rawName);
  if (name.startsWith(query)) return 1;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(query))) return 0.8;
  if (code.toLowerCase() === query) return 0.9;
  return 0;
}
