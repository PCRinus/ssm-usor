import type { RouteHandler } from '@hono/zod-openapi';
import {
  evaluationGlobalRiskLevel,
  type EvaluationProfile,
  type EvaluationProfileSummary,
  type RiskFactorRequest,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  bySortOrder,
  factorTotals,
  findEvaluation,
  loadEvaluation,
  preventionMeasureFieldColumns,
  type PreventionMeasureFields,
  riskFactorArgs,
  riskFactorFieldColumns,
  type RiskFactorFields,
  toRiskFactor,
} from '../risk-evaluations/handlers';
import type {
  applyEvaluationProfileRoute,
  createEvaluationProfileFactorRoute,
  createEvaluationProfileRoute,
  getEvaluationProfileRoute,
  listEvaluationProfilesRoute,
  removeEvaluationProfileFactorRoute,
  removeEvaluationProfileRoute,
  renameEvaluationProfileRoute,
  saveRiskEvaluationAsProfileRoute,
  updateEvaluationProfileFactorRoute,
} from './routes';

type ProfileRow = Pick<
  Database['public']['Tables']['evaluation_profiles']['Row'],
  'id' | 'name' | 'created_at' | 'updated_at'
>;

type FullProfileRow = ProfileRow & {
  evaluation_profile_factors: (RiskFactorFields & {
    evaluation_profile_measures: PreventionMeasureFields[];
  })[];
};

type SummaryRow = ProfileRow & {
  evaluation_profile_factors: Pick<RiskFactorFields, 'gravity_class' | 'probability_class'>[];
};

const profileColumns = `id, name, created_at, updated_at, evaluation_profile_factors(${riskFactorFieldColumns}, evaluation_profile_measures(${preventionMeasureFieldColumns}))`;

const summaryColumns =
  'id, name, created_at, updated_at, evaluation_profile_factors(gravity_class, probability_class)';

const collator = new Intl.Collator('ro');

