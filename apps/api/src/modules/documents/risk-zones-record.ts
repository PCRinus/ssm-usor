import {
  type DocumentTypeKey,
  type MissingDocumentData,
  type PreventionMeasureKind,
  preventionMeasureKinds,
  riskLevel,
  type RiskZonesState,
} from '@ssm-usor/contracts';

import { type DataClient, fromDatabaseError } from '../../lib/db';
import { preventionMeasureFieldColumns } from '../risk-evaluations/evaluation';
import {
  type EvaluatedPosition,
  measureLines,
  printedEvaluations,
  type RiskEvaluationFacts,
  sameText,
  typedItems,
  workplaceLabel,
} from './risk-assessment';

export const riskZonesRecordTypeKey = 'risk_zones_record' as const satisfies DocumentTypeKey;

export type RiskZoneFactorFacts = {
  id: string;
  evaluationId: string;
  sortOrder: number;
  description: string;
  gravityClass: number;
  probabilityClass: number;
  /** In the order they were entered. */
  measures: { kind: PreventionMeasureKind; description: string }[];
};

export type RiskZoneFacts = {
  name: string;
  /** May be archived since the zone named it. */
  workplace: { name: string; registeredOffice: boolean } | null;
  location: string | null;
  measures: string | null;
  /** Every factor linked, an archived position's included: the record prints only the current. */
  factors: RiskZoneFactorFacts[];
};

/** The client's zones in the order they were added (ADR 045). */
export type RiskZonesFacts = { state: RiskZonesState; zones: RiskZoneFacts[] };

type RiskZonesInput = {
  riskZones: RiskZonesFacts;
  riskEvaluations: readonly RiskEvaluationFacts[];
  jobPositions: readonly EvaluatedPosition[];
};

export type RiskZonesRecordContext = {
  state: Exclude<RiskZonesState, 'undecided'>;
  listed: boolean;
  none: boolean;
  zones: {
    name: string;
    /** `Punct de lucru „Atelier”`, as 9.1 names a workplace; null when the zone names none. */
    workplace: string | null;
    location: string | null;
    /** The workplace and the location, a line each, or a dash. */
    place: string;
    /** The current linked factors, the highest level first. */
    risks: { description: string; level: number }[];
    /** The same, a line each: "Electrocutare (nivel de risc 6)". */
    risksText: string;
    /** The linked factors' measures, each once, by kind, then the zone's own. */
    measures: string[];
    measuresText: string;
  }[];
};

type ZoneRow = {
  name: string;
  location: string | null;
  measures: string | null;
  client_workplaces: { name: string; is_registered_office: boolean } | null;
  risk_zone_factors: {
    risk_factors: {
      id: string;
      evaluation_id: string;
      description: string;
      gravity_class: number;
      probability_class: number;
      sort_order: number;
      prevention_measures: {
        id: string;
        kind: PreventionMeasureKind;
        description: string;
        sort_order: number;
      }[];
    } | null;
  }[];
};

export async function loadRiskZones(
  db: DataClient,
  clientId: string
): Promise<RiskZonesFacts['zones']> {
  const { data, error } = await db
    .from('risk_zones')
    .select(
      `name, location, measures, client_workplaces(name, is_registered_office), risk_zone_factors(risk_factors(id, evaluation_id, description, gravity_class, probability_class, sort_order, prevention_measures(${preventionMeasureFieldColumns})))`
    )
    .eq('client_id', clientId)
    .order('created_at')
    .order('id')
    .returns<ZoneRow[]>();
  if (error) throw fromDatabaseError(error, 'document facts: risk zones');
  return data.map((zone) => ({
    name: zone.name,
    workplace: zone.client_workplaces && {
      name: zone.client_workplaces.name,
      registeredOffice: zone.client_workplaces.is_registered_office,
    },
    location: zone.location,
    measures: zone.measures,
    factors: zone.risk_zone_factors.flatMap(({ risk_factors: factor }) =>
      factor
        ? [
            {
              id: factor.id,
              evaluationId: factor.evaluation_id,
              sortOrder: factor.sort_order,
              description: factor.description,
              gravityClass: factor.gravity_class,
              probabilityClass: factor.probability_class,
              measures: [...factor.prevention_measures]
                .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
                .map((measure) => ({ kind: measure.kind, description: measure.description })),
            },
          ]
        : []
    ),
  }));
}

