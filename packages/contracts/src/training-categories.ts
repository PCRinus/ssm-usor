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

// Execution personnel first, as the provider packs list them.
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
 * picks another.
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

export type HeldPost = { name: string; staffCategory: StaffCategory };

/**
 * The posts a client holds once an import is confirmed, as `apply_client_import` writes them. An
 * imported post fills the client's post it was matched to, else the one of the same name, whose
 * category stays unless the member replaced it on a matched post; the confirm sends a replacement
 * only with the match. Any other imported post is added, as execution personnel without a category.
 */
export function postsAfterImport(
  existing: readonly { id: string; name: string; staffCategory: StaffCategory }[],
  imported: readonly {
    name: string;
    staffCategory: StaffCategory | null;
    existingId?: string | null;
    replacesCategory?: boolean;
  }[]
): HeldPost[] {
  const posts = existing.map((post) => ({ ...post }));
  const key = (name: string) => name.trim().toLowerCase();
  for (const post of imported) {
    const known = post.existingId
      ? posts.find((each) => each.id === post.existingId)
      : posts.find((each) => key(each.name) === key(post.name));
    if (!known) {
      posts.push({ id: '', name: post.name, staffCategory: post.staffCategory ?? 'execution' });
    } else if (post.existingId && post.replacesCategory && post.staffCategory) {
      known.staffCategory = post.staffCategory;
    }
  }
  return posts.map(({ name, staffCategory }) => ({ name, staffCategory }));
}
