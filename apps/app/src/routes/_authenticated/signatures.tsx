import { createFileRoute } from '@tanstack/react-router';

import { SignatureRequestsPage } from '@/features/signatures/signature-requests-page';

export const Route = createFileRoute('/_authenticated/signatures')({
  staticData: { title: 'Semnături' },
  component: SignatureRequestsPage,
});
