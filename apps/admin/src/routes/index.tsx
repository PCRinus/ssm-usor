import { createFileRoute } from '@tanstack/react-router';

import { requireStep } from '@/features/auth/require-step';
import { HomePage } from '@/features/home/home-page';

export const Route = createFileRoute('/')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'admin'),
  component: HomePage,
});
