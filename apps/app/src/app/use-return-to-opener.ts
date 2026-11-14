import { useRouter } from '@tanstack/react-router';

import { stepsBackToOpener } from './opener';

export function useReturnToOpener() {
  const router = useRouter();
  return () => {
    const steps = stepsBackToOpener(router.history.location.state);
    if (steps === null) return false;
    router.history.go(steps);
    return true;
  };
}
