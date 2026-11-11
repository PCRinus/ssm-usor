import type { MeResponse } from '@/api/generated/api';
import { PublicFrame, PublicFrameAction } from '@/app/public-frame';
import { SignedInAs } from '@/features/auth/onboarding-frame';

import { ImpersonationBanner } from './impersonation-banner';
import { usePageIdentity } from './page-identity-context';
import { adminAreaUrl } from './platform-admin';

function copyFor(me: MeResponse, ended: boolean) {
  if (me.impersonation) {
    return {
      title: 'Membrul nu mai face parte dintr-o organizație',
      description: `${me.impersonation.targetName ?? 'Membrul ca care acționezi'} nu mai face parte din nicio organizație, așa că nu ai ce vedea în contul lui. Încheie acțiunea cu butonul „Încheie” de mai sus sau alege alt membru în zona de administrare.`,
    };
  }
  return {
    title: ended ? 'Acțiunea ca membru s-a încheiat' : 'Nu acționezi ca un membru',
    description:
      'Contul tău de administrator nu are o organizație în aplicație. Ca să lucrezi în contul unui membru, alege-l în zona de administrare.',
  };
}

export function AdminWithoutOrganizationPage({ me }: { me: MeResponse }) {
  const ended = usePageIdentity()?.endedOnArrival ?? false;
  const { title, description } = copyFor(me, ended);
  return (
    <>
      {me.impersonation && (
        <ImpersonationBanner impersonation={me.impersonation} organizationName={undefined} />
      )}
      <PublicFrame testId="admin-without-organization" title={title} description={description}>
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
