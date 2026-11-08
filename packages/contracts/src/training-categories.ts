import type { StaffCategory } from './job-positions';
import type { TrainingDomain } from './trainings';

// HG 1425/2006 art. 96 for occupational safety, OMAI 712/2005 art. 26 for fire safety. The lists are
// the intervals the app offers; the last of each is the law's longest (ADR 039).

export const trainingIntervalChoices: Record<
  TrainingDomain,
  Record<StaffCategory, readonly number[]>
> = {
  ssm: { execution: [1, 2, 3, 4, 6], technical_administrative: [1, 2, 3, 4, 6, 12] },
  su: { execution: [1, 2, 3, 4, 5, 6], technical_administrative: [1, 2, 3, 4, 5, 6] },
};

export const legalMaxTrainingInterval = (domain: TrainingDomain, category: StaffCategory) =>
  trainingIntervalChoices[domain][category].at(-1)!;

/** The categories the posts are in, execution personnel first, as the provider packs list them. */
export function staffCategoriesWithPosts(
  posts: readonly { staffCategory: StaffCategory | null }[]
): StaffCategory[] {
  return (['execution', 'technical_administrative'] as const).filter((category) =>
    posts.some((post) => post.staffCategory === category)
  );
}

/**
 * The interval an import gives a category: the one the documents or the member settled on, else,
 * where the client keeps posts in the category, the law's longest, which stands until the member
 * picks another. A category without posts keeps whatever the documents gave.
 */
export function importedTrainingInterval({
  domain,
  category,
  hasPosts,
  settled,
}: {
  domain: TrainingDomain;
  category: StaffCategory;
  hasPosts: boolean;
  settled: number | null;
}): { months: number | null; legalMaximum: boolean } {
  if (settled !== null || !hasPosts) return { months: settled, legalMaximum: false };
  return { months: legalMaxTrainingInterval(domain, category), legalMaximum: true };
}
