import type { RouteHandler } from '@hono/zod-openapi';
import {
  clientLevelEvaluationFields,
  evaluationGlobalRiskLevel,
  isUnacceptableRiskLevel,
  type RiskEvaluation,
  type RiskEvaluationKind,
  type RiskEvaluationSummary,
  type RiskFactorRequest,
  type RiskFactorSuggestionField,
  riskLevel,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import { findJobPosition } from '../job-positions/handlers';
import type {
  copyRiskFactorsRoute,
  createRiskEvaluationRoute,
  createRiskFactorRoute,
  getJobPositionRiskEvaluationRoute,
  getRiskEvaluationRoute,
  listRiskEvaluationsRoute,
  removeRiskEvaluationRoute,
  removeRiskFactorRoute,
  reorderRiskFactorsRoute,
  riskFactorSuggestionsRoute,
  updateRiskEvaluationRoute,
  updateRiskFactorRoute,
} from './routes';

type Tables = Database['public']['Tables'];
type EvaluationRow = Pick<
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
  risk_factors: (Pick<
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
  > & {
    prevention_measures: Pick<
      Tables['prevention_measures']['Row'],
      'id' | 'kind' | 'description' | 'sort_order'
    >[];
  })[];
};

type SummaryRow = Pick<
  Tables['risk_evaluations']['Row'],
  'id' | 'client_id' | 'kind' | 'name' | 'created_at' | 'updated_at'
> & {
  job_positions: { id: string; name: string; archived_at: string | null } | null;
  risk_factors: Pick<Tables['risk_factors']['Row'], 'gravity_class' | 'probability_class'>[];
};

const evaluationColumns =
  'id, client_id, kind, name, means_of_production, work_environment, exposure, work_task, exposed_persons, created_at, updated_at, job_positions(id, name), risk_factors(id, component, factor_group, description, gravity_class, probability_class, actions, deadline, responsible_person, observations, sort_order, created_at, updated_at, prevention_measures(id, kind, description, sort_order))';

const summaryColumns =
  'id, client_id, kind, name, created_at, updated_at, job_positions(id, name, archived_at), risk_factors(gravity_class, probability_class)';

const bySortOrder = (
  a: { sort_order: number; id: string },
  b: { sort_order: number; id: string }
) => a.sort_order - b.sort_order || a.id.localeCompare(b.id);

