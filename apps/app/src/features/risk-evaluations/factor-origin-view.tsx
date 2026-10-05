import type { RiskFactorSourceProfile } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';
import { LibraryBig } from 'lucide-react';
import { Fragment } from 'react';

import { originSummary } from './factor-origin';
import type { RiskFactor } from './risk-evaluation-schema';

const profileLinkClass =
  'rounded-sm underline decoration-muted-foreground/45 underline-offset-3 outline-none hover:text-foreground hover:decoration-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50';

function ProfileLink({ profile }: { profile: RiskFactorSourceProfile }) {
  return (
    <Link
      to="/risks/$profileId"
      params={{ profileId: profile.id }}
      data-testid="risk-factor-origin-link"
      className={profileLinkClass}
    >
      {profile.name}
    </Link>
  );
}

export function OriginSummary({ factors }: { factors: readonly RiskFactor[] }) {
  const parts = originSummary(factors);
  if (!parts) return null;
  return (
    <span data-testid="risk-factors-origin" className="wrap-anywhere">
      {parts.map((part, index) =>
        typeof part === 'string' ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <ProfileLink key={index} profile={part} />
        )
      )}
    </span>
  );
}

export function FactorOrigin({ profile }: { profile: RiskFactorSourceProfile }) {
  return (
    <p
      data-testid="risk-factor-origin"
      className="flex items-start gap-1.5 text-[0.8125rem] text-muted-foreground"
    >
      <LibraryBig aria-hidden="true" className="mt-[0.1875rem] size-3.5 shrink-0" />
      <span className="min-w-0 wrap-anywhere">
        În profilul <ProfileLink profile={profile} />
      </span>
    </p>
  );
}
