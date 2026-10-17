import { createFileRoute, redirect } from '@tanstack/react-router';

import { SignInPage } from '@/features/auth/sign-in-page';

export const Route = createFileRoute('/sign-in')({
  beforeLoad: async ({ context: { auth } }) => {
    await auth.ready;
    if (auth.getSnapshot().session) throw redirect({ to: '/', replace: true });
  },
  component: SignInPage,
});
