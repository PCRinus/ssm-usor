import type { ProposedFireEquipment, ProposedFireEquipmentCount, Source } from './proposal';

type ReadEquipment = Omit<ProposedFireEquipment, 'id'>;

// A scanned document is read a page at a time, and its pages are still one document.
const documentOf = (source: Source) => source.file.replace(/\s*\(pagina \d+\)$/, '');

const units = (entry: ReadEquipment) =>
  entry.count !== null && entry.count >= 1 ? entry.count : 1;

const namesRooms = (entries: ReadEquipment[]) =>
  entries.some((entry) => entry.room !== null && entry.room.trim() !== '');

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
  const groups = new Map<string, ReadEquipment[]>();
  for (const entry of read) {
    // Another company's passages state nothing of this client's means, and an entry with no
    // workplace waits for the member to place it.
    if (entry.workplace.id === null || entry.otherCompanyName !== null) continue;
    const key = JSON.stringify([
      entry.workplace.id,
      entry.kind,
      entry.agent,
      entry.capacity,
      entry.wheeled,
    ]);
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
      const kept = option.documents.find(namesRooms) ?? option.documents[0]!;
      for (const documentEntries of option.documents) {
        if (documentEntries !== kept) for (const entry of documentEntries) dropped.add(entry);
      }
      option.documents = [kept, ...option.documents.filter((each) => each !== kept)];
    }
    if (options.length > 1) choices.push({ first: entries[0]!, options });
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
