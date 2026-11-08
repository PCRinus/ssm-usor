import {
  importedTrainingInterval,
  type StaffCategory,
  type TrainingDomain,
  trainingIntervalChoices,
} from '@ssm-usor/contracts';

import {
  type Changes,
  type FieldChange,
  type FieldState,
  itemStates,
  type Proposal,
  valueInForce,
} from './review-model';

export const schedulePaths = {
  ssm: {
    duration: 'trainingSchedule.periodicTrainingMinutes',
    firstMonth: 'trainingSchedule.trainingFirstMonth',
    dayFrom: 'trainingSchedule.trainingDayFrom',
    dayTo: 'trainingSchedule.trainingDayTo',
    interval: {
      execution: 'trainingSchedule.workerTrainingIntervalMonths',
      technical_administrative: 'trainingSchedule.administrativeTrainingIntervalMonths',
    },
  },
  su: {
    duration: 'fireSafety.periodicTrainingHours',
    firstMonth: 'fireSafety.trainingFirstMonth',
    dayFrom: 'fireSafety.trainingDayFrom',
    dayTo: 'fireSafety.trainingDayTo',
    interval: {
      execution: 'fireSafety.workerTrainingIntervalMonths',
      technical_administrative: 'fireSafety.administrativeTrainingIntervalMonths',
    },
  },
} as const satisfies Record<
  TrainingDomain,
  {
    duration: string;
    firstMonth: string;
    dayFrom: string;
    dayTo: string;
    interval: Record<StaffCategory, string>;
  }
>;

export const durationChoices: Record<TrainingDomain, readonly number[]> = {
  ssm: [60, 90, 120],
  su: [2, 3, 4, 5, 6, 7, 8],
};

export type TrainingFieldMode =
  // The control itself, with where its value comes from under it.
  | 'value'
  // The documents give several values.
  | 'choice'
  // The documents' value is not one the control offers.
  | 'outside'
  // The documents give no interval for a category with posts: the law's longest stands.
  | 'legal_maximum'
  // Into an existing client, whose value the documents contradict.
  | 'differs';

export type TrainingField = {
  path: string;
  state: FieldState;
  mode: TrainingFieldMode;
  // What goes into the client: null while nothing does or a choice waits.
  value: number | null;
  // False while the member still has to pick.
  settled: boolean;
};

const asNumber = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

/** How the review shows one field of a training schedule, and whether it waits on the member. */
export function trainingField(
  states: Record<string, FieldState>,
  path: string,
  choices: readonly number[] | null,
  legal: { domain: TrainingDomain; category: StaffCategory; hasPosts: boolean } | null = null
): TrainingField {
  const state = states[path]!;
  const field = (mode: TrainingFieldMode, value: number | null, settled: boolean) => ({
    path,
    state,
    mode,
    value,
    settled,
  });
  if (state.comparison === 'kept' || state.comparison === 'replaced') {
    return field('differs', asNumber(valueInForce(state)), true);
  }
  if (state.own.length > 1) {
    return field('choice', asNumber(state.value), state.status !== 'choice');
  }
  const proposed = asNumber(state.proposedValue);
  if (choices && proposed !== null && !choices.includes(proposed)) {
    return field('outside', state.edited ? asNumber(state.value) : null, state.edited);
  }
  const inForce = asNumber(valueInForce(state));
  if (legal && state.own.length === 0 && (inForce === null || state.edited)) {
    const { months, legalMaximum } = importedTrainingInterval({
      ...legal,
      settled: state.edited ? inForce : null,
    });
    if (legalMaximum || state.edited) {
      return field('legal_maximum', months, state.edited);
    }
  }
  return field('value', inForce, true);
}

/** The posts the client keeps, by name, as the import would leave them. */
export function keptPosts(
  proposal: Proposal,
  changes: Changes,
  existing: readonly { name: string; staffCategory: StaffCategory }[]
) {
  const imported = itemStates(proposal, changes, 'jobPositions')
    .filter((item) => item.included && item.values.staffCategory)
    .map((item) => ({
      name: String(item.values.name ?? ''),
      staffCategory: item.values.staffCategory as StaffCategory,
    }));
  const names = new Set(imported.map((post) => post.name.trim().toLowerCase()));
  return [...imported, ...existing.filter((post) => !names.has(post.name.trim().toLowerCase()))];
}

export const intervalChoicesOf = (domain: TrainingDomain, category: StaffCategory) =>
  trainingIntervalChoices[domain][category];

/** The change that makes `value` the field's, none where the documents already give it. */
export function numberChange(
  state: FieldState,
  value: number,
  intoExistingClient: boolean
): FieldChange | null {
  if (intoExistingClient && state.existing !== null && state.existing !== '') {
    return Number(state.existing) === value ? null : { value, replace: true };
  }
  const own = state.own.find((index) => Number(state.options[index]!.value) === value);
  if (own === undefined) return { value };
  return state.own.length === 1 ? null : { option: own };
}
