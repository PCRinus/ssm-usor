import {
  heldTrainingKey,
  type SupplementaryTrainingReason,
  type TrainingDomain,
  type TrainingPhase,
} from '@ssm-usor/contracts';

export interface HeldRow {
  rowId: string;
  personId: string;
  domain: TrainingDomain;
  phase: TrainingPhase;
  heldOn: string;
  // Null where the sheet does not write it (ADR 042).
  durationMinutes: number | null;
  trainerName: string | null;
  trainerJobTitle: string | null;
  verifierName: string | null;
  verifierJobTitle: string | null;
  material: string | null;
  supplementaryReason: SupplementaryTrainingReason | null;
}

export interface HeldTraining {
  // The first row's id, stable while that row stays in.
  key: string;
  domain: TrainingDomain;
  phase: TrainingPhase;
  heldOn: string;
  durationMinutes: number | null;
  trainerName: string | null;
  trainerJobTitle: string | null;
  verifierName: string | null;
  verifierJobTitle: string | null;
  material: string | null;
  supplementaryReason: SupplementaryTrainingReason | null;
  rows: { rowId: string; personId: string }[];
}

export function groupHeldTrainings(rows: readonly HeldRow[]): HeldTraining[] {
  const held = new Map<string, HeldTraining>();
  for (const row of rows) {
    const key = heldTrainingKey(row);
    const known = held.get(key);
    if (!known) {
      held.set(key, {
        key: row.rowId,
        domain: row.domain,
        phase: row.phase,
        heldOn: row.heldOn,
        durationMinutes: row.durationMinutes,
        trainerName: row.trainerName,
        trainerJobTitle: row.trainerJobTitle,
        verifierName: row.verifierName,
        verifierJobTitle: row.verifierJobTitle,
        material: row.material,
        supplementaryReason: row.supplementaryReason,
        rows: [{ rowId: row.rowId, personId: row.personId }],
      });
      continue;
    }
    if (known.rows.some((each) => each.personId === row.personId)) continue;
    known.rows.push({ rowId: row.rowId, personId: row.personId });
  }
  return [...held.values()];
}
