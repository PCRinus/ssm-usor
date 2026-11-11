import { foldText } from './match';
import type { ProposedFireEquipment, ProposedFireEquipmentCount, Source } from './proposal';

type ReadEquipment = Omit<ProposedFireEquipment, 'id'>;

// A scanned document is read a page at a time, and its pages are still one document.
const documentOf = (source: Source) => source.file.replace(/\s*\(pagina \d+\)$/, '');

const units = (entry: ReadEquipment) =>
  entry.count !== null && entry.count >= 1 ? entry.count : 1;

const roomCount = (entries: ReadEquipment[]) =>
  new Set(entries.map((entry) => foldText(entry.room ?? '')).filter((room) => room !== '')).size;

const typed = (entry: ReadEquipment) => entry.agent !== null && entry.capacity !== null;

// Entries with no workplace are one place among themselves, or one per name no workplace has.
const placeOf = (entry: ReadEquipment) =>
  entry.workplace.id ?? `?${foldText(entry.workplace.name ?? '')}`;

const keyOf = (entry: ReadEquipment) =>
  JSON.stringify([placeOf(entry), entry.kind, entry.agent, entry.capacity, entry.wheeled]);

function sourcesOf(entries: ReadEquipment[]) {
  const sources: Source[] = [];
  for (const source of entries.flatMap((entry) => entry.sources)) {
    if (!sources.some((known) => known.file === source.file && known.quote === source.quote)) {
      sources.push(source);
    }
  }
  return sources;
}

// Each file states a workplace's count once, so files are compared, never added: which file is
// current is the specialist's knowledge (ADR 041).
export function countedOnce(read: ReadEquipment[]): {
  fireEquipment: ProposedFireEquipment[];
  fireEquipmentCounts: ProposedFireEquipmentCount[];
} {
  // Another company's passages state nothing of this client's means.
  const counted = read.filter((entry) => entry.otherCompanyName === null);
  const typedGroups = new Map<string, Map<string, ReadEquipment>>();
  for (const entry of counted) {
    if (entry.kind !== 'extinguisher' || !typed(entry)) continue;
    const at = typedGroups.get(placeOf(entry)) ?? new Map<string, ReadEquipment>();
    if (!at.has(keyOf(entry))) at.set(keyOf(entry), entry);
    typedGroups.set(placeOf(entry), at);
  }
  // "Stingătoare cu pulbere" in a decision beside "P6" in the list of means is the same means
  // once the workplace has one type of extinguisher; with several, which one it is stays unknown.
  const groupKey = (entry: ReadEquipment) => {
    const at = typedGroups.get(placeOf(entry));
    if (entry.kind !== 'extinguisher' || typed(entry) || at?.size !== 1) return keyOf(entry);
    const [key, group] = [...at][0]!;
    const fits =
      (entry.agent === null || entry.agent === group.agent) &&
      (entry.capacity === null || entry.capacity === group.capacity) &&
      entry.wheeled === group.wheeled;
    return fits ? key : keyOf(entry);
  };
  const groups = new Map<string, ReadEquipment[]>();
  for (const entry of counted) {
    const key = groupKey(entry);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const dropped = new Set<ReadEquipment>();
  const choices: {
    first: ReadEquipment;
    options: { total: number; documents: ReadEquipment[][] }[];
  }[] = [];
  for (const entries of groups.values()) {
    const byDocument = new Map<string, ReadEquipment[]>();
    for (const entry of entries) {
      const document = documentOf(entry.sources[0]!);
      byDocument.set(document, [...(byDocument.get(document) ?? []), entry]);
    }
    if (byDocument.size < 2) continue;
    const options: { total: number; documents: ReadEquipment[][] }[] = [];
    for (const documentEntries of byDocument.values()) {
      const total = documentEntries.reduce((sum, entry) => sum + units(entry), 0);
      const known = options.find((option) => option.total === total);
      if (known) known.documents.push(documentEntries);
      else options.push({ total, documents: [documentEntries] });
    }
    for (const option of options) {
      const kept = option.documents.reduce((best, documentEntries) =>
        roomCount(documentEntries) > roomCount(best) ? documentEntries : best
      );
      for (const documentEntries of option.documents) {
        if (documentEntries !== kept) for (const entry of documentEntries) dropped.add(entry);
      }
      option.documents = [kept, ...option.documents.filter((each) => each !== kept)];
    }
    if (options.length > 1) {
      choices.push({ first: entries.find(typed) ?? entries[0]!, options });
    }
  }

  const ids = new Map<ReadEquipment, string>();
  const fireEquipment = read
    .filter((entry) => !dropped.has(entry))
    .map((entry, index) => {
      const id = `equipment-${index + 1}`;
      ids.set(entry, id);
      return { id, ...entry };
    });
  const fireEquipmentCounts = choices.map(({ first, options }, index) => ({
    id: `count-${index + 1}`,
    workplace: first.workplace,
    kind: first.kind,
    agent: first.agent,
    capacity: first.capacity,
    wheeled: first.wheeled,
    options: options.map((option) => ({
      total: option.total,
      sources: sourcesOf(option.documents.flat()),
      equipmentIds: option.documents[0]!.map((entry) => ids.get(entry)!),
    })),
  }));
  return { fireEquipment, fireEquipmentCounts };
}
