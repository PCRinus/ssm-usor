import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { SignInPage } from '@/features/auth/sign-in-page';

export const Route = createFileRoute('/sign-in')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'sign-in'),
  component: SignInPage,
});
