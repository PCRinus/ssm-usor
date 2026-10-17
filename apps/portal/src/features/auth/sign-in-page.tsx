import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { Notice } from '@/components/notice';

import { useAuth } from './auth-context';
import type { CodeVerificationResult, SignInAddress } from './auth-store';
import { parseSignInAddress } from './sign-in-address';

// Supabase sends one code per address per minute and refuses a second request before.
const resendDelayMs = 60_000;
const codeLength = 6;

const unreachableMessage =
  'Cererea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.';

type Target = { address: SignInAddress; shown: string };

function useResendCountdown() {
  const [clock, setClock] = useState({ until: 0, now: 0 });
  useEffect(() => {
    if (clock.until === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock((current) => ({ ...current, now }));
      if (now >= clock.until) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clock.until]);
  return {
    secondsLeft: Math.max(0, Math.ceil((clock.until - clock.now) / 1000)),
    restart() {
      const now = Date.now();
      setClock({ until: now + resendDelayMs, now });
    },
  };
}

export function SignInPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const { secondsLeft, restart: restartCountdown } = useResendCountdown();

  async function request(next: Target) {
    setRequesting(true);
    const result = await auth.requestCode(next.address);
    setRequesting(false);
    if (result === 'unreachable') return false;
    restartCountdown();
    return true;
  }

  async function submitAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requesting) return;
    setRequesting(true);
    const parsed = await parseSignInAddress(input).catch(
      () => ({ ok: false, message: unreachableMessage }) as const
    );
    if (!parsed.ok) {
      setRequesting(false);
      setAddressError(parsed.message);
      return;
    }
    setAddressError(null);
    const next = { address: parsed.address, shown: parsed.shown };
    if (await request(next)) setTarget(next);
    else setAddressError(unreachableMessage);
  }

  return (
    <main data-testid="sign-in-page" className="flex min-h-svh flex-col gap-8 py-10">
      <img src="/brand/logo.png" alt="SSM Ușor" width={2172} height={724} className="h-auto w-36" />
      {target ? (
        <CodeStep
          key={target.shown}
          target={target}
          secondsLeft={secondsLeft}
          requesting={requesting}
          onResend={() => request(target)}
          onChangeAddress={() => {
            setTarget(null);
            setAddressError(null);
          }}
          onVerify={(code) => auth.verifyCode(target.address, code)}
          onSignedIn={() => navigate({ to: '/', replace: true })}
        />
      ) : (
        <section className="grid gap-6" aria-labelledby="sign-in-title">
          <div className="grid gap-2">
            <h1 id="sign-in-title" className="text-2xl font-semibold tracking-tight">
              Intră în portal
            </h1>
            <p className="leading-relaxed text-muted-foreground">
              Scrie adresa de email sau numărul de telefon la care ai primit invitația. Îți trimitem
              acolo un cod de intrare.
            </p>
          </div>
          <form className="grid gap-5" noValidate onSubmit={(event) => void submitAddress(event)}>
            <div className="grid gap-2">
              <Label htmlFor="sign-in-address">Email sau număr de telefon</Label>
              <Input
                id="sign-in-address"
                data-testid="sign-in-address"
                className="h-12 text-base"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                type="text"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="nume@exemplu.ro sau 0721 234 567"
                disabled={requesting}
                aria-invalid={Boolean(addressError)}
                aria-describedby={addressError ? 'sign-in-address-error' : undefined}
              />
              {addressError && (
                <p
                  id="sign-in-address-error"
                  data-testid="sign-in-address-error"
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {addressError}
                </p>
              )}
            </div>
            <Button
              type="submit"
              data-testid="sign-in-request"
              className="h-12 w-full text-base"
              disabled={requesting}
            >
              {requesting ? 'Se trimite…' : 'Trimite codul'}
            </Button>
          </form>
        </section>
      )}
    </main>
  );
}

function CodeStep({
  target,
  secondsLeft,
  requesting,
  onResend,
  onChangeAddress,
  onVerify,
  onSignedIn,
}: {
  target: Target;
  secondsLeft: number;
  requesting: boolean;
  onResend: () => Promise<boolean>;
  onChangeAddress: () => void;
  onVerify: (code: string) => Promise<CodeVerificationResult>;
  onSignedIn: () => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => codeInput.current?.focus(), []);

  async function verify(value: string) {
    if (verifying) return;
    if (value.length !== codeLength) {
      setError('Codul are șase cifre.');
      return;
    }
    setVerifying(true);
    setError(null);
    const result = await onVerify(value);
    if (result === 'signed-in') {
      await onSignedIn();
      return;
    }
    setVerifying(false);
    setError(
      result === 'invalid'
        ? 'Codul nu este corect sau a expirat. Verifică-l sau cere un cod nou.'
        : result === 'rate-limited'
          ? 'Prea multe încercări. Așteaptă puțin și încearcă din nou.'
          : unreachableMessage
    );
    codeInput.current?.select();
  }

  async function resend() {
    setResent(false);
    setError(null);
    if (await onResend()) {
      setCode('');
      setResent(true);
      codeInput.current?.focus();
    } else {
      setError(unreachableMessage);
    }
  }

  return (
    <section className="grid gap-6" aria-labelledby="sign-in-code-title">
      <div className="grid gap-2">
        <h1 id="sign-in-code-title" className="text-2xl font-semibold tracking-tight">
          Scrie codul primit
        </h1>
        <p data-testid="sign-in-code-sent" className="leading-relaxed text-muted-foreground">
          Dacă adresa este cunoscută, un cod este pe drum spre{' '}
          <span
            data-testid="sign-in-code-target"
            className="block font-medium wrap-anywhere text-foreground"
          >
            {target.shown}
          </span>{' '}
          Codul are șase cifre.
        </p>
      </div>
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="sign-in-code">Codul de intrare</Label>
          <Input
            ref={codeInput}
            id="sign-in-code"
            data-testid="sign-in-code"
            className="h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
            value={code}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, codeLength);
              setCode(digits);
              if (digits.length === codeLength) void verify(digits);
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={codeLength}
            disabled={verifying}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'sign-in-code-error' : undefined}
          />
          {error && (
            <p
              id="sign-in-code-error"
              data-testid="sign-in-code-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
        <Button
          type="submit"
          data-testid="sign-in-verify"
          className="h-12 w-full text-base"
          disabled={verifying}
        >
          {verifying ? 'Se verifică…' : 'Intră'}
        </Button>
      </form>
      {resent && (
        <Notice variant="info" data-testid="sign-in-code-resent">
          Am cerut un cod nou. Folosește-l pe cel mai recent.
        </Notice>
      )}
      <div className="grid gap-1">
        <Button
          type="button"
          variant="outline"
          data-testid="sign-in-resend"
          className="h-12 w-full"
          disabled={secondsLeft > 0 || requesting || verifying}
          onClick={() => void resend()}
        >
          {secondsLeft > 0 ? `Trimite alt cod în ${secondsLeft} s` : 'Trimite alt cod'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="sign-in-change-address"
          className="h-12 w-full"
          disabled={verifying}
          onClick={onChangeAddress}
        >
          Folosește altă adresă
        </Button>
      </div>
    </section>
  );
}
