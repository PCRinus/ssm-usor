import { createFileRoute } from '@tanstack/react-router';

import { EnrolPage } from '@/features/auth/enrol-page';
import { requireStep } from '@/features/auth/require-step';

export const Route = createFileRoute('/enrol')({
  beforeLoad: ({ context: { auth } }) => requireStep(auth, 'enrol'),
  component: EnrolPage,
});
