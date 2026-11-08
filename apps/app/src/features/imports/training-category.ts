import {
  type HeldPost,
  importedTrainingInterval,
  postsAfterImport,
  staffCategories,
  staffCategoriesWithPosts,
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

export type TrainingFieldMode = 'value' | 'choice' | 'outside' | 'legal_maximum' | 'differs';

export type TrainingField = {
  path: string;
  state: FieldState;
  mode: TrainingFieldMode;
  value: number | null;
  settled: boolean;
};

const asNumber = (value: unknown) =>
  value === null || value === undefined || value === '' ? null : Number(value);

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
  const hasExisting = state.existing !== null && state.existing !== '';
  if (hasExisting && state.own.length > 1) {
    return field(
      'choice',
      asNumber(state.status === 'choice' ? state.existing : valueInForce(state)),
      true
    );
  }
  if (state.comparison === 'kept' || state.comparison === 'replaced') {
    return field('differs', asNumber(valueInForce(state)), true);
  }
  const inForce = asNumber(valueInForce(state));
  // Confirming writes the law's longest for every category with posts left without a value, so a
  // value cleared in an older review stands at it too.
  if (legal && state.status !== 'choice' && inForce === null) {
    const { months, legalMaximum } = importedTrainingInterval({ ...legal, settled: null });
    if (legalMaximum) return field('legal_maximum', months, false);
  }
  if (state.own.length > 1) {
    return field('choice', asNumber(state.value), state.status !== 'choice');
  }
  const proposed = asNumber(state.proposedValue);
  if (choices && proposed !== null && !choices.includes(proposed) && !hasExisting) {
    return field('outside', state.edited ? asNumber(state.value) : null, state.edited);
  }
  if (legal && state.own.length === 0 && state.edited) {
    return field('legal_maximum', inForce, true);
  }
  return field('value', inForce, true);
}

export function keptPosts(
  proposal: Proposal,
  changes: Changes,
  existing: readonly { id: string; name: string; staffCategory: StaffCategory }[]
) {
  return postsAfterImport(
    existing,
    itemStates(proposal, changes, 'jobPositions')
      .filter((item) => item.included)
      .map((item) => {
        const change = changes.items[item.item.id];
        return {
          name: String(item.values.name ?? ''),
          staffCategory: (item.values.staffCategory ?? null) as StaffCategory | null,
          existingId: change?.existingId,
          replacesCategory: change?.replace?.includes('staffCategory'),
        };
      })
  );
}

// A category without kept posts has no training, so its interval neither waits for the member nor
// differs from the app's.
export function withoutAbsentCategories(
  states: Record<string, FieldState>,
  posts: readonly HeldPost[]
): Record<string, FieldState> {
  const held = new Set(staffCategoriesWithPosts(posts));
  const absent = new Set(
    (['ssm', 'su'] as const).flatMap((domain) =>
      staffCategories
        .filter((category) => !held.has(category))
        .map((category) => schedulePaths[domain].interval[category] as string)
    )
  );
  return Object.fromEntries(Object.entries(states).filter(([path]) => !absent.has(path)));
}

export const intervalChoicesOf = (domain: TrainingDomain, category: StaffCategory) =>
  trainingIntervalChoices[domain][category];

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
