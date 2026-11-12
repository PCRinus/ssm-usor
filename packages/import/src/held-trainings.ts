import type {
  SupplementaryTrainingReason,
  TrainingDomain,
  TrainingPhase,
} from '@ssm-usor/contracts';

import { foldName, foldText } from './match';

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

const folded = (value: string | null, fold: (value: string) => string) =>
  value === null ? null : fold(value);

// A training held has one duration and one material, while the periodic material differs per
// post, so rows that differ in any of them stay separate trainings held on the same day
// (Mircea, 2026-10-31). The reason, the trainer's function and the verifier are columns of the
// training too: rows that differ in them stay apart rather than lend one person's sheet to
// another's record (ADR 042). A value two rows both lack is the same on both.
const heldKey = (row: HeldRow) =>
  JSON.stringify([
    row.domain,
    row.phase,
    row.heldOn,
    folded(row.trainerName, foldName),
    folded(row.trainerJobTitle, foldText),
    folded(row.verifierName, foldName),
    folded(row.verifierJobTitle, foldText),
    row.durationMinutes,
    folded(row.material, foldText),
    row.supplementaryReason,
  ]);

export function groupHeldTrainings(rows: readonly HeldRow[]): HeldTraining[] {
  const held = new Map<string, HeldTraining>();
  for (const row of rows) {
    const key = heldKey(row);
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
