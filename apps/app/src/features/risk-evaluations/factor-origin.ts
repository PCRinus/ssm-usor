import type { RiskFactorSourceProfile } from '@ssm-usor/contracts';

import { factorCountLabel, type RiskFactor } from './risk-evaluation-schema';

export interface ProfileShare {
  profile: RiskFactorSourceProfile;
  count: number;
}

const collator = new Intl.Collator('ro');

export function hasLibraryFactor(factors: readonly RiskFactor[]) {
  return factors.some((factor) => factor.sourceProfile !== null);
}

export function profileShares(factors: readonly RiskFactor[]): ProfileShare[] {
  const shares = new Map<string, ProfileShare>();
  for (const { sourceProfile } of factors) {
    if (!sourceProfile) continue;
    const share = shares.get(sourceProfile.id);
    if (share) share.count += 1;
    else shares.set(sourceProfile.id, { profile: sourceProfile, count: 1 });
  }
  return [...shares.values()].sort(
    (a, b) => b.count - a.count || collator.compare(a.profile.name, b.profile.name)
  );
}

// A row names its profile only where the rows differ; when every factor is in one profile
// the card's summary says so once.
export function rowsShowOrigin(factors: readonly RiskFactor[]) {
  const shares = profileShares(factors);
  const linked = shares.reduce((sum, share) => sum + share.count, 0);
  return shares.length > 1 || (shares.length === 1 && linked < factors.length);
}

type SummaryPart = string | RiskFactorSourceProfile;

export function originSummary(factors: readonly RiskFactor[]): SummaryPart[] | null {
  const shares = profileShares(factors);
  if (shares.length === 0) return null;
  const total = factors.length;
  const linked = shares.reduce((sum, share) => sum + share.count, 0);
  const rest = total - linked;
  const [first, ...others] = shares as [ProfileShare, ...ProfileShare[]];

  if (others.length === 0 && rest === 0) {
    const all =
      total === 1
        ? 'Factorul este'
        : total === 2
          ? 'Ambii factori sunt'
          : `Toți cei ${factorCountLabel(total).toLowerCase()} sunt`;
    return [`${all} în profilul `, first.profile, '.'];
  }

  const parts: SummaryPart[] = [
    `${first.count === 1 ? 'Un factor este' : `${factorCountLabel(first.count)} sunt`} în profilul `,
    first.profile,
  ];
  others.forEach((share, index) => {
    const separator = index === others.length - 1 ? ' și ' : ', ';
    parts.push(
      `${separator}${share.count === 1 ? 'unul' : share.count} în profilul `,
      share.profile
    );
  });
  if (rest === 0) parts.push('.');
  else if (rest === 1) parts.push(`; ${total === 2 ? 'celălalt' : 'unul'} nu este în bibliotecă.`);
  else parts.push(`; ceilalți ${rest} nu sunt în bibliotecă.`);
  return parts;
}
