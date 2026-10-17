import { Navigate, Outlet } from '@tanstack/react-router';

import {
  needsPrivacyNotice,
  useParticipations,
} from '@/features/participation/participation-context';
import { PrivacyNoticeGate } from '@/features/participation/privacy-notice';

import { placesOf } from './places';
import { PortalFooter } from './portal-footer';
import { PortalHeader } from './portal-header';

export function PortalShell() {
  const { participation } = useParticipations();
  if (!participation) return <Navigate to="/alege" replace />;
  if (needsPrivacyNotice(participation)) return <PrivacyNoticeGate participation={participation} />;

  return (
    <div className="flex min-h-svh flex-col">
      <PortalHeader participation={participation} places={placesOf(participation)} />
      <div className="flex flex-1 flex-col pb-[calc(var(--portal-bar-height)+env(safe-area-inset-bottom)+1rem)] sm:pb-0">
        <div className="flex-1">
          <Outlet />
        </div>
        <PortalFooter participation={participation} />
      </div>
    </div>
  );
}
