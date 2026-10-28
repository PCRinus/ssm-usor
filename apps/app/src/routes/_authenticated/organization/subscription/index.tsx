import { createFileRoute } from '@tanstack/react-router';

import { SubscriptionPage } from '@/features/subscription/subscription-page';

export const Route = createFileRoute('/_authenticated/organization/subscription/')({
  component: SubscriptionPage,
});
