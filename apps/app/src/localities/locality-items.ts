import type { ComboboxItem } from '../components/search-combobox';

export type Locality = [name: string, parent: string];

// The value is the text documents print, not a code. A name several localities of the county
// share carries its commune or town, so the address says which one.
export function localityItems(localities: readonly Locality[]): ComboboxItem[] {
  const count = new Map<string, number>();
  for (const [name] of localities) count.set(name, (count.get(name) ?? 0) + 1);
  return localities.map(([name, parent]) => ({
    value: count.get(name)! > 1 ? `${name} (${parent})` : name,
    label: name,
    // "Satchinez, com. Satchinez" says nothing; "Bărăteaz, com. Satchinez" is why a search for
    // the commune finds the village.
    // A name the county has twice keeps it either way, to tell the two apart.
    description: count.get(name) === 1 && parent.replace(/^\S+ /, '') === name ? undefined : parent,
    search: `${name}|${parent}`,
  }));
}
