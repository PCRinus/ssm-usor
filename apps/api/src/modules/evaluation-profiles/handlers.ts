import type { RouteHandler } from '@hono/zod-openapi';
import {
  evaluationGlobalRiskLevel,
  type EvaluationProfile,
  type EvaluationProfileListFilters,
  type EvaluationProfileSortKey,
  type EvaluationProfileSummary,
  type EvaluationProfileUse,
  type GlobalRiskLevelFilter,
  maxAcceptableGlobalRiskLevel,
  pageRange,
  type RiskFactorRequest,
  searchTerms,
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
import { storeMissingRiskLevels, storeRiskLevels } from './stored-risk-levels';

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

type ListView = Database['public']['Views']['evaluation_profile_list']['Row'];

// The generated types make every column of a view nullable; these are never null by the view's
// own definition.
type SummaryColumn =
  | 'id'
  | 'name'
  | 'in_use'
  | 'created_at'
  | 'updated_at'
  | 'client_count'
  | 'sheet_count'
  | 'factor_count'
  | 'unacceptable_factor_count';

type SummaryRow = { [Column in SummaryColumn]: NonNullable<ListView[Column]> } & Pick<
  ListView,
  'archived_at' | 'global_risk_level'
>;

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

const summaryColumns = `${profileFieldColumns}, client_count, sheet_count, factor_count, global_risk_level, unacceptable_factor_count`;

// Ties go by name, A to Z in either order, and the id keeps every order stable across pages.
const sortColumns: Record<EvaluationProfileSortKey, { column: string; nullsLast?: true }[]> = {
  name: [{ column: 'name' }],
  globalRiskLevel: [
    { column: 'global_risk_level', nullsLast: true },
    { column: 'unacceptable_factor_count' },
  ],
  usage: [{ column: 'sheet_count' }, { column: 'client_count' }],
  updatedAt: [{ column: 'updated_at' }],
};

const levelFilters: Record<GlobalRiskLevelFilter, string> = {
  over: `global_risk_level.gt.${maxAcceptableGlobalRiskLevel}`,
  within: `global_risk_level.lte.${maxAcceptableGlobalRiskLevel}`,
  none: 'factor_count.eq.0',
};

type ListQuery<Query> = {
  ilike(column: string, pattern: string): Query;
  or(filters: string): Query;
  eq(column: string, value: number): Query;
};

// The terms come lowercase and without diacritics, as the search column holds the name, and hold
// only letters and digits, which keeps PostgREST's filter syntax out of them.
function matching<Query extends ListQuery<Query>>(
  query: Query,
  filters: EvaluationProfileListFilters,
  q: string | undefined
) {
  let filtered = searchTerms(q).reduce(
    (each, term) => each.ilike('search_text', `*${term}*`),
    query
  );
  if (filters.level)
    filtered = filtered.or(filters.level.map((level) => levelFilters[level]).join(','));
  if (filters.usage?.includes('unused')) filtered = filtered.eq('sheet_count', 0);
  return filtered;
}

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
    globalRiskLevel: row.global_risk_level,
    factorCount: row.factor_count,
    unacceptableFactorCount: row.unacceptable_factor_count,
    archivedAt: row.archived_at,
    inUse: row.in_use,
    sheetCount: row.sheet_count,
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
  const { page, pageSize, sort, order, status, q, level, usage } = c.req.valid('query');
  const filters: EvaluationProfileListFilters = { level, usage };
  const db = createDataClient(c);
  await storeMissingRiskLevels(db);
  const inTab = (columns: string, head: boolean) =>
    db
      .from('evaluation_profile_list')
      .select(columns, { count: 'exact', head })
      .filter('archived_at', status === 'archived' ? 'not.is' : 'is', null);
  const listed = (columns: string, head: boolean) => matching(inTab(columns, head), filters, q);
  const narrowed = Boolean(level || usage) || searchTerms(q).length > 0;
  let query = listed(summaryColumns, false);
  for (const { column, nullsLast } of sortColumns[sort]) {
    query = query.order(column, {
      ascending: order === 'asc',
      ...(nullsLast ? { nullsFirst: false } : {}),
    });
  }
  const { from, to } = pageRange(page, pageSize);
  const [{ data, error, count }, all] = await Promise.all([
    (sort === 'name' ? query : query.order('name'))
      .order('id')
      .range(from, to)
      .returns<SummaryRow[]>(),
    narrowed ? inTab('id', true) : null,
  ]);
  if (all?.error) throw fromDatabaseError(all.error, 'count evaluation profiles');
  const unfilteredTotal = (total: number) => (all ? (all.count ?? 0) : total);
  if (error?.code === 'PGRST103') {
    // The page lies past the end: empty, with the real total.
    const recount = await listed('id', true);
    if (recount.error) throw fromDatabaseError(recount.error, 'count evaluation profiles');
    const total = recount.count ?? 0;
    return c.json(
      { items: [], page, pageSize, total, unfilteredTotal: unfilteredTotal(total) },
      200
    );
  }
  if (error) throw fromDatabaseError(error, 'list evaluation profiles');
  const total = count ?? 0;
  return c.json(
    { items: data.map(toSummary), page, pageSize, total, unfilteredTotal: unfilteredTotal(total) },
    200
  );
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
  if (data) await storeRiskLevels(db, [profileId]);
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
  await storeRiskLevels(db, [profileId]);
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
  await storeRiskLevels(db, [data]);
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
