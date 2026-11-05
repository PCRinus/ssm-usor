import { redirect } from '@tanstack/react-router';

import type { AuthStore, Step } from './auth-store';

const stepPaths = {
  'sign-in': '/sign-in',
  enrol: '/enrol',
  verify: '/verify',
  admin: '/',
} as const satisfies Record<Step, string>;

export async function requireStep(auth: AuthStore, step: Step) {
  await auth.ready;
  const current = auth.step();
  if (current !== step) throw redirect({ to: stepPaths[current], replace: true });
}
