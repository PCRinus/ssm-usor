import type { ImportInference } from '@/api/generated/api';
import { intervalOptions, notApplicable } from '@/features/training/document-details-schema';

import {
  type Changes,
  type FieldChange,
  type FieldState,
  formatFieldValue,
  type Source,
  type TrainingCategory,
} from './review-model';

export type CategoryValue = number | typeof notApplicable;

export type CategoryCandidate = {
  value: CategoryValue;
  sources: Source[];
  inferred?: ImportInference;
  path: string;
  option: number;
};

export type CategoryState = {
  category: TrainingCategory;
  label: string;
  status: 'value' | 'missing' | 'choice' | 'unticked';
  value: CategoryValue | null;
  // The documents' own values, an interval or "Nu se aplică" each.
  candidates: CategoryCandidate[];
  // Why an interval and "Nu se aplică" stand together: both from the documents, or one of them
  // written by the member in a review saved before the two were one row.
  conflict: 'documents' | 'member' | null;
  inForce: CategoryCandidate | null;
  edited: boolean;
  proposed: CategoryValue | null;
  sources: Source[];
  existing: CategoryValue | null;
  comparison: FieldState['comparison'];
};

const candidateOf = (state: FieldState, index: number): CategoryCandidate => {
  const option = state.options[index]!;
  return {
    value: option.value === 'true' ? notApplicable : Number(option.value),
    sources: option.sources,
    ...(option.inferred ? { inferred: option.inferred } : {}),
    path: state.path,
    option: index,
  };
};

const present = (value: unknown) => value !== null && value !== undefined && value !== '';

export function categoryState(
  states: Record<string, FieldState>,
  category: TrainingCategory,
  changes: Changes,
  intoExistingClient: boolean
): CategoryState {
  const interval = states[category.interval]!;
  const excluded = states[category.notApplicable]!;
  const months = interval.value === null ? null : Number(interval.value);
  const isExcluded = excluded.value === 'true';
  const intervals = interval.own.map((index) => candidateOf(interval, index));
  const exclusions = excluded.own
    .filter((index) => excluded.options[index]!.value === 'true')
    .map((index) => candidateOf(excluded, index));
  const candidates = [...intervals, ...exclusions];
  const both = months !== null && isExcluded;

  let status: CategoryState['status'];
  let value: CategoryValue | null = null;
  if (both || interval.status === 'choice' || excluded.status === 'choice') status = 'choice';
  else if (months !== null) {
    status = 'value';
    value = months;
  } else if (isExcluded) {
    status = 'value';
    value = notApplicable;
  } else if (interval.status === 'unticked' || excluded.status === 'unticked') status = 'unticked';
  else status = 'missing';

  const conflict = both
    ? interval.edited || excluded.edited
      ? 'member'
      : 'documents'
    : intervals.length > 0 && exclusions.length > 0
      ? 'documents'
      : null;
  const inForce =
    value === null
      ? null
      : value === notApplicable
        ? excluded.option === null
          ? null
          : candidateOf(excluded, excluded.option)
        : interval.option === null
          ? null
          : candidateOf(interval, interval.option);

  const existing: CategoryValue | null =
    excluded.existing === 'true'
      ? notApplicable
      : present(interval.existing)
        ? Number(interval.existing)
        : null;
  let comparison: FieldState['comparison'] = 'none';
  if (intoExistingClient) {
    if (existing === null) comparison = value !== null ? 'added' : 'none';
    else if (value === null || value === existing) comparison = 'same';
    else {
      const replacing = value === notApplicable ? category.notApplicable : category.interval;
      comparison = changes.fields[replacing]?.replace ? 'replaced' : 'kept';
    }
  }

  return {
    category,
    label: interval.label,
    status,
    value,
    candidates,
    conflict,
    inForce,
    edited: value !== null && inForce === null,
    proposed: candidates.length === 1 ? candidates[0]!.value : null,
    sources: inForce?.sources ?? candidates.flatMap((candidate) => candidate.sources),
    existing,
    comparison,
  };
}

export const formatCategoryValue = (category: TrainingCategory, value: CategoryValue | null) =>
  value === null
    ? ''
    : value === notApplicable
      ? 'Nu se aplică'
      : formatFieldValue(category.interval, value);

export function categoryChoices(category: TrainingCategory, current: CategoryValue | null) {
  const choices: { value: number; label: string }[] = intervalOptions
    .filter(({ months }) => months <= category.maxMonths)
    .map(({ months, label }) => ({ value: months, label }));
  if (typeof current === 'number' && !choices.some((choice) => choice.value === current)) {
    choices.push({ value: current, label: `La ${current} luni` });
    choices.sort((a, b) => a.value - b.value);
  }
  return choices;
}

// What the documents give when the member changes nothing: undefined while they give several.
function proposedOf(state: FieldState) {
  if (state.own.length > 1) return undefined;
  return state.own.length === 1 ? state.options[state.own[0]!]!.value : null;
}

function optionChange(state: FieldState, option: number): FieldChange | null {
  return state.own.length === 1 && state.own[0] === option ? null : { option };
}

const keepReplace = (change: FieldChange | null, previous: FieldChange | undefined) =>
  previous?.replace ? { ...change, replace: true } : change;

/**
 * Both fields of a category set to one value, so that the interval and "Nu se aplică" never
 * stand together; null for a field left as the documents give it.
 */
export function categoryChanges(
  states: Record<string, FieldState>,
  category: TrainingCategory,
  changes: Changes,
  value: CategoryValue | null
): Record<string, FieldChange | null> {
  const interval = states[category.interval]!;
  const excluded = states[category.notApplicable]!;
  let intervalChange: FieldChange | null;
  let excludedChange: FieldChange | null;
  if (typeof value === 'number') {
    const own = interval.own.find((index) => Number(interval.options[index]!.value) === value);
    intervalChange = own === undefined ? { value } : optionChange(interval, own);
    const proposed = proposedOf(excluded);
    excludedChange = proposed === null || proposed === 'false' ? null : { value: 'false' };
  } else {
    intervalChange = proposedOf(interval) === null ? null : { value: null };
    if (value === notApplicable) {
      const own = excluded.own.find((index) => excluded.options[index]!.value === 'true');
      excludedChange = own === undefined ? { value: 'true' } : optionChange(excluded, own);
    } else {
      const proposed = proposedOf(excluded);
      excludedChange = proposed === null || proposed === 'false' ? null : { value: null };
    }
  }
  return {
    [category.interval]: keepReplace(intervalChange, changes.fields[category.interval]),
    [category.notApplicable]: keepReplace(excludedChange, changes.fields[category.notApplicable]),
  };
}

export const categoryStateIn = (
  context: { states: Record<string, FieldState>; changes: Changes; existingClient: boolean },
  category: TrainingCategory
) => categoryState(context.states, category, context.changes, context.existingClient);
