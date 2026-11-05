import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { VerifyPage } from '@/features/auth/verify-page';

export const Route = createFileRoute('/verify')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'verify'),
  component: VerifyPage,
});
