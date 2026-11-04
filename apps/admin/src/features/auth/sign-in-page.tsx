import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { type FormEvent, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';
import { Frame } from '@/components/frame';

import { useAuth } from './auth-context';
import type { SignInResult } from './auth-store';
import { useCaptcha } from './captcha';

const failures: Record<Exclude<SignInResult, 'signed-in'>, string> = {
  invalid: 'The email or the password is not right.',
  'challenge-failed': 'The security check did not pass. Reload the page and try again.',
  'rate-limited': 'Too many attempts. Wait a few minutes and try again.',
  unreachable: 'Sign-in could not reach the server. Check the connection and try again.',
};

export function SignInPage() {
  const { auth } = useAuth();
  const { ref: captchaRef, withToken } = useCaptcha();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailure(null);
    const result = await withToken((token) => auth.signIn(email.trim(), password, token));
    if (result !== 'signed-in') {
      setFailure(failures[result]);
      setBusy(false);
    }
  }

  return (
    <Frame testId="sign-in-page" title="Admin sign-in">
      <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
        <div className="grid gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            data-testid="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            data-testid="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <div ref={captchaRef} />
        {failure && <ErrorNotice testId="sign-in-error">{failure}</ErrorNotice>}
        <Button type="submit" className="h-11" disabled={busy}>
          Sign in
        </Button>
      </form>
    </Frame>
  );
}
