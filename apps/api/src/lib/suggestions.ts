export function pickSuggestions(values: Iterable<string>, query: string, limit = 20) {
  const needle = query.toLocaleLowerCase('ro');
  const seen = new Set<string>();
  const items: string[] = [];
  for (const value of values) {
    const key = value.toLocaleLowerCase('ro');
    if (seen.has(key) || !key.includes(needle)) continue;
    seen.add(key);
    items.push(value);
    if (items.length === limit) break;
  }
  return items;
}