function toProfile(row: FullProfileRow): EvaluationProfile {
  const factors = [...row.evaluation_profile_factors]
    .sort(bySortOrder)
    .map((factor) => toRiskFactor(factor, factor.evaluation_profile_measures));
  return {
    id: row.id,
    name: row.name,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: SummaryRow): EvaluationProfileSummary {
  return {
    id: row.id,
    name: row.name,
    ...factorTotals(row.evaluation_profile_factors),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const noSuchProfile = () =>
  new ApiError('not_found', 'This evaluation profile does not exist in your organization.');

const noSuchFactor = () =>
  new ApiError('not_found', 'This risk factor does not exist on this profile.');

const nameTaken = () =>
  new ApiError(
    'conflict',
    'The library already has a profile of this name.',
    [{ path: 'name', message: 'The library already has a profile of this name.' }],
    'evaluation_profile_name_taken'
  );

async function loadProfile(db: DataClient, profileId: string) {
  const { data, error } = await db
    .from('evaluation_profiles')
    .select(profileColumns)
    .eq('id', profileId)
    .returns<FullProfileRow[]>()
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'read evaluation profile');
  if (!data) throw noSuchProfile();
  return toProfile(data);
}

async function findProfile(db: DataClient, profileId: string) {
  const { data, error } = await db
    .from('evaluation_profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'find evaluation profile');
  if (!data) throw noSuchProfile();
}

export const listEvaluationProfiles: RouteHandler<
  typeof listEvaluationProfilesRoute,
  ApiEnv
> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('evaluation_profiles')
    .select(summaryColumns)
    .returns<SummaryRow[]>();
  if (error) throw fromDatabaseError(error, 'list evaluation profiles');
  const items = data
    .map(toSummary)
    .sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
  return c.json({ items }, 200);
};

export const createEvaluationProfile: RouteHandler<
  typeof createEvaluationProfileRoute,
  ApiEnv
> = async (c) => {
  const { name } = c.req.valid('json');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('evaluation_profiles')
    .insert({
      organization_id: c.get('membership').organizationId,
      name,
      created_by: c.get('user').id,
    })
    .select('id')
    .single();
  if (error?.code === '23505') throw nameTaken();
  if (error) throw fromDatabaseError(error, 'create evaluation profile');
  return c.json({ profile: await loadProfile(db, data.id) }, 201);
};

export const getEvaluationProfile: RouteHandler<typeof getEvaluationProfileRoute, ApiEnv> = async (
  c
) => {
  const { profileId } = c.req.valid('param');
  return c.json({ profile: await loadProfile(createDataClient(c), profileId) }, 200);
};

export const renameEvaluationProfile: RouteHandler<
  typeof renameEvaluationProfileRoute,
  ApiEnv
> = async (c) => {
  const { profileId } = c.req.valid('param');
  const { name } = c.req.valid('json');
  const db = createDataClient(c);
  const { data, error } = await db
    .from('evaluation_profiles')
    .update({ name })
    .eq('id', profileId)
    .select('id');
  if (error?.code === '23505') throw nameTaken();
  if (error) throw fromDatabaseError(error, 'rename evaluation profile');
  if (data.length === 0) throw noSuchProfile();
  return c.json({ profile: await loadProfile(db, profileId) }, 200);
};

export const removeEvaluationProfile: RouteHandler<
  typeof removeEvaluationProfileRoute,
  ApiEnv
> = async (c) => {
  const { profileId } = c.req.valid('param');
  const { data, error } = await createDataClient(c)
    .from('evaluation_profiles')
    .delete()
    .eq('id', profileId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete evaluation profile');
  if (data.length === 0) throw noSuchProfile();
  return c.body(null, 204);
};

async function saveFactor(
  db: DataClient,
  profileId: string,
  factorId: string | undefined,
  body: RiskFactorRequest
) {
  const { data, error } = await db.rpc('save_evaluation_profile_factor', {
    p_profile_id: profileId,
    p_factor_id: factorId,
    ...riskFactorArgs(body),
  });
  if (error) throw fromDatabaseError(error, 'save evaluation profile factor');
  return data;
}

export const createEvaluationProfileFactor: RouteHandler<
  typeof createEvaluationProfileFactorRoute,
  ApiEnv
> = async (c) => {
  const { profileId } = c.req.valid('param');
  const db = createDataClient(c);
  const saved = await saveFactor(db, profileId, undefined, c.req.valid('json'));
  if (!saved) throw noSuchProfile();
  return c.json({ profile: await loadProfile(db, profileId) }, 201);
};

export const updateEvaluationProfileFactor: RouteHandler<
  typeof updateEvaluationProfileFactorRoute,
  ApiEnv
> = async (c) => {
  const { profileId, factorId } = c.req.valid('param');
  const db = createDataClient(c);
  await findProfile(db, profileId);
  const saved = await saveFactor(db, profileId, factorId, c.req.valid('json'));
  if (!saved) throw noSuchFactor();
  return c.json({ profile: await loadProfile(db, profileId) }, 200);
};

export const removeEvaluationProfileFactor: RouteHandler<
  typeof removeEvaluationProfileFactorRoute,
  ApiEnv
> = async (c) => {
  const { profileId, factorId } = c.req.valid('param');
  const db = createDataClient(c);
  await findProfile(db, profileId);
  const { data, error } = await db
    .from('evaluation_profile_factors')
    .delete()
    .eq('id', factorId)
    .eq('profile_id', profileId)
    .select('id');
  if (error) throw fromDatabaseError(error, 'delete evaluation profile factor');
  if (data.length === 0) throw noSuchFactor();
  return c.json({ profile: await loadProfile(db, profileId) }, 200);
};

export const saveRiskEvaluationAsProfile: RouteHandler<
  typeof saveRiskEvaluationAsProfileRoute,
  ApiEnv
> = async (c) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const { name } = c.req.valid('json');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const { data, error } = await db.rpc('save_risk_evaluation_as_profile', {
    p_evaluation_id: evaluationId,
    p_name: name,
  });
  if (error?.code === '23505') throw nameTaken();
  if (error) throw fromDatabaseError(error, 'save risk evaluation as profile');
  if (!data) {
    throw new ApiError('not_found', 'This risk evaluation does not exist under this client.');
  }
  return c.json({ profile: await loadProfile(db, data) }, 201);
};

export const applyEvaluationProfile: RouteHandler<
  typeof applyEvaluationProfileRoute,
  ApiEnv
> = async (c) => {
  const { clientId, evaluationId } = c.req.valid('param');
  const { profileId } = c.req.valid('json');
  const db = createDataClient(c);
  await findEvaluation(db, clientId, evaluationId);
  const { data, error } = await db.rpc('apply_evaluation_profile', {
    p_evaluation_id: evaluationId,
    p_profile_id: profileId,
  });
  if (error?.code === 'RSK02') {
    throw new ApiError('validation_error', 'Apply a profile of your library.', [
      { path: 'profileId', message: 'Choose a profile of your library.' },
    ]);
  }
  if (error) throw fromDatabaseError(error, 'apply evaluation profile');
  return c.json(
    { evaluation: await loadEvaluation(db, evaluationId), addedFactorCount: data ?? 0 },
    200
  );
};
