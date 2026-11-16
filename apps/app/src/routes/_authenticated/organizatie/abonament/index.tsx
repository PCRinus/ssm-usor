import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { invoiceListSearch } from '@/features/subscription/invoice-list';
import { SubscriptionPage } from '@/features/subscription/subscription-page';

export const Route = createFileRoute('/_authenticated/organizatie/abonament/')({
  validateSearch: z.object(invoiceListSearch),
  component: SubscriptionPage,
});
