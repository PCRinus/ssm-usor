import {
  type EmployeeImportChanges,
  employeeImportChangesSchema,
  type EmployeeImportPeople,
  type EmployeeImportPersonState,
} from '@ssm-usor/contracts';
import {
  type EmployeeImportClient,
  type EmployeeImportProposal,
  employeeImportProposalSchema,
  type ExistingEmployee,
  type TrainingThemes,
} from '@ssm-usor/import';

import type { AdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { romanianDay } from '../documents/context';
import {
  type ClientTrainingFacts,
  clientTrainingFacts,
  proposalFromFacts,
} from '../trainings/client-facts';

type Db = DataClient | AdminClient;

export const romanianToday = (now = new Date()) => romanianDay(now.toISOString());

const pageSize = 1000;

// PostgREST answers at most a thousand rows a request, and a client's history is longer.
async function everyRow<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  context: string
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw fromDatabaseError(error as { code?: string; message?: string }, context);
    rows.push(...(data ?? []));
    if ((data ?? []).length < pageSize) return rows;
  }
}

export async function employeeImportClient(
  db: Db,
  clientId: string
): Promise<EmployeeImportClient> {
  const [positions, workplaces, employees, records, results] = await Promise.all([
    everyRow(
      (from, to) =>
        db
          .from('job_positions')
          .select('id, name')
          .eq('client_id', clientId)
          .is('archived_at', null)
          .order('id')
          .range(from, to),
      'employee import: job positions'
    ),
    everyRow(
      (from, to) =>
        db
          .from('client_workplaces')
          .select('id, name, address_line')
          .eq('client_id', clientId)
          .is('archived_at', null)
          .order('id')
          .range(from, to),
      'employee import: workplaces'
    ),
    everyRow(
      (from, to) =>
        db
          .from('employees')
          .select(
            'id, last_name, first_name, cnp, employee_number, birth_date, birth_place, home_address, education, qualification, blood_group, rh_factor, job_title, hired_at, terminated_at, workplace_id, job_position_id, commute_route, commute_minutes, email, phone'
          )
          .eq('client_id', clientId)
          .is('archived_at', null)
          .order('id')
          .range(from, to),
      'employee import: employees'
    ),
    everyRow(
      (from, to) =>
        db
          .from('training_records')
          .select('id, employee_id, phase, trainings!inner(domain, held_on)')
          .eq('client_id', clientId)
          .order('id')
          .range(from, to),
      'employee import: training records'
    ),
    everyRow(
      (from, to) =>
        db
          .from('test_results')
          .select('id, employee_id, domain, test, taken_on')
          .eq('client_id', clientId)
          .order('id')
          .range(from, to),
      'employee import: test results'
    ),
  ]);
  return {
    jobPositions: positions,
    workplaces: workplaces.map((workplace) => ({
      id: workplace.id,
      name: workplace.name,
      addressLine: workplace.address_line,
    })),
    employees: employees.map((employee): ExistingEmployee & { jobPositionId: string | null } => ({
      id: employee.id,
      lastName: employee.last_name,
      firstName: employee.first_name,
      cnp: employee.cnp,
      employeeNumber: employee.employee_number,
      birthDate: employee.birth_date,
      birthPlace: employee.birth_place,
      homeAddress: employee.home_address,
      education: employee.education,
      qualification: employee.qualification,
      bloodGroup: employee.blood_group,
      rhFactor: employee.rh_factor,
      jobTitle: employee.job_title,
      hiredAt: employee.hired_at,
      terminatedAt: employee.terminated_at,
      workplaceId: employee.workplace_id,
      jobPositionId: employee.job_position_id,
      commuteRoute: employee.commute_route,
      commuteMinutes: employee.commute_minutes,
      hasContact: Boolean(employee.email || employee.phone),
      trainings: records
        .filter((record) => record.employee_id === employee.id)
        .map((record) => ({
          domain: record.trainings.domain,
          phase: record.phase,
          heldOn: record.trainings.held_on,
        })),
      testResults: results
        .filter((result) => result.employee_id === employee.id)
        .map((result) => ({
          domain: result.domain,
          test: result.test,
          takenOn: result.taken_on,
        })),
    })),
  };
}

export async function clientTrainingThemes(
  db: Db,
  input: { clientId: string; organizationId: string; createdBy: string | null; today: string }
): Promise<TrainingThemes> {
  const facts = await clientTrainingFacts(db, {
    clientId: input.clientId,
    organizationId: input.organizationId,
    specialistUserId: input.createdBy,
  });
  return themesFromFacts(facts, input.today);
}

export function themesFromFacts(facts: ClientTrainingFacts, today: string): TrainingThemes {
  return (query) => {
    const proposal = proposalFromFacts(facts, { ...query, heldOn: query.heldOn ?? today });
    // A periodic session is the month's: an undated row has none of its own.
    const undatedPeriodic = query.heldOn === null && query.phase === 'periodic';
    return {
      trainerName: proposal.trainer?.name ?? null,
      trainerJobTitle: proposal.trainer?.jobTitle ?? null,
      material: undatedPeriodic ? null : proposal.material,
      durationMinutes: proposal.durationMinutes,
    };
  };
}

export function storedEmployeeProposal(value: unknown): EmployeeImportProposal | null {
  if (value === null || typeof value !== 'object') return null;
  const proposal = employeeImportProposalSchema.safeParse(value);
  return proposal.success ? proposal.data : null;
}

export function storedEmployeeChanges(value: unknown): EmployeeImportChanges | null {
  if (value === null) return null;
  const changes = employeeImportChangesSchema.safeParse(value);
  return changes.success ? changes.data : null;
}

export function personStates(
  proposal: { people: readonly { id: string }[] },
  changes: EmployeeImportChanges | null
): Record<string, EmployeeImportPersonState> {
  return Object.fromEntries(
    proposal.people.map((person) => [
      person.id,
      changes?.people[person.id]?.state ?? ('to_check' as const),
    ])
  );
}

export function peopleCounts(
  states: Record<string, EmployeeImportPersonState>
): EmployeeImportPeople {
  const all = Object.values(states);
  return {
    total: all.length,
    toCheck: all.filter((state) => state === 'to_check').length,
    checked: all.filter((state) => state === 'checked').length,
    setAside: all.filter((state) => state === 'set_aside').length,
  };
}