/**
 * Each zone with the linked factors the documents print, those of a current position or of an
 * evaluation outside the posts, the highest level first and then in 9.1's order.
 */
function currentZones({ riskZones, riskEvaluations, jobPositions }: RiskZonesInput) {
  const evaluationOrder = new Map(
    printedEvaluations(riskEvaluations, jobPositions).map((evaluation, index) => [
      evaluation.id,
      index,
    ])
  );
  const levelOf = (factor: RiskZoneFactorFacts) =>
    riskLevel(factor.gravityClass, factor.probabilityClass);
  return riskZones.zones.map((zone) => ({
    ...zone,
    factors: zone.factors
      .filter((factor) => evaluationOrder.has(factor.evaluationId))
      .sort(
        (a, b) =>
          levelOf(b) - levelOf(a) ||
          evaluationOrder.get(a.evaluationId)! - evaluationOrder.get(b.evaluationId)! ||
          a.sortOrder - b.sortOrder ||
          a.id.localeCompare(b.id)
      ),
  }));
}

/** What 9.2 waits for (ADR 045); nothing else in the set does. */
export function riskZonesGaps(input: RiskZonesInput): MissingDocumentData[] {
  if (input.riskZones.state === 'undecided') return ['risk_zones.decided'];
  const unmeasured = currentZones(input).some((zone) => zoneMeasures(zone).length === 0);
  return unmeasured ? ['risk_zones.measures'] : [];
}

function zoneMeasures(zone: ReturnType<typeof currentZones>[number]) {
  const seen = new Set<string>();
  const once = (texts: readonly string[]) =>
    texts.filter((text) => {
      const key = sameText(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const linked = preventionMeasureKinds.flatMap((kind) =>
    once(
      zone.factors.flatMap((factor) =>
        factor.measures
          .filter((measure) => measure.kind === kind)
          .map((measure) => measure.description.trim())
          .filter(Boolean)
      )
    )
  );
  return [...linked, ...once(typedItems(zone.measures))];
}

/** Null while a gap of `riskZonesGaps` stands: 9.2 is never merged without its zones. */
export function riskZonesRecord(input: RiskZonesInput): RiskZonesRecordContext | null {
  if (riskZonesGaps(input).length > 0) return null;
  const state = input.riskZones.state === 'none' ? 'none' : 'listed';
  return {
    state,
    listed: state === 'listed',
    none: state === 'none',
    zones:
      state === 'none'
        ? []
        : currentZones(input).map((zone) => {
            const workplace = zone.workplace && workplaceLabel(zone.workplace);
            const location = zone.location?.trim() || null;
            const risks = zone.factors.map((factor) => ({
              description: factor.description.trim(),
              level: riskLevel(factor.gravityClass, factor.probabilityClass),
            }));
            const measures = zoneMeasures(zone);
            return {
              name: zone.name.trim(),
              workplace,
              location,
              place: [workplace, location].filter(Boolean).join('\n') || '—',
              risks,
              risksText: measureLines(
                risks.map(
                  (risk) =>
                    `${risk.description.replace(/[.;,]+$/, '')} (nivel de risc ${risk.level})`
                )
              ),
              measures,
              measuresText: measureLines(measures),
            };
          }),
  };
}

/**
 * The zones linking a current factor of each position's own evaluation, by position id. Empty
 * until the client lists its zones, even while 9.2 still waits for their measures (ADR 046).
 */
export function zonesByPosition(input: RiskZonesInput): Map<string, string[]> {
  const byPosition = new Map<string, string[]>();
  if (input.riskZones.state !== 'listed') return byPosition;
  const positionOf = new Map(
    input.riskEvaluations.flatMap((evaluation) =>
      evaluation.kind === 'job_position' && evaluation.jobPositionId
        ? [[evaluation.id, evaluation.jobPositionId] as const]
        : []
    )
  );
  for (const zone of currentZones(input)) {
    const place = [zone.workplace && workplaceLabel(zone.workplace), zone.location?.trim()]
      .filter(Boolean)
      .join(', ');
    const label = place ? `${zone.name.trim()} (${place})` : zone.name.trim();
    const positions = new Set(
      zone.factors.flatMap((factor) => positionOf.get(factor.evaluationId) ?? [])
    );
    for (const positionId of positions) {
      byPosition.set(positionId, [...(byPosition.get(positionId) ?? []), label]);
    }
  }
  return byPosition;
}
