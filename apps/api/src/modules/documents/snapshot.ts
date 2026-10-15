import type { InstructionDomain } from '@ssm-usor/contracts';

import type { Json } from '../../database.types';

const annexDomains: Partial<Record<string, InstructionDomain>> = {
  own_instructions: 'ssm',
  fire_own_instructions: 'psi',
};

/** Null for a document that annexes nothing, whatever its snapshot holds. */
export const annexDomainOf = (typeKey: string) => annexDomains[typeKey] ?? null;

const annexList = (snapshot: Json | null): unknown[] | null => {
  const annexes = (snapshot as { annexes?: unknown } | null)?.annexes;
  return Array.isArray(annexes) ? annexes : null;
};

/**
 * The version ids of the instruction modules a snapshot annexes (ADR 012), as either set's own
 * instructions list them under `annexes`. Any other document annexes nothing.
 */
export function annexedVersionIds(snapshot: Json | null): string[] {
  return annexedEntries(snapshot).map((annex) => annex.versionId);
}

const annexedEntries = (snapshot: Json | null) =>
  (annexList(snapshot) ?? []).filter(
    (annex): annex is Record<string, unknown> & { versionId: string } =>
      typeof (annex as { versionId?: unknown })?.versionId === 'string'
  );

/**
 * One per entry of `annexedVersionIds`, in its order. A value missing here is not checked:
 * the engine refuses to merge without it.
 */
export function annexTitlePagesData(snapshot: Json | null): Record<string, unknown>[] {
  const printed = (snapshot ?? {}) as Record<string, unknown>;
  return annexedEntries(snapshot).map((annex) => ({
    branding: printed.branding,
    issueDate: printed.issueDate,
    provider: printed.provider,
    client: printed.client,
    // Only the fire-safety set's page prints it, where the other prints the provider's
    // representative.
    fireSafetyTechnician: printed.fireSafetyTechnician,
    number: annex.number,
    title: annex.title,
    versionDate: annex.versionDate,
  }));
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
