import {
  foldText,
  type ImportLibraryPost,
  type PreventionMeasureKind,
  type RiskEvaluationKind,
  type RiskImportChanges,
  type RiskImportExistingChoice,
  type RiskImportFactorChange,
  type WorkSystemComponent,
} from '@ssm-usor/contracts';

import type { ProposedRiskFactor, ProposedRiskSheet, RisksProposal } from './risks-proposal';
import { evaluationName } from './risks-proposal';
import { namesPerson, type PlanField } from './risks-read';

export interface RiskPayloadFactor {
  key: string;
  component: WorkSystemComponent;
  group: string;
  description: string;
  gravity_class: number;
  probability_class: number;
  measures: { kind: PreventionMeasureKind; description: string }[];
  actions: string | null;
  deadline: string | null;
  responsible_person: string | null;
  observations: string | null;
}

// What a client's factor points at (ADR 015's provenance): a factor of an entry this confirm
// creates, by their keys, or one the library already has.
export type RiskPayloadSource = { entry: string; factor: string } | { profile_factor_id: string };

export interface RiskImportPayload {
  entries: {
    key: string;
    name: string;
    means_of_production: string | null;
    work_environment: string | null;
    exposure: string | null;
    factors: RiskPayloadFactor[];
  }[];
  evaluations: {
    sheet: string;
    kind: RiskEvaluationKind;
    job_position_id: string | null;
    name: string | null;
    mode: Exclude<RiskImportExistingChoice, 'keep'>;
    means_of_production: string | null;
    work_environment: string | null;
    exposure: string | null;
    factors: (RiskPayloadFactor & { source: RiskPayloadSource | null })[];
  }[];
}

export interface RiskPayloadIssue {
  path: string;
  message: 'incomplete' | 'unknown_post';
}

export interface RiskPayloadInput {
  proposal: RisksProposal;
  changes: RiskImportChanges | null;
  // The posts the changes may name, and by the proposal's post name the post it is; null for one
  // the client import left out.
  posts: readonly ImportLibraryPost[];
  postReferences: Readonly<Record<string, string | null>>;
  // At confirm: the factors each job position's sheet has now, by its id, and the client-level
  // sheets'.
  existing?: {
    jobPositions?: Readonly<Record<string, number>>;
    sensitiveGroups?: number;
    other?: Readonly<Record<string, number>>;
  };
  people?: readonly string[];
}

const planFields: [PlanField, keyof RiskPayloadFactor][] = [
  ['actions', 'actions'],
  ['deadline', 'deadline'],
  ['responsiblePerson', 'responsible_person'],
  ['observations', 'observations'],
];

const pick = <T>(change: T | undefined, proposed: T) => (change === undefined ? proposed : change);

// The plan rows paired with no factor that the reading placed on the sheet, in the plan's order.
export const planFactorsOf = (
  proposal: Pick<RisksProposal, 'unmatchedPlanRows'>,
  sheet: string
): ProposedRiskFactor[] =>
  proposal.unmatchedPlanRows.flatMap((row) =>
    row.sheet === sheet && row.factor ? [row.factor] : []
  );

const sheetFactors = (proposal: RisksProposal, sheet: ProposedRiskSheet) => [
  ...sheet.factors,
  ...planFactorsOf(proposal, sheet.key),
];

function reviewedFactor(
  factor: ProposedRiskFactor,
  change: RiskImportFactorChange | undefined
): RiskPayloadFactor | null {
  const component = change?.component ?? factor.component;
  const gravity = change?.gravityClass ?? factor.gravityClass;
  const probability = change?.probabilityClass ?? factor.probabilityClass;
  const group = (change?.group ?? factor.group).trim();
  if (component === null || group === '' || gravity === null || probability === null) return null;
  return {
    key: factor.key,
    component,
    group,
    description: change?.description ?? factor.description,
    gravity_class: gravity,
    probability_class: probability,
    measures: change?.measures ?? factor.measures,
    actions: pick(change?.actions, factor.actions),
    deadline: pick(change?.deadline, factor.deadline),
    responsible_person: pick(change?.responsiblePerson, factor.responsiblePerson),
    observations: pick(change?.observations, factor.observations),
  };
}

