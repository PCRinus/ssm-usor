import { Button } from '@ssm-usor/ui/components/button';
import { useQuery } from '@tanstack/react-query';

import { ErrorNotice } from '@/components/error-notice';
import { Frame } from '@/components/frame';

import { useAuth } from './auth-context';
import { CodeForm } from './code-form';
import { SignOutButton } from './sign-out-button';

export function EnrolPage() {
  const { auth, session } = useAuth();
  // One enrolment per visit: a second one, from a refetch or a double mount, would replace the
  // factor whose QR code is on the screen.
  const enrolment = useQuery({
    queryKey: ['mfa-enrolment', session?.user.id],
    queryFn: () => auth.startEnrolment(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <Frame
      testId="enrol-page"
      title="Set up an authenticator"
      description="The admin area asks for a code from an authenticator app at every sign-in. Scan the QR code with the app, or type the key into it, then enter the code it shows."
    >
      {enrolment.isPending && (
        <p role="status" className="text-muted-foreground text-center">
          Preparing…
        </p>
      )}
      {enrolment.isError && (
        <>
          <ErrorNotice testId="enrol-error">
            The authenticator could not be set up: {enrolment.error.message}
          </ErrorNotice>
          <Button variant="outline" onClick={() => void enrolment.refetch()}>
            Try again
          </Button>
        </>
      )}
      {enrolment.data && (
        <>
          <img
            src={enrolment.data.qrCode}
            alt="QR code for the authenticator app"
            data-testid="enrol-qr"
            className="mx-auto size-48 rounded-md bg-white p-2"
          />
          <div className="grid gap-1 text-center">
            <p className="text-muted-foreground text-sm">Or enter this key</p>
            <code data-testid="enrol-secret" className="font-mono text-sm break-all select-all">
              {enrolment.data.secret}
            </code>
          </div>
          <CodeForm
            submitLabel="Verify and continue"
            verify={(code) => auth.verifyCode(enrolment.data.factorId, code)}
          />
        </>
      )}
      <SignOutButton />
    </Frame>
  );
}
