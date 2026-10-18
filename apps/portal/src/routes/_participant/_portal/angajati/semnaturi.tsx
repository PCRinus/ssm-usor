import { createFileRoute } from '@tanstack/react-router';

import { ClientSignaturesPage } from '@/features/signing/client-signatures-page';

export const Route = createFileRoute('/_participant/_portal/angajati/semnaturi')({
  component: ClientSignaturesPage,
});
