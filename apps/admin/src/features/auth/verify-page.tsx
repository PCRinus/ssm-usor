import { Frame } from '@/components/frame';

import { useAuth } from './auth-context';
import { CodeForm } from './code-form';
import { SignOutButton } from './sign-out-button';

export function VerifyPage() {
  const { auth } = useAuth();
  const factorId = auth.verifiedFactorId();

  return (
    <Frame
      testId="verify-page"
      title="Enter your code"
      description="Open the authenticator app and enter the code it shows for SSM Ușor admin."
    >
      {factorId && (
        <CodeForm submitLabel="Continue" verify={(code) => auth.verifyCode(factorId, code)} />
      )}
      <SignOutButton />
    </Frame>
  );
}
