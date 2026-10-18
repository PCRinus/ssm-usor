import { personNameKey, type SignerCandidate } from '@ssm-usor/contracts';

export function matchSigner(
  name: string,
  candidates: readonly SignerCandidate[],
  userId: string
): string | null {
  const key = personNameKey(name);
  if (!key) return null;
  const matches = candidates.filter((candidate) => personNameKey(candidate.name) === key);
  const preferred =
    matches.find((candidate) => candidate.accountId === userId) ??
    matches.find((candidate) => candidate.kind === 'member') ??
    matches[0];
  return preferred?.accountId ?? null;
}
