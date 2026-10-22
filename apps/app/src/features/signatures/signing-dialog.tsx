import {
  formatEmployeeName,
  signatureErrorReasons,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { useRouteContext } from '@tanstack/react-router';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  type SignatureRequestListResponseItemsItem,
  type SigningSessionResponse,
  type SignSessionResponse,
  useCreateMySigningSession,
  useSignMySigningSession,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';

import { AgreementWarning } from './agreement-warning';
import {
  attemptsLeftOf,
  codeNeedsRenewal,
  reasonOf,
  renewalMessages,
  requestDocument,
  signAsLabel,
  signingFailure,
  signingItemFailures,
  signingSessionFailure,
  trainingCount,
  wrongCodeMessage,
} from './signature-format';
import { invalidateSignatures } from './signature-queries';

type SignatureRequest = SignatureRequestListResponseItemsItem;

const codeLength = 6;

const timeFormat = new Intl.DateTimeFormat('ro-RO', { hour: '2-digit', minute: '2-digit' });

type Step =
  | { kind: 'review' }
  | { kind: 'code'; session: SigningSessionResponse }
  | { kind: 'result'; result: SignSessionResponse };

export function SigningDialog({
  requests,
  open,
  onClose,
}: {
  requests: SignatureRequest[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <SigningFlow requests={requests} onClose={onClose} />}
    </Dialog>
  );
}

function SigningFlow({
  requests: chosen,
  onClose,
}: {
  requests: SignatureRequest[];
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const create = useCreateMySigningSession({ request: apiRequest });
  const sign = useSignMySigningSession({ request: apiRequest });
  // What the code signs stays as it was opened, whatever the list refetches meanwhile.
  const [requests] = useState(chosen);
  const [step, setStep] = useState<Step>({ kind: 'review' });
  const [sendError, setSendError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [renewal, setRenewal] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const touched = useRef(false);
  const codeInput = useRef<HTMLInputElement>(null);
  const wantsFocus = useRef(false);
  const busy = create.isPending || sign.isPending;

  // The field exists, and is no longer busy, only in the render that follows the request.
  useEffect(() => {
    if (busy || !wantsFocus.current) return;
    wantsFocus.current = false;
    codeInput.current?.focus();
  });

  // On unmount, so that the close button and Escape refresh the lists as well.
  useEffect(
    () => () => {
      if (!touched.current) return;
      for (const clientId of new Set(requests.map((request) => request.client.id))) {
        void invalidateSignatures(queryClient, clientId);
      }
    },
    [requests, queryClient]
  );

  async function sendCode() {
    setSendError(null);
    try {
      const session = await create.mutateAsync({
        data: { requestIds: requests.map((request) => request.id) },
      });
      setStep({ kind: 'code', session });
      setCode('');
      setCodeError(null);
      setRenewal(null);
      setSignError(null);
      wantsFocus.current = true;
    } catch (cause) {
      if (reasonOf(cause) === signatureErrorReasons.signingItemNotFound) touched.current = true;
      setSendError(signingSessionFailure(cause));
    }
  }

  async function submitCode(sessionId: string) {
    if (!new RegExp(`^\\d{${codeLength}}$`).test(code)) {
      setCodeError(`Scrie codul de ${codeLength} cifre primit.`);
      codeInput.current?.focus();
      return;
    }
    setCodeError(null);
    setSignError(null);
    touched.current = true;
    try {
      const result = await sign.mutateAsync({ sessionId, data: { code } });
      setStep({ kind: 'result', result });
    } catch (cause) {
      const reason = reasonOf(cause);
      if (reason === signatureErrorReasons.codeInvalid) {
        const left = attemptsLeftOf(cause);
        if (left === 0) {
          setRenewal(renewalMessages[signatureErrorReasons.codeAttemptsExceeded]!);
        } else {
          setCodeError(
            left === null
              ? 'Codul nu este corect. Verifică-l și scrie-l din nou.'
              : wrongCodeMessage(left)
          );
          setCode('');
          wantsFocus.current = true;
        }
      } else if (reason && codeNeedsRenewal.has(reason)) {
        setRenewal(renewalMessages[reason]!);
      } else {
        setSignError(
          signingFailure(cause, 'Nu am putut semna. Verifică conexiunea și încearcă din nou.')
        );
      }
    }
  }

  const count = trainingCount(requests.length);

  return (
    <DialogContent
      data-testid="signing-dialog"
      data-step={step.kind}
      className="sm:max-w-lg"
      onInteractOutside={(event) => busy && event.preventDefault()}
      onEscapeKeyDown={(event) => busy && event.preventDefault()}
    >
      {step.kind === 'review' && (
        <>
          <DialogHeader>
            <DialogTitle>Semnezi {count}</DialogTitle>
            <DialogDescription>
              Verifică lista. Îți trimitem un cod pe email, iar cu el le semnezi pe toate odată.
              Dacă nu recunoști o instruire, închide și debifeaz-o.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <RequestList requests={requests} />
          </DialogBody>
          {sendError && (
            <Notice variant="destructive" data-testid="signing-send-error">
              {sendError}
            </Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Renunță
            </Button>
            <Button
              type="button"
              data-testid="signing-send"
              disabled={busy}
              onClick={() => void sendCode()}
            >
              {create.isPending ? 'Se trimite…' : 'Trimite codul'}
            </Button>
          </DialogFooter>
        </>
      )}

      {step.kind === 'code' && (
        <form
          className="grid gap-4"
          noValidate
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void submitCode(step.session.sessionId);
          }}
        >
          <DialogHeader>
            <DialogTitle>Scrie codul</DialogTitle>
            <DialogDescription data-testid="signing-address">
              Am trimis un cod {step.session.channel === 'sms' ? 'prin SMS ' : ''}la{' '}
              <span className="font-medium text-foreground">{step.session.addressHint}</span>. Cu el
              semnezi {count}. Este valabil până la{' '}
              <span className="tabular-nums">
                {timeFormat.format(new Date(step.session.expiresAt))}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <details data-testid="signing-code-items" className="group text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Ce semnează codul
            </summary>
            <div className="mt-2">
              <RequestList requests={requests} />
            </div>
          </details>
          {renewal ? (
            <Notice
              variant="warning"
              data-testid="signing-renewal"
              action={
                <Button
                  type="button"
                  variant="outline"
                  data-testid="signing-renew"
                  disabled={busy}
                  onClick={() => void sendCode()}
                >
                  {create.isPending ? 'Se trimite…' : 'Cere un cod nou'}
                </Button>
              }
            >
              {renewal}
            </Notice>
          ) : (
            <Field
              id="signing-code"
              label="Codul de semnare"
              error={codeError ? { type: 'manual', message: codeError } : undefined}
            >
              <Input
                ref={codeInput}
                id="signing-code"
                data-testid="signing-code"
                className="h-14 text-center font-mono text-2xl tracking-[0.5em] tabular-nums"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, '').slice(0, codeLength))
                }
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern={`[0-9]{${codeLength}}`}
                readOnly={busy}
                aria-busy={busy}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? 'signing-code-error' : undefined}
              />
            </Field>
          )}
          {(sendError ?? signError) && (
            <Notice variant="destructive" data-testid="signing-error">
              {sendError ?? signError}
            </Notice>
          )}
          <DialogFooter className="items-center sm:justify-between">
            {renewal ? (
              <span />
            ) : (
              <Button
                type="button"
                variant="link"
                className="px-0"
                data-testid="signing-resend"
                disabled={busy}
                onClick={() => void sendCode()}
              >
                N-a ajuns? Cere un cod nou
              </Button>
            )}
            <div className="flex flex-col-reverse gap-2 self-stretch sm:flex-row sm:self-auto">
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                Renunță
              </Button>
              {!renewal && (
                <Button type="submit" data-testid="signing-submit" disabled={busy}>
                  {sign.isPending ? 'Se semnează…' : 'Semnează'}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      )}

      {step.kind === 'result' && (
        <SigningResult requests={requests} result={step.result} onClose={onClose} />
      )}
    </DialogContent>
  );
}

function SigningResult({
  requests,
  result,
  onClose,
}: {
  requests: SignatureRequest[];
  result: SignSessionResponse;
  onClose: () => void;
}) {
  const byId = new Map(requests.map((request) => [request.id, request]));
  const signed = result.signed.flatMap(({ requestId }) => byId.get(requestId) ?? []);
  const failed = result.failed.flatMap(({ requestId, reason }) => {
    const request = byId.get(requestId);
    return request ? [{ request, reason }] : [];
  });
  const title =
    failed.length === 0
      ? 'Semnat'
      : signed.length === 0
        ? 'Nu s-a semnat nimic'
        : 'Semnat în parte';
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription data-testid="signing-result-summary">
          {failed.length === 0
            ? `Ai semnat ${trainingCount(signed.length)}. Semnăturile sunt pe fișele angajaților.`
            : signed.length === 0
              ? 'Nicio instruire nu a fost semnată. Vezi mai jos de ce.'
              : `Ai semnat ${signed.length} din ${trainingCount(requests.length)}. Celelalte rămân în listă.`}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="grid gap-5">
        {failed.length > 0 && (
          <section className="grid gap-2" aria-labelledby="signing-failed-heading">
            <h3 id="signing-failed-heading" className="text-sm font-semibold">
              Nesemnate
            </h3>
            <ul className="divide-y rounded-md border">
              {failed.map(({ request, reason }) => (
                <RequestItem
                  key={request.id}
                  request={request}
                  testId="signing-failed"
                  icon={<CircleAlert aria-hidden="true" className="size-4 text-destructive" />}
                >
                  <p className="mt-1 text-sm text-destructive" data-testid="signing-failed-reason">
                    {signingItemFailures[reason]}
                  </p>
                </RequestItem>
              ))}
            </ul>
          </section>
        )}
        {signed.length > 0 && (
          <section className="grid gap-2" aria-labelledby="signing-signed-heading">
            <h3 id="signing-signed-heading" className="text-sm font-semibold">
              Semnate
            </h3>
            <ul className="divide-y rounded-md border">
              {signed.map((request) => (
                <RequestItem
                  key={request.id}
                  request={request}
                  testId="signing-signed"
                  icon={
                    <CircleCheck aria-hidden="true" className="size-4 text-success-foreground" />
                  }
                />
              ))}
            </ul>
          </section>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" data-testid="signing-close" onClick={onClose}>
          Închide
        </Button>
      </DialogFooter>
    </>
  );
}

function RequestList({ requests }: { requests: SignatureRequest[] }) {
  return (
    <ul className="divide-y rounded-md border">
      {requests.map((request) => (
        <RequestItem key={request.id} request={request} testId="signing-item" />
      ))}
    </ul>
  );
}

function RequestItem({
  request,
  testId,
  icon,
  children,
}: {
  request: SignatureRequest;
  testId: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  const document = requestDocument(request);
  return (
    <li data-testid={testId} data-kind={request.kind} className="flex gap-3 px-4 py-3">
      {icon && <span className="mt-1 shrink-0">{icon}</span>}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{formatEmployeeName(request.employee)}</span>
          <Badge variant="secondary">{trainingDomainLabels[document.domain]}</Badge>
          <AgreementWarning agreement={request.agreement} />
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {document.summary} · {signAsLabel(request.slot)}
        </p>
        <p className="text-xs text-muted-foreground">{request.client.name}</p>
        {children}
      </div>
    </li>
  );
}
