import { Link, Navigate, Outlet } from '@tanstack/react-router';

import { needsPrivacyNotice, useParticipations } from './participation-context';
import { placesOf } from './places';
import { PrivacyNoticeGate } from './privacy-notice';

export function PortalShell() {
  const { participation } = useParticipations();
  if (!participation) return <Navigate to="/alege" replace />;
  if (needsPrivacyNotice(participation)) return <PrivacyNoticeGate participation={participation} />;

  const places = placesOf(participation);
  return (
    <div className="flex min-h-svh flex-col">
      <nav
        aria-label="Portal"
        data-testid="portal-bar"
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:sticky sm:top-0 sm:bottom-auto sm:-mx-4 sm:border-t-0 sm:border-b sm:pb-0"
      >
        <ul className="mx-auto grid max-w-[30rem] auto-cols-fr grid-flow-col sm:px-4">
          {places.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link
                to={to}
                activeOptions={{ exact: to === '/' }}
                data-testid={`portal-bar-${to === '/' ? 'home' : to.slice(1)}`}
                className="group flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none data-[status=active]:font-semibold data-[status=active]:text-foreground sm:min-h-14 sm:flex-row sm:gap-2 sm:text-sm"
              >
                <span className="grid h-7 w-12 place-items-center rounded-full group-data-[status=active]:bg-accent sm:w-9">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex-1 pb-28 sm:pb-12">
        <Outlet />
      </div>
    </div>
  );
}
