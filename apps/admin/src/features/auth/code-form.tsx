import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { type FormEvent, useState } from 'react';

import { ErrorNotice } from '@/components/error-notice';

import type { VerifyResult } from './auth-store';

const failures: Record<Exclude<VerifyResult, 'verified'>, string> = {
  invalid: 'That code is not right, or it has expired. Enter the code the app shows now.',
  'rate-limited': 'Too many attempts. Wait a minute and try again.',
  unreachable: 'The code could not be checked. Check the connection and try again.',
};

const codeLength = 6;

export function CodeForm({
  submitLabel,
  verify,
}: {
  submitLabel: string;
  verify: (code: string) => Promise<VerifyResult>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || code.length !== codeLength) return;
    setBusy(true);
    setFailure(null);
    const result = await verify(code);
    if (result !== 'verified') {
      setFailure(failures[result]);
      setCode('');
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={(event) => void submit(event)} noValidate>
      <div className="grid gap-2">
        <Label htmlFor="code">Code from the authenticator app</Label>
        <Input
          id="code"
          data-testid="code"
          className="h-12 text-center font-mono text-xl tracking-[0.4em] tabular-nums"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, codeLength))}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern={`[0-9]{${codeLength}}`}
          autoFocus
          required
        />
      </div>
      {failure && <ErrorNotice testId="code-error">{failure}</ErrorNotice>}
      <Button type="submit" className="h-11" disabled={busy || code.length !== codeLength}>
        {submitLabel}
      </Button>
    </form>
  );
}
