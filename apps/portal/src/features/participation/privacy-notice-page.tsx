import { useLingui } from '@lingui/react/macro';

import { Page, PageGrid, PageHeader } from '@/components/page';

import { useParticipation } from './participation-context';
import { PrivacyNoticeText } from './privacy-notice';

export function PrivacyNoticePage() {
  const { t } = useLingui();
  const participation = useParticipation();
  return (
    <Page testId="privacy-notice-page">
      <PageHeader
        title={t`Cum folosim datele tale`}
        description={t`Ce ți-am spus la prima intrare în portal.`}
      />
      <PageGrid>
        <div className="lg:col-span-8">
          <PrivacyNoticeText participation={participation} />
        </div>
      </PageGrid>
    </Page>
  );
}
