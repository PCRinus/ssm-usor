import { useLingui } from '@lingui/react/macro';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { pageColumn } from '@/components/page';
import { ParticipantLanguageSwitch } from '@/features/language/language-switch';
import type { Participation } from '@/features/participation/participation-context';

import { AccountMenu } from './account-menu';
import type { Place } from './places';

export function PortalHeader({
  participation,
  places,
}: {
  participation: Participation;
  places: Place[];
}) {
  const { t, i18n } = useLingui();
  return (
    <header className="z-30 border-b bg-card sm:sticky sm:top-0">
      <div className={cn(pageColumn, 'flex h-14 items-center gap-6 sm:h-16 lg:gap-10')}>
        <Link
          to="/"
          aria-label={t`SSM Ușor, acasă`}
          className="-ml-1 flex shrink-0 items-center rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <img
            src="/brand/logo.png"
            alt=""
            width={2172}
            height={724}
            className="h-9 w-auto sm:h-10"
          />
        </Link>
        {/* Padded by env(safe-area-inset-bottom) to clear the iOS home indicator; the root stays
            min-h-svh, since dvh resizes as Safari's toolbar collapses and vh overflows under it. */}
        <nav
          aria-label={t`Locurile portalului`}
          data-testid="portal-bar"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)] sm:static sm:self-stretch sm:border-t-0 sm:bg-transparent sm:pb-0"
        >
          <ul className="grid h-(--portal-bar-height) auto-cols-fr grid-flow-col px-2 sm:flex sm:h-full sm:gap-1 sm:px-0">
            {places.map(({ to, testId, label, icon: Icon, inAccountMenu }) => (
              <li key={to} className={cn(inAccountMenu && 'sm:hidden')}>
                <Link
                  to={to}
                  activeOptions={{ exact: to === '/' }}
                  data-testid={`portal-bar-${testId}`}
                  className="group flex h-full flex-col items-center justify-center gap-1 px-1 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset data-[status=active]:font-semibold data-[status=active]:text-foreground sm:px-3.5 sm:text-[0.9375rem] sm:data-[status=active]:shadow-[inset_0_-3px_0_var(--brand-lime)]"
                >
                  <span className="grid h-7 w-12 place-items-center rounded-full group-data-[status=active]:bg-accent sm:hidden">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  {i18n._(label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto hidden items-center gap-4 sm:flex">
          <ParticipantLanguageSwitch participation={participation} />
          <AccountMenu participation={participation} />
        </div>
      </div>
    </header>
  );
}
