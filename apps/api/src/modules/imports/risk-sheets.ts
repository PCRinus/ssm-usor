import { foldText } from '@ssm-usor/contracts';
import {
  entryName,
  type ExistingEvaluations,
  type LibraryEvaluation,
  type RisksProposal,
} from '@ssm-usor/import';

import { type DataClient, fromDatabaseError } from '../../lib/db';

export interface RiskLibrary {
  // Active entries only: an archived one is never matched (ADR 036).
  entries: LibraryEvaluation[];
  // Every entry's name, archived ones included, since names stay unique across both.
  names: string[];
}

export async function riskLibraryOf(db: DataClient, organizationId: string): Promise<RiskLibrary> {
  const [named, active] = await Promise.all([
    db.from('evaluation_profiles').select('name').eq('organization_id', organizationId),
    db
      .from('evaluation_profiles')
      .select(
        'id, name, evaluation_profile_factors(id, component, description, gravity_class, probability_class, sort_order, evaluation_profile_measures(kind, description, sort_order))'
      )
      .eq('organization_id', organizationId)
      .is('archived_at', null),
  ]);
  if (named.error) throw fromDatabaseError(named.error, 'read the risk library');
  if (active.error) throw fromDatabaseError(active.error, 'read the risk library');
  const bySortOrder = (a: { sort_order: number }, b: { sort_order: number }) =>
    a.sort_order - b.sort_order;
  return {
    names: named.data.map((entry) => entry.name),
    entries: active.data.map((entry) => ({
      id: entry.id,
      name: entry.name,
      factors: [...entry.evaluation_profile_factors].sort(bySortOrder).map((factor) => ({
        id: factor.id,
        component: factor.component,
        description: factor.description,
        gravityClass: factor.gravity_class,
        probabilityClass: factor.probability_class,
        measures: [...factor.evaluation_profile_measures]
          .sort(bySortOrder)
          .map((measure) => ({ kind: measure.kind, description: measure.description })),
      })),
    })),
  };
}

export type LibraryName = { id: string; name: string; archived: boolean };

export async function libraryNamesOf(
  db: DataClient,
  organizationId: string
): Promise<LibraryName[]> {
  const { data, error } = await db
    .from('evaluation_profiles')
    .select('id, name, archived_at')
    .eq('organization_id', organizationId)
    .order('name');
  if (error) throw fromDatabaseError(error, 'read the risk library names');
  return data.map((entry) => ({
    id: entry.id,
    name: entry.name,
    archived: entry.archived_at !== null,
  }));
}

export interface ClientSheets {
  // The factors of each active post's sheet, by the post's id, and the post's name.
  jobPositions: { id: string; name: string; factors: number }[];
  sensitiveGroups: number;
  // By the evaluation's name.
  other: Record<string, number>;
}

export async function clientSheetsOf(db: DataClient, clientId: string): Promise<ClientSheets> {
  const [positions, evaluations] = await Promise.all([
    db.from('job_positions').select('id, name').eq('client_id', clientId).is('archived_at', null),
    db
      .from('risk_evaluations')
      .select('kind, job_position_id, name, risk_factors(count)')
      .eq('client_id', clientId),
  ]);
  if (positions.error) throw fromDatabaseError(positions.error, 'read the client posts');
  if (evaluations.error) throw fromDatabaseError(evaluations.error, 'read the client sheets');
  const countOf = (evaluation: { risk_factors: { count: number }[] }) =>
    evaluation.risk_factors[0]?.count ?? 0;
  const byPosition = new Map(
    evaluations.data.flatMap((evaluation) =>
      evaluation.job_position_id ? [[evaluation.job_position_id, countOf(evaluation)] as const] : []
    )
  );
  return {
    jobPositions: positions.data.map((position) => ({
      id: position.id,
      name: position.name,
      factors: byPosition.get(position.id) ?? 0,
    })),
    sensitiveGroups: evaluations.data
      .filter((evaluation) => evaluation.kind === 'sensitive_groups')
      .reduce((sum, evaluation) => sum + countOf(evaluation), 0),
    other: Object.fromEntries(
      evaluations.data.flatMap((evaluation) =>
        evaluation.kind === 'other' && evaluation.name
          ? [[evaluation.name, countOf(evaluation)] as const]
          : []
      )
    ),
  };
}

// Before the client is confirmed, a proposal's post is the client's post of its name, if any.
export function existingByPostName(
  sheets: ClientSheets,
  posts: readonly string[]
): ExistingEvaluations {
  const byName = new Map(
    sheets.jobPositions.map((position) => [foldText(position.name), position.factors])
  );
  return {
    posts: Object.fromEntries(posts.map((post) => [post, byName.get(foldText(post)) ?? 0])),
    sensitiveGroups: sheets.sensitiveGroups,
    other: sheets.other,
  };
}

// As confirming reads them, so the review shows the choice for a sheet that gained factors since
// the reading, or for a post the member picked.
export function existingFactorsOf(proposal: RisksProposal, sheets: ClientSheets) {
  return {
    jobPositions: Object.fromEntries(
      sheets.jobPositions.map((position) => [position.id, position.factors])
    ),
    sheets: Object.fromEntries(
      proposal.sheets.flatMap((sheet) => {
        if (sheet.kind === 'job_position') return [];
        if (sheet.kind === 'sensitive_groups') return [[sheet.key, sheets.sensitiveGroups]];
        const name = foldText(entryName(sheet.name));
        const found = Object.entries(sheets.other).find(([other]) => foldText(other) === name);
        return [[sheet.key, found?.[1] ?? 0]];
      })
    ),
  };
}
