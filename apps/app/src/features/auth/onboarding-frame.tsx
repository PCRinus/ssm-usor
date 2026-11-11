import { Progress } from '@ssm-usor/ui/components/progress';
import { useNavigate, useRouteContext } from '@tanstack/react-router';

import { endImpersonationBeforeSignOut } from '@/features/impersonation/end-before-sign-out';

import { useAuth } from './auth-context';

export const onboardingStepCount = 3;

export function OnboardingProgress({ step, name }: { step: number; name: string }) {
  const position = `Pasul ${step} din ${onboardingStepCount}`;
  return (
    <div data-testid="onboarding-progress" className="grid gap-2">
      <p className="flex justify-between gap-3 text-xs text-muted-foreground tabular-nums">
        <span className="font-semibold text-foreground">{position}</span>
        <span>{name}</span>
      </p>
      <Progress
        aria-label="Configurarea"
        value={Math.round((step / onboardingStepCount) * 100)}
        getValueLabel={() => position}
        className="h-1.5 bg-muted"
        indicatorClassName="rounded-full"
      />
    </div>
  );
}

export function SignedInAs({ email }: { email: string | null }) {
  const { auth, session } = useAuth();
  const context = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();

  async function signOut() {
    await endImpersonationBeforeSignOut(context, session?.user.id);
    await auth.signOut().catch(() => undefined);
    await navigate({ to: '/autentificare', replace: true });
  }

  return (
    <p className="text-center text-sm text-muted-foreground">
      Autentificat ca {email}.{' '}
      <button
        type="button"
        data-testid="onboarding-sign-out"
        className="underline underline-offset-4 hover:text-foreground"
        onClick={() => void signOut()}
      >
        Deconectează-te
      </button>
    </p>
  );
}
