import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';

import { ContractReturnPage } from '@/features/service-contracts/contract-return-page';

// Public: the return link in a contract email lands here (ADR 007, amended). The person has
// no account; the token in the address is all that identifies the send, and it goes to the
// API in request bodies.
export const Route = createFileRoute('/contract')({
  staticData: { title: 'Exemplarul semnat' },
  validateSearch: z.object({ token: z.string().optional() }),
  component: ContractReturnPage,
});
