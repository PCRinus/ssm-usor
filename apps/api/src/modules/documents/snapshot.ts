import type { Json } from '../../database.types';

const annexList = (snapshot: Json | null): unknown[] | null => {
  const annexes = (snapshot as { annexes?: unknown } | null)?.annexes;
  return Array.isArray(annexes) ? annexes : null;
};

/**
 * The version ids of the instruction modules a snapshot annexes (ADR 012), as the own
 * instructions' context lists them under `annexes`. Any other document annexes nothing.
 */
export function annexedVersionIds(snapshot: Json | null): string[] {
  return (annexList(snapshot) ?? []).flatMap((annex) =>
    typeof (annex as { versionId?: unknown })?.versionId === 'string'
      ? [(annex as { versionId: string }).versionId]
      : []
  );
}

export type SnapshotAnnex = { number: number; title: string; versionId: string };

/** Null when the snapshot has no list of annexes: another document, or an uploaded file. */
export function snapshotAnnexes(snapshot: Json | null): SnapshotAnnex[] | null {
  return (
    annexList(snapshot)?.filter(
      (annex): annex is SnapshotAnnex =>
        typeof (annex as Partial<SnapshotAnnex> | null)?.versionId === 'string' &&
        typeof (annex as Partial<SnapshotAnnex>).number === 'number' &&
        typeof (annex as Partial<SnapshotAnnex>).title === 'string'
    ) ?? null
  );
}
