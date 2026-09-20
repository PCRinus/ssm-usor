import { normalizeSearch } from '../clients/caen-filter';

// Item search text is "<name>|<parent>". A name that starts with the query ranks first, then
// one whose words start with every word typed ("sector 3" finds "Sectorul 3"), then the
// commune or town the locality belongs to.
export function localityFilter(value: string, search: string) {
  const query = normalizeSearch(search).trim();
  if (!query) return 1;
  const [rawName = '', rawParent = ''] = value.split('|');
  const name = normalizeSearch(rawName);
  if (name.startsWith(query)) return 1;
  const words = name.split(/[\s-]+/);
  const typed = query.split(/[\s-]+/);
  if (typed.every((part) => words.some((word) => word.startsWith(part)))) return 0.8;
  const parent = normalizeSearch(rawParent).replace(/^(com\.|mun\.|oras) /, '');
  return parent.startsWith(query) ? 0.5 : 0;
}