const identity = (
  factor: Pick<
    ProposedRiskFactor,
    'component' | 'description' | 'gravityClass' | 'probabilityClass'
  >
) =>
  [
    factor.component,
    foldText(factor.description),
    factor.gravityClass,
    factor.probabilityClass,
  ].join('|');

// A copy's factors are its original's one for one, so they are paired by what they say.
function copyPairs(copy: ProposedRiskSheet, original: ProposedRiskSheet) {
  const free = new Map<string, string[]>();
  for (const factor of original.factors) {
    const key = identity(factor);
    free.set(key, [...(free.get(key) ?? []), factor.key]);
  }
  return new Map(
    copy.factors.flatMap((factor) => {
      const partner = free.get(identity(factor))?.shift();
      return partner ? [[factor.key, partner] as const] : [];
    })
  );
}

/** By sheet key, the factors each sheet writes once the member's changes are applied. */
export function reviewedRiskFactors(
  proposal: RisksProposal,
  changes: RiskImportChanges | null
): { reviewed: Map<string, RiskPayloadFactor[]>; issues: RiskPayloadIssue[] } {
  const sheetChanges = changes?.sheets ?? {};
  const issues: RiskPayloadIssue[] = [];
  const reviewed = new Map<string, RiskPayloadFactor[]>();
  for (const sheet of proposal.sheets) {
    const factorChanges = sheetChanges[sheet.key]?.factors ?? {};
    const factors: RiskPayloadFactor[] = [];
    for (const factor of sheetFactors(proposal, sheet)) {
      const change = factorChanges[factor.key];
      if (!(change?.included ?? factor.included)) continue;
      const written = reviewedFactor(factor, change);
      if (written) factors.push(written);
      else
        issues.push({ path: `sheets.${sheet.key}.factors.${factor.key}`, message: 'incomplete' });
    }
    reviewed.set(sheet.key, factors);
  }
  return { reviewed, issues };
}

export const reviewedSheetTexts = (
  sheet: ProposedRiskSheet,
  change: RiskImportChanges['sheets'][string] | undefined
) => ({
  means_of_production: pick(change?.meansOfProduction, sheet.meansOfProduction),
  work_environment: pick(change?.workEnvironment, sheet.workEnvironment),
  exposure: pick(change?.exposure, sheet.exposure),
});