function toEvaluation(row: EvaluationRow): RiskEvaluation {
  const factors = [...row.risk_factors].sort(bySortOrder).map((factor) => ({
    id: factor.id,
    component: factor.component,
    group: factor.factor_group,
    description: factor.description,
    gravityClass: factor.gravity_class,
    probabilityClass: factor.probability_class,
    riskLevel: riskLevel(factor.gravity_class, factor.probability_class),
    measures: [...factor.prevention_measures].sort(bySortOrder).map((measure) => ({
      id: measure.id,
      kind: measure.kind,
      description: measure.description,
    })),
    actions: factor.actions,
    deadline: factor.deadline,
    responsiblePerson: factor.responsible_person,
    observations: factor.observations,
    createdAt: factor.created_at,
    updatedAt: factor.updated_at,
  }));
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

function toSummary(row: SummaryRow): RiskEvaluationSummary {
  const factors = row.risk_factors.map((f) => ({
    gravityClass: f.gravity_class,
    probabilityClass: f.probability_class,
  }));
  return {
    id: row.id,
    clientId: row.client_id,
    kind: row.kind,
    jobPosition: row.job_positions && { id: row.job_positions.id, name: row.job_positions.name },
    name: row.name,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
    factorCount: factors.length,
    unacceptableFactorCount: factors.filter((f) =>
      isUnacceptableRiskLevel(riskLevel(f.gravityClass, f.probabilityClass))
    ).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const kindOrder: Record<RiskEvaluationKind, number> = {
  job_position: 0,
  sensitive_groups: 1,
  other: 2,
};

const summaryLabel = (summary: RiskEvaluationSummary) =>
  summary.jobPosition?.name ?? summary.name ?? '';

const noSuchClient = () =>
  new ApiError('not_found', 'This client does not exist in your organization.');

const noSuchEvaluation = () =>
  new ApiError('not_found', 'This risk evaluation does not exist under this client.');

const noSuchFactor = () =>
  new ApiError('not_found', 'This risk factor does not exist on this evaluation.');

const nameTaken = () =>
  new ApiError(
    'conflict',
    'This client already has an evaluation of this name.',
    [{ path: 'name', message: 'This client already has an evaluation of this name.' }],
    'risk_evaluation_name_taken'
  );

const alreadyEvaluated = () =>
  new ApiError(
    'conflict',
    'This is evaluated already; open its evaluation instead.',
    undefined,
    'risk_evaluation_exists'
  );

async function findClient(db: DataClient, clientId: string) {
  const { data, error } = await db.from('clients').select('id').eq('id', clientId).maybeSingle();
  if (error) throw fromDatabaseError(error, 'find client');
  if (!data) throw noSuchClient();
}

async function findEvaluation(db: DataClient, clientId: string, evaluationId: string) {
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

async function loadEvaluation(db: DataClient, evaluationId: string) {
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

export const listRiskEvaluations: RouteHandler<typeof listRiskEvaluationsRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const db = createDataClient(c);
  await findClient(db, clientId);
  const { data, error } = await db
    .from('risk_evaluations')
    .select(summaryColumns)
    .eq('client_id', clientId)
    .returns<SummaryRow[]>();
  if (error) throw fromDatabaseError(error, 'list risk evaluations');
  const items = data
    .filter((row) => !row.job_positions?.archived_at)
    .map(toSummary)
    .sort(
      (a, b) =>
        kindOrder[a.kind] - kindOrder[b.kind] ||
        summaryLabel(a).localeCompare(summaryLabel(b), 'ro') ||
        a.id.localeCompare(b.id)
    );
  return c.json({ items }, 200);
};

export const createRiskEvaluation: RouteHandler<typeof createRiskEvaluationRoute, ApiEnv> = async (
  c
) => {
  const { clientId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  await findClient(db, clientId);
  if (body.kind === 'job_position') {
    await findJobPosition(db, clientId, body.jobPositionId).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'not_found') {
        throw new ApiError(
          'validation_error',
          'The position is not a current one of this client.',
          [{ path: 'jobPositionId', message: 'Choose a position of this client.' }]
        );
      }
      throw error;
    });
  }
  const { data, error } = await db
    .from('risk_evaluations')
    .insert({
      organization_id: c.get('membership').organizationId,
      client_id: clientId,
      kind: body.kind,
      job_position_id: body.kind === 'job_position' ? body.jobPositionId : null,
      name: body.kind === 'other' ? body.name : null,
      means_of_production: body.meansOfProduction ?? null,
      work_task: body.workTask ?? null,
      exposed_persons: body.exposedPersons ?? null,
      work_environment: body.workEnvironment ?? null,
      exposure: body.exposure,
      created_by: c.get('user').id,
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw body.kind === 'other' ? nameTaken() : alreadyEvaluated();
  if (error) throw fromDatabaseError(error, 'create risk evaluation');
  return c.json({ evaluation: await loadEvaluation(db, data.id) }, 201);
};

export const getRiskEvaluation: RouteHandler<typeof getRiskEvaluationRoute, ApiEnv> = async (c) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

export const getJobPositionRiskEvaluation: RouteHandler<
  typeof getJobPositionRiskEvaluationRoute,
  ApiEnv
> = async (c) => {
  const { clientId, jobPositionId } = c.req.valid('param');
  const db = createDataClient(c);
  await findJobPosition(db, clientId, jobPositionId);
  const { data, error } = await db
    .from('risk_evaluations')
    .select(evaluationColumns)
    .eq('job_position_id', jobPositionId)
    .eq('client_id', clientId)
    .returns<EvaluationRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read job position risk evaluation');
  return c.json({ evaluation: data ? toEvaluation(data) : null }, 200);
};

export const updateRiskEvaluation: RouteHandler<typeof updateRiskEvaluationRoute, ApiEnv> = async (
  c
) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const evaluation = await findEvaluation(db, clientId, evaluationId);
  if (body.name !== undefined && evaluation.kind !== 'other') {
    throw new ApiError('validation_error', 'Only an evaluation of kind `other` has a name.', [
      { path: 'name', message: 'This evaluation is named by its position or by the law.' },
    ]);
  }
  if (evaluation.kind === 'job_position') {
    const issues = clientLevelEvaluationFields
      .filter((field) => body[field] != null)
      .map((field) => ({
        path: field,
        message: 'A position evaluation reads this from its position.',
      }));
    if (issues.length > 0) {
      throw new ApiError(
        'validation_error',
        'A position evaluation reads its work task and exposed persons from the position.',
        issues
      );
    }
  }
  const changes: Tables['risk_evaluations']['Update'] = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.meansOfProduction !== undefined) changes.means_of_production = body.meansOfProduction;
  if (body.workEnvironment !== undefined) changes.work_environment = body.workEnvironment;
  if (body.exposure !== undefined) changes.exposure = body.exposure;
  if (body.workTask !== undefined) changes.work_task = body.workTask;
  if (body.exposedPersons !== undefined) changes.exposed_persons = body.exposedPersons;
  if (Object.keys(changes).length > 0) {
    const { error } = await db
      .from('risk_evaluations')
      .update(changes)
      .eq('id', evaluationId)
      .eq('client_id', clientId);
    if (error?.code === '23505') throw nameTaken();
    if (error) throw fromDatabaseError(error, 'update risk evaluation');
  }
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

export const removeRiskEvaluation: RouteHandler<typeof removeRiskEvaluationRoute, ApiEnv> = async (
  c
) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('risk_evaluations')
    .delete()
    .eq('id', evaluationId)
    .eq('client_id', clientId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete risk evaluation');
  if (data.length === 0) throw noSuchEvaluation();
  return c.body(null, 204);
};

async function saveFactor(
  db: DataClient,
  evaluationId: string,
  factorId: string | undefined,
  body: RiskFactorRequest
) {
  const { data, error } = await db.rpc('save_risk_factor', {
    p_evaluation_id: evaluationId,
    p_factor_id: factorId,
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
  });
  if (error) throw fromDatabaseError(error, 'save risk factor');
  return data;
}

export const createRiskFactor: RouteHandler<typeof createRiskFactorRoute, ApiEnv> = async (c) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const saved = await saveFactor(db, evaluationId, undefined, c.req.valid('json'));
  if (!saved) throw noSuchEvaluation();
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 201);
};

export const updateRiskFactor: RouteHandler<typeof updateRiskFactorRoute, ApiEnv> = async (c) => {
  const { clientId, evaluationId, factorId } = c.req.valid('param');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const saved = await saveFactor(db, evaluationId, factorId, c.req.valid('json'));
  if (!saved) throw noSuchFactor();
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

export const removeRiskFactor: RouteHandler<typeof removeRiskFactorRoute, ApiEnv> = async (c) => {
  const { clientId, evaluationId, factorId } = c.req.valid('param');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const { data, error } = await db
    .from('risk_factors')
    .delete()
    .eq('id', factorId)
    .eq('evaluation_id', evaluationId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete risk factor');
  if (data.length === 0) throw noSuchFactor();
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

export const reorderRiskFactors: RouteHandler<typeof reorderRiskFactorsRoute, ApiEnv> = async (
  c
) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const { factorIds } = c.req.valid('json');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const { data, error } = await db.rpc('reorder_risk_factors', {
    p_evaluation_id: evaluationId,
    p_factor_ids: factorIds,
  });
  if (error) throw fromDatabaseError(error, 'reorder risk factors');
  if (!data) {
    throw new ApiError('validation_error', 'Name every factor of the evaluation once.', [
      { path: 'factorIds', message: 'Name every factor of the evaluation once.' },
    ]);
  }
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

export const copyRiskFactors: RouteHandler<typeof copyRiskFactorsRoute, ApiEnv> = async (c) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const { fromEvaluationId } = c.req.valid('json');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const wrongSource = () =>
    new ApiError('validation_error', 'Copy from another evaluation of this client.', [
      { path: 'fromEvaluationId', message: 'Choose another evaluation of this client.' },
    ]);
  if (fromEvaluationId === evaluationId) throw wrongSource();
  const { error } = await db.rpc('copy_risk_factors', {
    p_evaluation_id: evaluationId,
    p_from_evaluation_id: fromEvaluationId,
  });
  if (error?.code === 'RSK01') throw wrongSource();
  if (error) throw fromDatabaseError(error, 'copy risk factors');
  return c.json({ evaluation: await loadEvaluation(db, evaluationId) }, 200);
};

const suggestionColumns = {
  group: 'factor_group',
  actions: 'actions',
  deadline: 'deadline',
  responsiblePerson: 'responsible_person',
} as const satisfies Record<RiskFactorSuggestionField, keyof Tables['risk_factors']['Row']>;

const suggestionLimit = 20;

export const listRiskFactorSuggestions: RouteHandler<
  typeof riskFactorSuggestionsRoute,
  ApiEnv
> = async (c) => {
  const { field, query } = c.req.valid('query');
  const column = suggestionColumns[field];
  // Filtered here, not in the query: a typed `%` or `,` would otherwise become part of the
  // PostgREST filter, and an organization's factors are a few thousand rows at most.
  const { data, error } = await createDataClient(c)
    .from('risk_factors')
    .select(`${column}, updated_at`)
    .not(column, 'is', null)
    .order('updated_at', { ascending: false })
    .limit(2000);
  if (error) throw fromDatabaseError(error, 'list risk factor suggestions');
  const needle = query.toLocaleLowerCase('ro');
  const seen = new Set<string>();
  const items: string[] = [];
  for (const row of data as unknown as Record<string, string>[]) {
    const value = row[column]!;
    const key = value.toLocaleLowerCase('ro');
    if (seen.has(key) || !key.includes(needle)) continue;
    seen.add(key);
    items.push(value);
    if (items.length === suggestionLimit) break;
  }
  return c.json({ items }, 200);
};
