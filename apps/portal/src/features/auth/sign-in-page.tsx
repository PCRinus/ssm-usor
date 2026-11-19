import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useCaptcha } from '@ssm-usor/spa-runtime/captcha';
import { useSecondsLeft } from '@ssm-usor/spa-runtime/countdown';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Notice } from '@ssm-usor/ui/components/notice';
import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, type Ref, useEffect, useRef, useState } from 'react';

import { PublicFrame } from '@/app/public-frame';
import { CodeInput } from '@/components/code-input';
import { deviceLocale, useActiveLocale } from '@/features/language/locale';
import { unreachableMessage } from '@/features/signing/signing-messages';

import { useAuth } from './auth-context';
import type { CodeRequestResult, CodeVerificationResult, SignInAddress } from './auth-store';
import { parseSignInAddress } from './sign-in-address';

// Supabase sends one code per address per minute and refuses a second request before.
const resendDelaySeconds = 60;
const codeLength = { min: 6, max: 8 };

const requestFailures: Record<Exclude<CodeRequestResult, 'requested'>, MessageDescriptor> = {
  unreachable: unreachableMessage,
  'challenge-failed': msg`Verificarea de securitate nu a reușit. Reîncarcă pagina și încearcă din nou.`,
};

type Target = { address: SignInAddress; shown: string };

export function SignInPage() {
  const { t, i18n } = useLingui();
  const { auth } = useAuth();
  const navigate = useNavigate();
  const { ref: captchaRef, withToken } = useCaptcha();
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [addressError, setAddressError] = useState<MessageDescriptor | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [resendUntil, setResendUntil] = useState<number | null>(null);
  const secondsLeft = useSecondsLeft(resendUntil);
  useActiveLocale(deviceLocale());

  async function request(next: Target) {
    setRequesting(true);
    const result = await withToken((token) => auth.requestCode(next.address, token));
    setRequesting(false);
    if (result !== 'requested') return requestFailures[result];
    setResendUntil(Date.now() + resendDelaySeconds * 1000);
    return null;
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
    const failure = await request(next);
    if (failure) setAddressError(failure);
    else setTarget(next);
  }

  if (target) {
    return (
      <PublicFrame
        testId="sign-in-page"
        title={t`Scrie codul primit`}
        description={
          <span data-testid="sign-in-code-sent">
            {'phone' in target.address ? (
              // The same words whether the number has an account, was refused by the SMS hook or
              // was texted: anything else would say which numbers have an account.
              <Trans>
                Dacă numărul are cont în portal, codul vine prin SMS în câteva minute la{' '}
                <span
                  data-testid="sign-in-code-target"
                  className="block font-medium wrap-anywhere text-foreground"
                >
                  {target.shown}
                </span>
                <span className="mt-2 block">
                  Dacă nu primești nimic, cere-i specialistului SSM să-ți trimită invitația pe
                  email.
                </span>
              </Trans>
            ) : (
              <Trans>
                Dacă adresa este cunoscută, un cod este pe drum spre{' '}
                <span
                  data-testid="sign-in-code-target"
                  className="block font-medium wrap-anywhere text-foreground"
                >
                  {target.shown}
                </span>
              </Trans>
            )}
          </span>
        }
      >
        <CodeStep
          key={target.shown}
          secondsLeft={secondsLeft}
          requesting={requesting}
          captchaRef={captchaRef}
          onResend={() => request(target)}
          onChangeAddress={() => {
            setTarget(null);
            setAddressError(null);
          }}
          onVerify={(code) => auth.verifyCode(target.address, code)}
          onSignedIn={() => navigate({ to: '/', replace: true })}
        />
      </PublicFrame>
    );
  }

  return (
    <PublicFrame
      testId="sign-in-page"
      title={t`Intră în portal`}
      description={t`Scrie adresa de email sau numărul de telefon la care ai primit invitația. Îți trimitem acolo un cod de intrare.`}
    >
      <form className="grid gap-5" noValidate onSubmit={(event) => void submitAddress(event)}>
        <div className="grid gap-2">
          <Label htmlFor="sign-in-address">
            <Trans>Email sau număr de telefon</Trans>
          </Label>
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
            placeholder={t`nume@exemplu.ro sau 0721 234 567`}
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
              {i18n._(addressError)}
            </p>
          )}
        </div>
        <div ref={captchaRef} />
        <Button
          type="submit"
          data-testid="sign-in-request"
          className="h-12 w-full text-base"
          disabled={requesting}
        >
          {requesting ? t`Se trimite…` : t`Trimite codul`}
        </Button>
      </form>
    </PublicFrame>
  );
}

function CodeStep({
  secondsLeft,
  requesting,
  captchaRef,
  onResend,
  onChangeAddress,
  onVerify,
  onSignedIn,
}: {
  secondsLeft: number;
  requesting: boolean;
  captchaRef: Ref<HTMLDivElement>;
  onResend: () => Promise<MessageDescriptor | null>;
  onChangeAddress: () => void;
  onVerify: (code: string) => Promise<CodeVerificationResult>;
  onSignedIn: () => Promise<void>;
}) {
  const { t, i18n } = useLingui();
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<MessageDescriptor | null>(null);
  const [resent, setResent] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => codeInput.current?.focus(), []);

  async function verify(value: string) {
    if (verifying) return;
    if (value.length < codeLength.min) {
      setError(msg`Scrie toate cifrele din cod.`);
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
        ? msg`Codul nu este corect sau a expirat. Verifică-l sau cere un cod nou.`
        : result === 'rate-limited'
          ? msg`Prea multe încercări. Așteaptă puțin și încearcă din nou.`
          : unreachableMessage
    );
    codeInput.current?.select();
  }

  async function resend() {
    setResent(false);
    setError(null);
    const failure = await onResend();
    if (failure) {
      setError(failure);
    } else {
      setCode('');
      setResent(true);
      codeInput.current?.focus();
    }
  }

  return (
    <>
      <form
        className="grid gap-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="sign-in-code">
            <Trans>Codul de intrare</Trans>
          </Label>
          <CodeInput
            ref={codeInput}
            id="sign-in-code"
            data-testid="sign-in-code"
            value={code}
            onValueChange={setCode}
            length={codeLength}
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
              {i18n._(error)}
            </p>
          )}
        </div>
        <Button
          type="submit"
          data-testid="sign-in-verify"
          className="h-12 w-full text-base"
          disabled={verifying}
        >
          {verifying ? t`Se verifică…` : t`Intră`}
        </Button>
      </form>
      {resent && (
        <Notice variant="info" data-testid="sign-in-code-resent">
          <Trans>Am cerut un cod nou. Folosește-l pe cel mai recent.</Trans>
        </Notice>
      )}
      <div ref={captchaRef} />
      <div className="grid gap-1">
        <Button
          type="button"
          variant="outline"
          data-testid="sign-in-resend"
          className="h-12 w-full"
          disabled={secondsLeft > 0 || requesting || verifying}
          onClick={() => void resend()}
        >
          {secondsLeft > 0 ? t`Trimite alt cod în ${secondsLeft} s` : t`Trimite alt cod`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="sign-in-change-address"
          className="h-12 w-full"
          disabled={verifying}
          onClick={onChangeAddress}
        >
          <Trans>Folosește altă adresă</Trans>
        </Button>
      </div>
    </>
  );
}
