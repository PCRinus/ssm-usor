import {
  isUnacceptableRiskLevel,
  type PreventionMeasureKind,
  preventionMeasureKinds,
  type RiskZone,
  type RiskZoneEvaluation,
  type RiskZoneFactor,
  type RiskZoneSuggestion,
} from '@ssm-usor/contracts';

import { apiErrorReason, ApiHttpError } from '@/api/http';
import { commonFailure } from '@/lib/api-errors';

// The record (9.2) prints each measure once by this key; the card and the editor count the same.
const sameText = (text: string) =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, '')
    .toLocaleLowerCase('ro');

export const ownMeasureLines = (text: string | null) =>
  (text ?? '')
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:\s*(?:[–—•*]\s*|-(?:\s+|$)))+/u, '').trim())
    .filter(Boolean);

export type PrintedMeasures = {
  byKind: { kind: PreventionMeasureKind; texts: string[] }[];
  own: string[];
};

export function printedMeasures(
  factors: readonly Pick<RiskZoneFactor, 'measures'>[],
  own: string | null
): PrintedMeasures {
  const seen = new Set<string>();
  const once = (texts: readonly string[]) =>
    texts.filter((text) => {
      const key = sameText(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const byKind = preventionMeasureKinds
    .map((kind) => ({
      kind,
      texts: once(
        factors.flatMap((factor) =>
          factor.measures
            .filter((measure) => measure.kind === kind)
            .map((measure) => measure.description.trim())
        )
      ),
    }))
    .filter((group) => group.texts.length > 0);
  return { byKind, own: once(ownMeasureLines(own)) };
}

export const linkedMeasureCount = (measures: PrintedMeasures) =>
  measures.byKind.reduce((count, group) => count + group.texts.length, 0);

/** The zone's factors the record prints: those of current posts and evaluations. */
export function printedFactors(zone: Pick<RiskZone, 'factors'>, current: ReadonlySet<string>) {
  return zone.factors.filter((factor) => current.has(factor.id));
}

export function zonePlace(zone: Pick<RiskZone, 'workplace' | 'location'>) {
  return [zone.workplace?.name, zone.location?.trim()].filter(Boolean).join(' – ');
}

export function evaluationsOf(factors: readonly Pick<RiskZoneFactor, 'evaluation'>[]) {
  const seen = new Map<string, RiskZoneEvaluation>();
  for (const { evaluation } of factors) {
    if (!seen.has(evaluation.id)) seen.set(evaluation.id, evaluation);
  }
  return [...seen.values()];
}

export type SuggestionSource = {
  lead: string;
  evaluations: RiskZoneEvaluation[];
}[];

export function suggestionSource(
  suggestion: Pick<RiskZoneSuggestion, 'origin' | 'factors'>
): SuggestionSource {
  const evaluations = evaluationsOf(suggestion.factors);
  const posts = evaluations.filter((evaluation) => evaluation.kind === 'job_position');
  const others = evaluations.filter((evaluation) => evaluation.kind !== 'job_position');
  const parts: SuggestionSource = [];
  if (posts.length > 0) {
    const several = posts.length > 1;
    parts.push({
      lead:
        suggestion.origin === 'work_zone'
          ? several
            ? 'Zona de lucru a posturilor'
            : 'Zona de lucru a postului'
          : several
            ? 'Fișele de evaluare ale posturilor'
            : 'Fișa de evaluare a postului',
      evaluations: posts,
    });
  }
  if (others.length > 0) {
    parts.push({
      lead: others.length > 1 ? 'Fișele de evaluare' : 'Fișa de evaluare',
      evaluations: others,
    });
  }
  return parts;
}

export type FactorGroup = { evaluation: RiskZoneEvaluation; factors: RiskZoneFactor[] };

// A linked factor of a position archived since is not among those offered, and stays linked.
export function factorGroups(
  factors: readonly RiskZoneFactor[],
  linked: readonly RiskZoneFactor[] = []
): FactorGroup[] {
  const groups = new Map<string, FactorGroup>();
  const known = new Set(factors.map((factor) => factor.id));
  for (const factor of [...factors, ...linked.filter((factor) => !known.has(factor.id))]) {
    const group = groups.get(factor.evaluation.id) ?? {
      evaluation: factor.evaluation,
      factors: [],
    };
    group.factors.push(factor);
    groups.set(factor.evaluation.id, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    factors: [
      ...group.factors.filter((factor) => isUnacceptableRiskLevel(factor.riskLevel)),
      ...group.factors.filter((factor) => !isUnacceptableRiskLevel(factor.riskLevel)),
    ],
  }));
}

export const ignoredCountLabel = (count: number) =>
  count === 1 ? 'o sugestie ignorată' : `${count} sugestii ignorate`;

export const nameTakenMessage = 'Clientul are deja o zonă cu această denumire.';

export function zoneFailure(cause: unknown, fallback: string) {
  if (!(cause instanceof ApiHttpError)) return fallback;
  const reason = apiErrorReason(cause);
  if (reason === 'risk_zone_name_taken') return nameTakenMessage;
  if (reason === 'risk_zones_listed') {
    return 'Clientul are deja zone cu risc ridicat și specific; reîncarcă pagina ca să le vezi.';
  }
  if (reason === 'client_archived') {
    return 'Clientul este arhivat; zonele lui nu se mai schimbă.';
  }
  if (cause.status === 404) return 'Zona nu mai există la acest client; reîncarcă pagina.';
  return commonFailure(cause) ?? fallback;
}
