import type { JobPosition } from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { toTrainMatch } from '../employees/training-match';

type JobPositionRow = Pick<
  Database['public']['Tables']['job_positions']['Row'],
  | 'id'
  | 'client_id'
  | 'name'
  | 'staff_category'
  | 'work_zone'
  | 'activities'
  | 'training_interval_months'
  | 'needs_protective_equipment'
  | 'created_at'
  | 'updated_at'
>;

export const jobPositionColumns =
  'id, client_id, name, staff_category, work_zone, activities, training_interval_months, needs_protective_equipment, created_at, updated_at';

export type JobPositionCounts = {
  employees: number;
  employeesToTrain: number;
  equipment: number;
  instructions: number;
  fireInstructions: number;
};

const noCounts: JobPositionCounts = {
  employees: 0,
  employeesToTrain: 0,
  equipment: 0,
  instructions: 0,
  fireInstructions: 0,
};

export const toJobPosition = (
  row: JobPositionRow,
  counts: JobPositionCounts = noCounts
): JobPosition => ({
  id: row.id,
  clientId: row.client_id,
  name: row.name,
  staffCategory: row.staff_category,
  workZone: row.work_zone,
  activities: row.activities,
  trainingIntervalMonths: row.training_interval_months,
  employeeCount: counts.employees,
  employeesToTrainCount: counts.employeesToTrain,
  needsProtectiveEquipment: row.needs_protective_equipment,
  equipmentCount: counts.equipment,
  instructionCount: counts.instructions,
  fireInstructionCount: counts.fireInstructions,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const noSuchJobPosition = () =>
  new ApiError('not_found', 'This job position does not exist under this client.');

export async function findJobPosition(db: DataClient, clientId: string, jobPositionId: string) {
  const { data, error } = await db
    .from('job_positions')
    .select('id, needs_protective_equipment')
    .eq('id', jobPositionId)
    .eq('client_id', clientId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find job position');
  if (!data) throw noSuchJobPosition();
  return data;
}

export async function jobPositionCounts(db: DataClient, clientId: string, jobPositionId?: string) {
  // Counted by the database, one row per position, so a large client is not cut short by the
  // limit on rows a request returns.
  let query = db
    .from('job_positions')
    .select(
      'id, employees(count), to_train:employee_list(count), job_position_equipment(count), instructions:job_position_instructions(count), fire_instructions:job_position_instructions(count)'
    )
    .eq('client_id', clientId)
    .neq('employees.status', 'terminated')
    .is('employees.archived_at', null)
    // The workers list's scope and its "de instruit" filter, so the count is what its link shows.
    .neq('to_train.status', 'terminated')
    .is('to_train.archived_at', null)
    .or(toTrainMatch, { referencedTable: 'to_train' })
    .eq('instructions.domain', 'ssm')
    .eq('fire_instructions.domain', 'su');
  if (jobPositionId) query = query.eq('id', jobPositionId);
  const { data, error } = await query.returns<
    {
      id: string;
      employees: { count: number }[];
      to_train: { count: number }[];
      job_position_equipment: { count: number }[];
      instructions: { count: number }[];
      fire_instructions: { count: number }[];
    }[]
  >();
  if (error) throw fromDatabaseError(error, 'count by job position');
  return new Map(
    data.map((row) => [
      row.id,
      {
        employees: row.employees[0]?.count ?? 0,
        employeesToTrain: row.to_train[0]?.count ?? 0,
        equipment: row.job_position_equipment[0]?.count ?? 0,
        instructions: row.instructions[0]?.count ?? 0,
        fireInstructions: row.fire_instructions[0]?.count ?? 0,
      },
    ])
  );
}
