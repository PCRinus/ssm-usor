import { randomUUID } from 'node:crypto';

import type { Database } from '../../src/database.types';
import {
  officeEvaluation,
  type RiskEvaluationFixture,
  sensitiveGroupsEvaluation,
  workshopEvaluation,
} from '../../src/modules/documents/risk-evaluations.fixture';
import { officeJobTitles } from './seed-employees';
import type { SeedClient } from './seed-organization';

type Tables = Database['public']['Tables'];
type EvaluationInsert = Tables['risk_evaluations']['Insert'];
type FactorInsert = Tables['risk_factors']['Insert'];
type MeasureInsert = Tables['prevention_measures']['Insert'];

export function evaluationFor(jobTitle: string): RiskEvaluationFixture {
  return officeJobTitles.includes(jobTitle) ? officeEvaluation : workshopEvaluation;
}

export type EvaluationRows = {
  evaluation: EvaluationInsert;
  factors: FactorInsert[];
  measures: MeasureInsert[];
};

export function evaluationRows(
  subject: { organizationId: string; clientId: string; createdBy: string } & (
    { kind: 'job_position'; jobPositionId: string } | { kind: 'sensitive_groups' }
  ),
  fixture: RiskEvaluationFixture & { workTask?: string; exposedPersons?: string },
  newId: () => string = randomUUID
): EvaluationRows {
  const owner = {
    organization_id: subject.organizationId,
    client_id: subject.clientId,
    created_by: subject.createdBy,
  };
  const evaluationId = newId();
  const factors: FactorInsert[] = [];
  const measures: MeasureInsert[] = [];
  fixture.factors.forEach((factor, factorIndex) => {
    const factorId = newId();
    factors.push({
      ...owner,
      id: factorId,
      evaluation_id: evaluationId,
      component: factor.component,
      factor_group: factor.group,
      description: factor.description,
      gravity_class: factor.gravityClass,
      probability_class: factor.probabilityClass,
      actions: factor.actions,
      deadline: factor.deadline,
      responsible_person: factor.responsiblePerson,
      observations: factor.observations,
      sort_order: factorIndex,
    });
    factor.measures.forEach((measure, measureIndex) => {
      measures.push({
        ...owner,
        factor_id: factorId,
        kind: measure.kind,
        description: measure.description,
        sort_order: measureIndex,
      });
    });
  });
  return {
    evaluation: {
      ...owner,
      id: evaluationId,
      kind: subject.kind,
      job_position_id: subject.kind === 'job_position' ? subject.jobPositionId : null,
      means_of_production: fixture.meansOfProduction,
      work_environment: fixture.workEnvironment,
      exposure: fixture.exposure,
      work_task: subject.kind === 'job_position' ? null : (fixture.workTask ?? null),
      exposed_persons: subject.kind === 'job_position' ? null : (fixture.exposedPersons ?? null),
    },
    factors,
    measures,
  };
}

async function inChunks<Row>(
  what: string,
  rows: Row[],
  insert: (chunk: Row[]) => PromiseLike<{ error: { message: string } | null }>
) {
  for (let start = 0; start < rows.length; start += 500) {
    const { error } = await insert(rows.slice(start, start + 500));
    if (error) throw new Error(`Could not seed ${what}: ${error.message}`);
  }
}

// Only what is not evaluated yet is touched, so a rerun leaves alone what was entered by hand.
export async function seedRiskEvaluations(
  db: SeedClient,
  organizationId: string,
  createdBy: string
) {
  const [clients, positions, existing] = await Promise.all([
    // A lead has no evaluations, and an archived client's rows stay as they are.
    db
      .from('clients')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('stage', 'client')
      .is('archived_at', null),
    db
      .from('job_positions')
      .select('id, client_id, name')
      .eq('organization_id', organizationId)
      .is('archived_at', null),
    db
      .from('risk_evaluations')
      .select('client_id, kind, job_position_id')
      .eq('organization_id', organizationId),
  ]);
  if (clients.error) throw new Error(`Could not read clients: ${clients.error.message}`);
  if (positions.error) throw new Error(`Could not read job positions: ${positions.error.message}`);
  if (existing.error) {
    throw new Error(`Could not read risk evaluations: ${existing.error.message}`);
  }
  const active = new Set(clients.data.map((client) => client.id));
  const evaluatedPositions = new Set(existing.data.map((row) => row.job_position_id));
  const withSensitiveGroups = new Set(
    existing.data.filter((row) => row.kind === 'sensitive_groups').map((row) => row.client_id)
  );
  const owner = { organizationId, createdBy };
  const seeded = [
    ...positions.data
      .filter((position) => active.has(position.client_id) && !evaluatedPositions.has(position.id))
      .map((position) =>
        evaluationRows(
          {
            ...owner,
            clientId: position.client_id,
            kind: 'job_position',
            jobPositionId: position.id,
          },
          evaluationFor(position.name)
        )
      ),
    ...[...active]
      .filter((clientId) => !withSensitiveGroups.has(clientId))
      .map((clientId) =>
        evaluationRows({ ...owner, clientId, kind: 'sensitive_groups' }, sensitiveGroupsEvaluation)
      ),
  ];
  await inChunks(
    'risk evaluations',
    seeded.map((rows) => rows.evaluation),
    (chunk) => db.from('risk_evaluations').insert(chunk)
  );
  await inChunks(
    'risk factors',
    seeded.flatMap((rows) => rows.factors),
    (chunk) => db.from('risk_factors').insert(chunk)
  );
  await inChunks(
    'prevention measures',
    seeded.flatMap((rows) => rows.measures),
    (chunk) => db.from('prevention_measures').insert(chunk)
  );
  return {
    positions: seeded.filter((rows) => rows.evaluation.kind === 'job_position').length,
    sensitiveGroups: seeded.filter((rows) => rows.evaluation.kind === 'sensitive_groups').length,
  };
}
