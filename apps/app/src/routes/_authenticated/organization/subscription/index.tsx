import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { SubscriptionPage } from '@/features/subscription/subscription-page';

export const Route = createFileRoute('/_authenticated/organization/subscription/')({
  validateSearch: z.object({ raiseCap: z.boolean().optional().catch(undefined) }),
  component: SubscriptionRoute,
});

function SubscriptionRoute() {
  const { raiseCap } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <SubscriptionPage
      raiseCap={raiseCap === true}
      onRaiseCapClosed={() => void navigate({ search: {}, replace: true })}
    />
  );
}
