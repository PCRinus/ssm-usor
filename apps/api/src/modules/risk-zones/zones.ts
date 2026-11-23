import {
  isUnacceptableRiskLevel,
  preventionMeasureKinds,
  riskLevel,
  type RiskZone,
  type RiskZoneEvaluation,
  type RiskZoneFactor,
  type RiskZonesResponse,
  type RiskZoneSuggestion,
} from '@ssm-usor/contracts';

import type { Database } from '../../database.types';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { clientNotFound } from '../clients/lookup';
import { sensitiveGroupsName } from '../documents/risk-assessment';
import { byEvaluationOrder, bySortOrder } from '../risk-evaluations/evaluation';

type Tables = Database['public']['Tables'];

type FactorRow = Pick<
  Tables['risk_factors']['Row'],
  | 'id'
  | 'component'
  | 'factor_group'
  | 'description'
  | 'gravity_class'
  | 'probability_class'
  | 'sort_order'
> & {
  prevention_measures: Pick<
    Tables['prevention_measures']['Row'],
    'id' | 'kind' | 'description' | 'sort_order'
  >[];
};

type EvaluationRow = Pick<Tables['risk_evaluations']['Row'], 'id' | 'kind' | 'name'> & {
  job_positions: {
    id: string;
    name: string;
    work_zone: string | null;
    archived_at: string | null;
  } | null;
  risk_factors: FactorRow[];
};

type ZoneRow = Pick<
  Tables['risk_zones']['Row'],
  'id' | 'client_id' | 'name' | 'location' | 'measures' | 'created_at' | 'updated_at'
> & {
  client_workplaces: { id: string; name: string } | null;
  risk_zone_factors: { factor_id: string }[];
};

const evaluationColumns =
  'id, kind, name, job_positions(id, name, work_zone, archived_at), risk_factors(id, component, factor_group, description, gravity_class, probability_class, sort_order, prevention_measures(id, kind, description, sort_order))';

const zoneColumns =
  'id, client_id, name, location, measures, created_at, updated_at, client_workplaces(id, name), risk_zone_factors(factor_id)';

const collator = new Intl.Collator('ro');

const nameKey = (name: string) => name.trim().toLocaleLowerCase('ro');

function evaluationTitle(row: EvaluationRow): string {
  if (row.kind === 'job_position') return row.job_positions?.name ?? '';
  if (row.kind === 'sensitive_groups') return sensitiveGroupsName;
  return row.name ?? '';
}

function toEvaluation(row: EvaluationRow): RiskZoneEvaluation {
  return {
    id: row.id,
    kind: row.kind,
    title: evaluationTitle(row),
    jobPositionId: row.kind === 'job_position' ? (row.job_positions?.id ?? null) : null,
  };
}

// A work zone may be one character, a zone name may not; the position's name always qualifies.
function suggestionLabel(row: EvaluationRow): Pick<RiskZoneSuggestion, 'name' | 'origin'> {
  const workZone = row.job_positions?.work_zone?.trim() ?? '';
  return workZone.length >= 2
    ? { name: workZone, origin: 'work_zone' }
    : { name: evaluationTitle(row), origin: 'evaluation' };
}

const kindRank = new Map(preventionMeasureKinds.map((kind, index) => [kind, index]));

function toZoneFactor(factor: FactorRow, evaluation: RiskZoneEvaluation): RiskZoneFactor {
  return {
    id: factor.id,
    component: factor.component,
    group: factor.factor_group,
    description: factor.description,
    riskLevel: riskLevel(factor.gravity_class, factor.probability_class),
    evaluation,
    measures: [...factor.prevention_measures]
      .sort((a, b) => kindRank.get(a.kind)! - kindRank.get(b.kind)! || bySortOrder(a, b))
      .map((measure) => ({ id: measure.id, kind: measure.kind, description: measure.description })),
  };
}

type Placed = { factor: RiskZoneFactor; sortOrder: number };

const byLevel = (a: Placed, b: Placed) =>
  b.factor.riskLevel - a.factor.riskLevel ||
  collator.compare(a.factor.evaluation.title, b.factor.evaluation.title) ||
  a.sortOrder - b.sortOrder ||
  a.factor.id.localeCompare(b.factor.id);

