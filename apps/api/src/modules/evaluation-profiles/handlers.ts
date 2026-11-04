import type { RouteHandler } from '@hono/zod-openapi';
import {
  evaluationGlobalRiskLevel,
  type EvaluationProfile,
  type EvaluationProfileSortKey,
  type EvaluationProfileSummary,
  type EvaluationProfileUse,
  pageRange,
  type RiskFactorRequest,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { createDataClient, type DataClient, fromDatabaseError } from '../../lib/db';
import type { ApiEnv } from '../../lib/env';
import { ApiError } from '../../lib/errors';
import {
  byEvaluationOrder,
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
  getEvaluationProfileUsageRoute,
  listEvaluationProfileChoicesRoute,
  listEvaluationProfilesRoute,
  removeEvaluationProfileFactorRoute,
  removeEvaluationProfileRoute,
  saveRiskEvaluationAsProfileRoute,
  updateEvaluationProfileFactorRoute,
  updateEvaluationProfileRoute,
} from './routes';

type Tables = Database['public']['Tables'];

// Read through the list view, whose columns the generated types make all nullable.
type ProfileRow = {
  id: string;
  name: string;
  archived_at: string | null;
  in_use: boolean;
  created_at: string;
  updated_at: string;
};

type FullProfileRow = ProfileRow & {
  means_of_production: string | null;
  work_environment: string | null;
  exposure: string | null;
  evaluation_profile_factors: (RiskFactorFields & {
    evaluation_profile_measures: PreventionMeasureFields[];
  })[];
};

type ClassedFactors = {
  evaluation_profile_factors: Pick<RiskFactorFields, 'gravity_class' | 'probability_class'>[];
};

type SummaryRow = ProfileRow & ClassedFactors & { client_count: number };

type ChoiceRow = Pick<ProfileRow, 'id' | 'name'> & ClassedFactors;

type LinkedFactorRow = {
  risk_evaluations: Pick<
    Tables['risk_evaluations']['Row'],
    'id' | 'client_id' | 'kind' | 'name'
  > & {
    job_positions: { id: string; name: string; archived_at: string | null } | null;
    clients: { legal_name: string; archived_at: string | null };
  };
};

const linkedFactorColumns =
  'evaluation_profile_factors!inner(profile_id), risk_evaluations!inner(id, client_id, kind, name, job_positions(id, name, archived_at), clients!risk_evaluations_client_id_fkey(legal_name, archived_at))';

const profileFieldColumns = 'id, name, archived_at, in_use, created_at, updated_at';

const profileColumns = `${profileFieldColumns}, means_of_production, work_environment, exposure, evaluation_profile_factors(${riskFactorFieldColumns}, evaluation_profile_measures(${preventionMeasureFieldColumns}))`;

const classedFactorColumns = 'evaluation_profile_factors(gravity_class, probability_class)';

const summaryColumns = `${profileFieldColumns}, client_count, ${classedFactorColumns}`;

// The id keeps every order stable across pages.
const sortColumns: Record<EvaluationProfileSortKey, string[]> = {
  name: ['name'],
  factorCount: ['factor_count', 'name'],
  clientCount: ['client_count', 'name'],
  updatedAt: ['updated_at'],
};

const collator = new Intl.Collator('ro');

function toProfile(row: FullProfileRow): EvaluationProfile {
  const factors = [...row.evaluation_profile_factors]
    .sort(bySortOrder)
    .map((factor) => toRiskFactor(factor, factor.evaluation_profile_measures));
  return {
    id: row.id,
    name: row.name,
    meansOfProduction: row.means_of_production,
    workEnvironment: row.work_environment,
    exposure: row.exposure,
    factors,
    globalRiskLevel: evaluationGlobalRiskLevel(factors),
    archivedAt: row.archived_at,
    inUse: row.in_use,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSummary(row: SummaryRow): EvaluationProfileSummary {
  return {
    id: row.id,
    name: row.name,
    ...factorTotals(row.evaluation_profile_factors),
    archivedAt: row.archived_at,
    inUse: row.in_use,
    clientCount: row.client_count,
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

const inUse = () =>
  new ApiError(
    'conflict',
    'Evaluarea este folosită la clienți, așa că nu se poate șterge. O poți arhiva.',
    undefined,
    'evaluation_profile_in_use'
  );

const profileArchived = () =>
  new ApiError(
    'conflict',
    'Evaluarea este arhivată. Reactiveaz-o ca să o aplici.',
    undefined,
    'evaluation_profile_archived'
  );

async function loadProfile(db: DataClient, profileId: string) {
  const { data, error } = await db
    .from('evaluation_profile_list')
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
  const { page, pageSize, sort, order, status } = c.req.valid('query');
  const db = createDataClient(c);
  const listed = () =>
    db
      .from('evaluation_profile_list')
      .select(summaryColumns, { count: 'exact' })
      .filter('archived_at', status === 'archived' ? 'not.is' : 'is', null);
  let query = listed();
  for (const column of sortColumns[sort]) {
    query = query.order(column, { ascending: order === 'asc' });
  }
  const { from, to } = pageRange(page, pageSize);
  const { data, error, count } = await query.order('id').range(from, to).returns<SummaryRow[]>();
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await listed().range(0, 0);
    if (recount.error) throw fromDatabaseError(recount.error, 'count evaluation profiles');
    return c.json({ items: [], page, pageSize, total: recount.count ?? 0 }, 200);
  }
  if (error) throw fromDatabaseError(error, 'list evaluation profiles');
  return c.json({ items: data.map(toSummary), page, pageSize, total: count ?? 0 }, 200);
};

export const listEvaluationProfileChoices: RouteHandler<
  typeof listEvaluationProfileChoicesRoute,
  ApiEnv
> = async (c) => {
  const { data, error } = await createDataClient(c)
    .from('evaluation_profile_list')
    .select(`id, name, ${classedFactorColumns}`)
    .is('archived_at', null)
    .gt('factor_count', 0)
    .order('name')
    .order('id')
    .returns<ChoiceRow[]>();
  if (error) throw fromDatabaseError(error, 'list evaluation profile choices');
  const items = data.map((row) => {
    const { globalRiskLevel, factorCount, unacceptableFactorCount } = factorTotals(
      row.evaluation_profile_factors
    );
    return { id: row.id, name: row.name, globalRiskLevel, factorCount, unacceptableFactorCount };
  });
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

export const updateEvaluationProfile: RouteHandler<
  typeof updateEvaluationProfileRoute,
  ApiEnv
> = async (c) => {
  const { profileId } = c.req.valid('param');
  const body = c.req.valid('json');
  const db = createDataClient(c);
  const changes: Tables['evaluation_profiles']['Update'] = {};
  if (body.name !== undefined) changes.name = body.name;
  if (body.archived !== undefined) {
    changes.archived_at = body.archived ? new Date().toISOString() : null;
  }
  if (body.meansOfProduction !== undefined) changes.means_of_production = body.meansOfProduction;
  if (body.workEnvironment !== undefined) changes.work_environment = body.workEnvironment;
  if (body.exposure !== undefined) changes.exposure = body.exposure;
  if (Object.keys(changes).length === 0) {
    await findProfile(db, profileId);
  } else {
    const { data, error } = await db
      .from('evaluation_profiles')
      .update(changes)
      .eq('id', profileId)
      .select('id');
    if (error?.code === '23505') throw nameTaken();
    if (error) throw fromDatabaseError(error, 'update evaluation profile');
    if (data.length === 0) throw noSuchProfile();
  }
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
  if (error?.code === 'RSK04') throw inUse();
  if (error) throw fromDatabaseError(error, 'delete evaluation profile');
  if (data.length === 0) throw noSuchProfile();
  return c.body(null, 204);
};

export const getEvaluationProfileUsage: RouteHandler<
  typeof getEvaluationProfileUsageRoute,
  ApiEnv
> = async (c) => {
  const { profileId } = c.req.valid('param');
  const db = createDataClient(c);
  await findProfile(db, profileId);
  const { data, error } = await db
    .from('risk_factors')
    .select(linkedFactorColumns)
    .eq('evaluation_profile_factors.profile_id', profileId)
    .returns<LinkedFactorRow[]>();
  if (error) throw fromDatabaseError(error, 'list evaluation profile usage');
  const uses = new Map<string, EvaluationProfileUse>();
  for (const { risk_evaluations: evaluation } of data) {
    if (evaluation.job_positions?.archived_at) continue;
    const use = uses.get(evaluation.id);
    if (use) {
      use.linkedFactorCount += 1;
      continue;
    }
    uses.set(evaluation.id, {
      id: evaluation.id,
      clientId: evaluation.client_id,
      clientName: evaluation.clients.legal_name,
      clientArchivedAt: evaluation.clients.archived_at,
      kind: evaluation.kind,
      jobPosition: evaluation.job_positions && {
        id: evaluation.job_positions.id,
        name: evaluation.job_positions.name,
      },
      name: evaluation.name,
      linkedFactorCount: 1,
    });
  }
  const items = [...uses.values()].sort(
    (a, b) =>
      collator.compare(a.clientName, b.clientName) ||
      a.clientId.localeCompare(b.clientId) ||
      byEvaluationOrder(a, b)
  );
  return c.json({ items }, 200);
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
  if (error?.code === 'RSK03') throw profileArchived();
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
