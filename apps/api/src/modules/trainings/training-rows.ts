import type { Training, TrainingAdmission } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';

type TrainingRow = Database['public']['Tables']['trainings']['Row'];
type RecordRow = Database['public']['Tables']['training_records']['Row'];

export const trainingColumns =
  'id, client_id, domain, phase, held_on, duration_minutes, material, trainer_name, trainer_job_title, verifier_name, verifier_job_title, supplementary_reason, source, themes_revision_id, notes, created_at, updated_at';

export function toTraining(row: Omit<TrainingRow, 'organization_id' | 'created_by'>): Training {
  return {
    id: row.id,
    clientId: row.client_id,
    domain: row.domain,
    phase: row.phase,
    heldOn: row.held_on,
    durationMinutes: row.duration_minutes,
    material: row.material,
    trainer: { name: row.trainer_name, jobTitle: row.trainer_job_title },
    verifier:
      row.verifier_name !== null && row.verifier_job_title !== null
        ? { name: row.verifier_name, jobTitle: row.verifier_job_title }
        : null,
    supplementaryReason: row.supplementary_reason,
    source: row.source,
    themesRevisionId: row.themes_revision_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAdmission(
  row: Pick<RecordRow, 'admitted_on' | 'admitted_by_name' | 'admitted_by_job_title'>
): TrainingAdmission | null {
  if (row.admitted_on === null || row.admitted_by_name === null) return null;
  return {
    admittedOn: row.admitted_on,
    name: row.admitted_by_name,
    jobTitle: row.admitted_by_job_title ?? '',
  };
}
