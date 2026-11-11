import { useState } from 'react';

import type { MeResponse } from '@/api/generated/api';
import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { SignedInAs } from '@/features/auth/onboarding-frame';

import { takeEndedImpersonation } from './identity';
import { ImpersonationBanner } from './impersonation-banner';
import { adminAreaUrl } from './platform-admin';

export function AdminWithoutOrganizationPage({ me }: { me: MeResponse }) {
  const [ended] = useState(takeEndedImpersonation);
  return (
    <>
      {me.impersonation && (
        <ImpersonationBanner impersonation={me.impersonation} organizationName={undefined} />
      )}
      <PublicFrame
        testId="admin-without-organization"
        title={ended ? 'Acțiunea ca membru s-a încheiat' : 'Nu acționezi ca un membru'}
        description="Contul tău de administrator nu are o organizație în aplicație. Ca să lucrezi în contul unui membru, alege-l în zona de administrare."
      >
        <PublicFrameAction asChild>
          <a href={adminAreaUrl()} data-testid="admin-area-link">
            Mergi la zona de administrare
          </a>
        </PublicFrameAction>
        <SignedInAs email={me.user.email} />
      </PublicFrame>
    </>
  );
}
