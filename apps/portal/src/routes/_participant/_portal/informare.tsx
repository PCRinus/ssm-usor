import { createFileRoute } from '@tanstack/react-router';

import { PrivacyNoticePage } from '@/features/participation/privacy-notice-page';

export const Route = createFileRoute('/_participant/_portal/informare')({
  component: PrivacyNoticePage,
});
