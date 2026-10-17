import { Trans } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { pageColumn } from '@/components/page';
import type { Participation } from '@/features/participation/participation-context';
import { privacyPolicyUrl } from '@/features/participation/privacy-notice';

import { CommitVersion } from './commit-version';

const footerLink =
  'rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none';

export function PortalFooter({ participation }: { participation: Participation }) {
  return (
    <footer data-testid="portal-footer" className="border-t">
      <div
        className={cn(
          pageColumn,
          'flex flex-col gap-3 py-5 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6'
        )}
      >
        <p>
          <Trans>Prestator SSM: {participation.organizationName}</Trans>
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link to="/informare" data-testid="footer-privacy-notice" className={footerLink}>
            <Trans>Cum folosim datele tale</Trans>
          </Link>
          <a href={privacyPolicyUrl} target="_blank" rel="noreferrer" className={footerLink}>
            <Trans>Politica de confidențialitate</Trans>
          </a>
          <CommitVersion className="text-[0.8125rem]" />
        </div>
      </div>
    </footer>
  );
}
