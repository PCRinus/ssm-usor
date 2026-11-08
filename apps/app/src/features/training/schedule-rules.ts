import { formatTrainingDuration, type StaffCategory, trainingMonths } from '@ssm-usor/contracts';

import { countOf } from '@/features/legislation/legislation-labels';

import { monthNames } from './document-details-schema';

export type ScheduleDomain = 'ssm' | 'su';

const intervals: Record<ScheduleDomain, Record<StaffCategory, readonly number[]>> = {
  ssm: { execution: [1, 2, 3, 4, 6], technical_administrative: [1, 2, 3, 4, 6, 12] },
  su: { execution: [1, 2, 3, 4, 5, 6], technical_administrative: [1, 2, 3, 4, 5, 6] },
};

export const intervalChoices = (domain: ScheduleDomain, category: StaffCategory) =>
  intervals[domain][category];

export const legalMaxInterval = (domain: ScheduleDomain, category: StaffCategory) =>
  intervals[domain][category].at(-1)!;

export const lawOf: Record<ScheduleDomain, string> = {
  ssm: 'HG 1425/2006, art. 96',
  su: 'OMAI 712/2005, art. 26',
};

export const durations: Record<ScheduleDomain, { label: string; values: readonly number[] }> = {
  ssm: { label: 'Durata unei instruiri, în minute', values: [60, 90, 120] },
  su: { label: 'Durata unei instruiri, în ore', values: [2, 3, 4, 5, 6, 7, 8] },
};

export const durationText = (domain: ScheduleDomain, duration: number) =>
  domain === 'ssm' ? formatTrainingDuration(duration) : countOf(duration, 'oră', 'ore');

export type HeldPosition = { name: string; employeeCount: number };

export type CategoryPosts = { category: StaffCategory; positions: readonly HeldPosition[] };

/** Execution personnel first, as the provider packs list them. */
export function categoriesWithPosts<
  Position extends HeldPosition & { staffCategory: StaffCategory },
>(positions: readonly Position[]): CategoryPosts[] {
  return (['execution', 'technical_administrative'] as const).flatMap((category) => {
    const held = positions.filter((position) => position.staffCategory === category);
    return held.length === 0 ? [] : [{ category, positions: held }];
  });
}

export const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);

/** "Ianuarie, iulie", as a sentence and not as a list of names. */
export const trainingMonthsText = (firstMonth: number, interval: number) =>
  capitalized(
    trainingMonths(firstMonth, interval)
      .map((month) => monthNames[month - 1]!.toLocaleLowerCase('ro'))
      .join(', ')
  );

export const intervalFieldId = (idPrefix: string, category: StaffCategory) =>
  `${idPrefix}-${category === 'execution' ? 'worker' : 'administrative'}-interval`;