export function riskImportPayload(input: RiskPayloadInput): {
  payload: RiskImportPayload;
  issues: RiskPayloadIssue[];
} {
  const { proposal } = input;
  const changes = input.changes?.sheets ?? {};
  const people = input.people ?? [];
  const jobPositionOf = new Map<string, string | null>([
    ...input.posts.map((post) => [post.id, post.jobPositionId] as const),
    ...input.posts.flatMap((post) =>
      post.jobPositionId ? [[post.jobPositionId, post.jobPositionId] as const] : []
    ),
  ]);
  const payload: RiskImportPayload = { entries: [], evaluations: [] };
  const byKey = new Map(proposal.sheets.map((sheet) => [sheet.key, sheet]));
  const { reviewed, issues } = reviewedRiskFactors(proposal, input.changes);
  const texts = (sheet: ProposedRiskSheet) => reviewedSheetTexts(sheet, changes[sheet.key]);

  const choiceOf = (sheet: ProposedRiskSheet) => changes[sheet.key]?.library ?? sheet.choice;
  const entryKeys = new Set<string>();
  for (const sheet of proposal.sheets) {
    if (sheet.copyOf !== null) continue;
    const choice = choiceOf(sheet);
    if (choice !== 'add' && choice !== 'add_new') continue;
    if (sheet.status === 'identical') continue;
    const factors = reviewed.get(sheet.key)!;
    if (factors.length === 0) continue;
    entryKeys.add(sheet.key);
    payload.entries.push({
      key: sheet.key,
      name: (changes[sheet.key]?.libraryName ?? sheet.libraryName).trim(),
      ...texts(sheet),
      // A person named in a plan field goes to the client only (ADR 036).
      factors: factors.map((factor) => {
        const entryFactor = { ...factor };
        for (const [, field] of planFields) {
          const value = entryFactor[field];
          if (typeof value === 'string' && namesPerson(value, people)) {
            (entryFactor as Record<string, unknown>)[field] = null;
          }
        }
        return entryFactor;
      }),
    });
  }

  const sourcesOf = (sheet: ProposedRiskSheet): Map<string, RiskPayloadSource> => {
    const original = sheet.copyOf !== null ? byKey.get(sheet.copyOf) : sheet;
    if (!original) return new Map();
    const toOriginal =
      original === sheet
        ? new Map(sheetFactors(proposal, sheet).map((factor) => [factor.key, factor.key] as const))
        : copyPairs(sheet, original);
    const choice = choiceOf(original);
    const sources = new Map<string, RiskPayloadSource>();
    if (entryKeys.has(original.key)) {
      const kept = new Set(reviewed.get(original.key)!.map((factor) => factor.key));
      for (const [own, theirs] of toOriginal) {
        if (kept.has(theirs)) sources.set(own, { entry: original.key, factor: theirs });
      }
    } else if (original.match && (original.status === 'identical' || choice === 'use_existing')) {
      const libraryOf = new Map(
        original.match.pairs.map((pair) => [pair.factor, pair.libraryFactor])
      );
      for (const [own, theirs] of toOriginal) {
        const libraryFactor = libraryOf.get(theirs);
        if (libraryFactor) sources.set(own, { profile_factor_id: libraryFactor });
      }
    }
    return sources;
  };

  for (const sheet of proposal.sheets) {
    const change = changes[sheet.key];
    const factors = reviewed.get(sheet.key)!;
    if (factors.length === 0) continue;
    const sources = sourcesOf(sheet);
    const sourced = factors.map((factor) => ({
      ...factor,
      source: sources.get(factor.key) ?? null,
    }));
    const base = { sheet: sheet.key, kind: sheet.kind, ...texts(sheet), factors: sourced };
    if (sheet.kind === 'job_position') {
      const references =
        change?.posts ??
        sheet.posts.flatMap((post) => {
          const reference = input.postReferences[post.name];
          return reference ? [reference] : [];
        });
      const done = new Set<string>();
      for (const reference of references) {
        const jobPositionId = jobPositionOf.get(reference);
        if (jobPositionId === undefined) {
          issues.push({ path: `sheets.${sheet.key}.posts`, message: 'unknown_post' });
          continue;
        }
        if (jobPositionId === null || done.has(jobPositionId)) continue;
        done.add(jobPositionId);
        const existing = input.existing?.jobPositions?.[jobPositionId] ?? 0;
        const mode = change?.postChoices?.[reference] ?? (existing > 0 ? 'keep' : 'append');
        if (mode === 'keep') continue;
        payload.evaluations.push({ ...base, job_position_id: jobPositionId, name: null, mode });
      }
      continue;
    }
    const name = sheet.kind === 'other' ? evaluationName(sheet.name, sheet.heading) : null;
    const existing =
      sheet.kind === 'sensitive_groups'
        ? (input.existing?.sensitiveGroups ?? 0)
        : (Object.entries(input.existing?.other ?? {}).find(
            ([other]) => foldText(other) === foldText(name ?? '')
          )?.[1] ?? 0);
    const mode = change?.existingChoice ?? (existing > 0 ? 'keep' : 'append');
    if (mode === 'keep') continue;
    payload.evaluations.push({ ...base, job_position_id: null, name, mode });
  }
  return { payload, issues };
}
