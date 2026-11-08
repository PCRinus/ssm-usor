import {
  formatTrainingDuration,
  legalMaxTrainingInterval,
  type StaffCategory,
  startingTrainingIntervals,
  type TrainingDomain,
  trainingIntervalChoices,
  trainingMonths,
} from '@ssm-usor/contracts';

import { countOf } from '@/features/legislation/legislation-labels';

import { monthNames } from './document-details-schema';

export type ScheduleDomain = TrainingDomain;

export const intervalChoices = (domain: ScheduleDomain, category: StaffCategory) =>
  trainingIntervalChoices[domain][category];

export const startingInterval = (domain: ScheduleDomain, category: StaffCategory) =>
  startingTrainingIntervals[domain][category];

export const lawOf: Record<ScheduleDomain, string> = {
  ssm: 'HG 1425/2006, art. 96',
  su: 'OMAI 712/2005, art. 26',
};

// Art. 26 sets its ranges by what the staff does, not by the two categories of a post.
export const intervalHint = (domain: ScheduleDomain, category: StaffCategory) =>
  domain === 'ssm'
    ? `Cel mult la ${legalMaxTrainingInterval(domain, category)} luni, după ${lawOf.ssm}. Poți alege mai des.`
    : `După ${lawOf.su}: cel mult o lună pentru personalul care sprijină serviciile de urgență, 1–3 luni pentru cel care lucrează direct cu mașini și instalații, 3–6 luni pentru personalul auxiliar, 1–6 luni pentru cel cu atribuții de organizare, conducere și control.`;

export const durations: Record<ScheduleDomain, { label: string; values: readonly number[] }> = {
  ssm: { label: 'Durata unei instruiri, în minute', values: [60, 90, 120] },
  su: { label: 'Durata unei instruiri, în ore', values: [2, 3, 4, 5, 6, 7, 8] },
};

export const durationText = (domain: ScheduleDomain, duration: number) =>
  domain === 'ssm' ? formatTrainingDuration(duration) : countOf(duration, 'oră', 'ore');

export type HeldPosition = { name: string; employeeCount?: number };

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