function toZone(row: ZoneRow, factors: Map<string, Placed>): RiskZone {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    workplace: row.client_workplaces,
    location: row.location,
    measures: row.measures,
    factors: row.risk_zone_factors
      .flatMap((link) => factors.get(link.factor_id) ?? [])
      .sort(byLevel)
      .map((placed) => placed.factor),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function currentEvaluations(evaluations: EvaluationRow[]) {
  return evaluations
    .filter(
      (row) => row.kind !== 'job_position' || (row.job_positions && !row.job_positions.archived_at)
    )
    .map((row) => ({ ...row, jobPosition: row.job_positions }))
    .sort(byEvaluationOrder);
}

type Group = Pick<RiskZoneSuggestion, 'name' | 'origin'> & { placed: Placed[] };

// A group named after a work zone keeps that origin when an evaluation of the same name joins it.
function suggestZones(
  current: EvaluationRow[],
  zones: Pick<RiskZone, 'id' | 'name' | 'factors'>[],
  ignored: ReadonlySet<string>
): Pick<RiskZonesResponse, 'suggestions' | 'ignoredSuggestions'> {
  const linked = new Set(zones.flatMap((zone) => zone.factors.map((factor) => factor.id)));
  const open = new Map<string, Group>();
  const set = new Map<string, Group>();
  for (const row of current) {
    const evaluation = toEvaluation(row);
    const label = suggestionLabel(row);
    const key = nameKey(label.name);
    for (const factor of [...row.risk_factors].sort(bySortOrder)) {
      if (linked.has(factor.id)) continue;
      if (!isUnacceptableRiskLevel(riskLevel(factor.gravity_class, factor.probability_class)))
        continue;
      const groups = ignored.has(factor.id) ? set : open;
      const group = groups.get(key) ?? { ...label, placed: [] };
      if (label.origin === 'work_zone') group.origin = 'work_zone';
      group.placed.push({ factor: toZoneFactor(factor, evaluation), sortOrder: factor.sort_order });
      groups.set(key, group);
    }
  }
  const zoneByName = new Map(zones.map((zone) => [nameKey(zone.name), zone.id]));
  const suggest = (groups: Map<string, Group>) =>
    [...groups.entries()]
      .map(([key, group]) => ({
        name: group.name,
        origin: group.origin,
        factors: group.placed.sort(byLevel).map((placed) => placed.factor),
        existingZoneId: zoneByName.get(key) ?? null,
      }))
      .sort((a, b) => collator.compare(a.name, b.name) || a.name.localeCompare(b.name));
  return { suggestions: suggest(open), ignoredSuggestions: suggest(set) };
}

export function buildRiskZones(
  state: RiskZonesResponse['state'],
  evaluations: EvaluationRow[],
  zoneRows: ZoneRow[],
  ignored: ReadonlySet<string>
): RiskZonesResponse {
  const factors = new Map<string, Placed>();
  for (const row of evaluations) {
    const evaluation = toEvaluation(row);
    for (const factor of row.risk_factors) {
      factors.set(factor.id, {
        factor: toZoneFactor(factor, evaluation),
        sortOrder: factor.sort_order,
      });
    }
  }
  const zones = [...zoneRows]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .map((row) => toZone(row, factors));
  const current = currentEvaluations(evaluations);
  return {
    state,
    zones,
    ...suggestZones(current, zones, ignored),
    factors: current.flatMap((row) =>
      [...row.risk_factors].sort(bySortOrder).map((factor) => factors.get(factor.id)!.factor)
    ),
  };
}

export async function loadRiskZones(db: DataClient, clientId: string): Promise<RiskZonesResponse> {
  const [client, evaluations, zones, ignored] = await Promise.all([
    db.from('clients').select('risk_zones_state').eq('id', clientId).maybeSingle(),
    db
      .from('risk_evaluations')
      .select(evaluationColumns)
      .eq('client_id', clientId)
      .returns<EvaluationRow[]>(),
    db.from('risk_zones').select(zoneColumns).eq('client_id', clientId).returns<ZoneRow[]>(),
    db.from('risk_zone_ignored_factors').select('factor_id').eq('client_id', clientId),
  ]);
  if (client.error) throw fromDatabaseError(client.error, 'find client');
  if (!client.data) throw clientNotFound();
  if (evaluations.error) throw fromDatabaseError(evaluations.error, 'list risk evaluations');
  if (zones.error) throw fromDatabaseError(zones.error, 'list risk zones');
  if (ignored.error) throw fromDatabaseError(ignored.error, 'list ignored risk zone factors');
  return buildRiskZones(
    client.data.risk_zones_state,
    evaluations.data,
    zones.data,
    new Set(ignored.data.map((row) => row.factor_id))
  );
}
