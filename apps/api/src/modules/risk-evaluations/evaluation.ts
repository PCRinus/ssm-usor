import {
  evaluationGlobalRiskLevel,
  type RiskEvaluation,
  type RiskEvaluationKind,
  type RiskEvaluationSummary,
  type RiskFactor,
  type RiskFactorRequest,
  type RiskFactorSourceProfile,
  riskLevel,
  riskLevelTotals,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

type Tables = Database['public']['Tables'];

export type RiskFactorFields = Pick<
  Tables['risk_factors']['Row'],
  | 'id'
  | 'component'
  | 'factor_group'
  | 'description'
  | 'gravity_class'
  | 'probability_class'
  | 'actions'
  | 'deadline'
  | 'responsible_person'
  | 'observations'
  | 'sort_order'
  | 'created_at'
  | 'updated_at'
>;

export type PreventionMeasureFields = Pick<
  Tables['prevention_measures']['Row'],
  'id' | 'kind' | 'description' | 'sort_order'
>;

export const riskFactorFieldColumns =
  'id, component, factor_group, description, gravity_class, probability_class, actions, deadline, responsible_person, observations, sort_order, created_at, updated_at';

export const preventionMeasureFieldColumns = 'id, kind, description, sort_order';

type SourceProfileFactor = { evaluation_profiles: RiskFactorSourceProfile } | null;

export type EvaluationRow = Pick<
  Tables['risk_evaluations']['Row'],
  | 'id'
  | 'client_id'
  | 'kind'
  | 'name'
  | 'means_of_production'
  | 'work_task'
  | 'exposed_persons'
  | 'work_environment'
  | 'exposure'
  | 'created_at'
  | 'updated_at'
> & {
  job_positions: { id: string; name: string } | null;
  risk_factors: (RiskFactorFields & {
    prevention_measures: PreventionMeasureFields[];
    source_profile_factor: SourceProfileFactor;
  })[];
};

export const evaluationColumns = `id, client_id, kind, name, means_of_production, work_environment, exposure, work_task, exposed_persons, created_at, updated_at, job_positions(id, name), risk_factors(${riskFactorFieldColumns}, prevention_measures(${preventionMeasureFieldColumns}), source_profile_factor:evaluation_profile_factors(evaluation_profiles(id, name)))`;

export const bySortOrder = (
  a: { sort_order: number; id: string },
  b: { sort_order: number; id: string }
) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

export function toRiskFactor(
  factor: RiskFactorFields,
  measures: PreventionMeasureFields[],
  sourceProfile: RiskFactorSourceProfile | null = null
): RiskFactor {
  return {
    id: factor.id,
    component: factor.component,
    group: factor.factor_group,
    description: factor.description,
    gravityClass: factor.gravity_class,
    probabilityClass: factor.probability_class,
    riskLevel: riskLevel(factor.gravity_class, factor.probability_class),
    measures: [...measures].sort(bySortOrder).map((measure) => ({
      id: measure.id,
      kind: measure.kind,
      description: measure.description,
    })),
    actions: factor.actions,
    deadline: factor.deadline,
    responsiblePerson: factor.responsible_person,
    observations: factor.observations,
    sourceProfile,
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
  };
}

export function factorTotals(
  factors: Pick<RiskFactorFields, 'gravity_class' | 'probability_class'>[]
) {
  const classed = factors.map((f) => ({
    gravityClass: f.gravity_class,
    probabilityClass: f.probability_class,
  }));
  return { ...riskLevelTotals(classed), factorCount: classed.length };
}

export function toEvaluation(row: EvaluationRow): RiskEvaluation {
  const factors = [...row.risk_factors]
    .sort(bySortOrder)
    .map((factor) =>
      toRiskFactor(
        factor,
        factor.prevention_measures,
        factor.source_profile_factor?.evaluation_profiles ?? null
      )
    );
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind,
    jobPosition: row.job_positions,
    name: row.name,
    meansOfProduction: row.means_of_production,
    workTask: row.work_task,
    exposedPersons: row.exposed_persons,
    workEnvironment: row.work_environment,
    exposure: row.exposure,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const kindOrder: Record<RiskEvaluationKind, number> = {
  job_position: 0,
  sensitive_groups: 1,
  other: 2,
};

type Listed = Pick<RiskEvaluationSummary, 'id' | 'kind' | 'jobPosition' | 'name'>;

const listedLabel = (evaluation: Listed) => evaluation.jobPosition?.name ?? evaluation.name ?? '';

export const byEvaluationOrder = (a: Listed, b: Listed) =>
  kindOrder[a.kind] - kindOrder[b.kind] ||
  listedLabel(a).localeCompare(listedLabel(b), 'ro') ||
  a.id.localeCompare(b.id);

export const noSuchEvaluation = () =>
  new ApiError('not_found', 'This risk evaluation does not exist under this client.');

export async function findEvaluation(db: DataClient, clientId: string, evaluationId: string) {
  const { data, error } = await db
    .from('risk_evaluations')
    .select('id, kind')
    .eq('id', evaluationId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find risk evaluation');
  if (!data) throw noSuchEvaluation();
  return data;
}

export async function loadEvaluation(db: DataClient, evaluationId: string) {
  const { data, error } = await db
    .from('risk_evaluations')
    .select(evaluationColumns)
    .eq('id', evaluationId)
    .returns<EvaluationRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read risk evaluation');
  if (!data) throw noSuchEvaluation();
  return toEvaluation(data);
}

export function riskFactorArgs(body: RiskFactorRequest) {
  return {
    p_component: body.component,
    p_factor_group: body.group,
    p_description: body.description,
    p_gravity_class: body.gravityClass,
    p_probability_class: body.probabilityClass,
    p_measures: body.measures,
    // Left out, the database sets null: the generated types do not take null for these.
    p_actions: body.actions ?? undefined,
    p_deadline: body.deadline ?? undefined,
    p_responsible_person: body.responsiblePerson ?? undefined,
    p_observations: body.observations ?? undefined,
  };
}
