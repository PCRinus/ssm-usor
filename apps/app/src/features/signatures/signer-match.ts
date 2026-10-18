import type { SignerCandidate } from '@ssm-usor/contracts';

import { normalizeSearch } from '@/lib/normalize-search';

// "Popescu Maria", "Maria POPESCU" and "Maria-Popescu" are one person: the specialist's profile
// writes the given name first, an employee row the family name first.
const nameKey = (name: string) =>
  normalizeSearch(name)
    .split(/[\s-]+/)
    .filter(Boolean)
    .sort()
    .join(' ');

export function matchSigner(
  name: string,
  candidates: readonly SignerCandidate[],
  userId: string
): string | null {
  const key = nameKey(name);
  if (!key) return null;
  const matches = candidates.filter((candidate) => nameKey(candidate.name) === key);
  const preferred =
    matches.find((candidate) => candidate.accountId === userId) ??
    matches.find((candidate) => candidate.kind === 'member') ??
    matches[0];
  return preferred?.accountId ?? null;
}
