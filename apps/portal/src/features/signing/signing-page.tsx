import type { MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import type { ApiErrorResponse } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Label } from '@ssm-usor/ui/components/label';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';

import {
  createPortalSigningSession,
  type SigningSessionResponse,
  signPortalSigningSession,
  type SignSessionResponse,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { CodeInput } from '@/components/code-input';
import { Notice } from '@/components/notice';
import { cardClass, Page, PageFailed, PageHeader, PageLoading } from '@/components/page';
import {
  type Participation,
  useParticipation,
} from '@/features/participation/participation-context';
import { TrainingMaterial } from '@/features/training/training-material';
import { useFormatDuration } from '@/lib/format';
import { useApiRequest } from '@/lib/request';

import { AgreementPdfButton } from './agreement-pdf-button';
import { SigningItemText } from './signing-item-text';
import { agreementKey, type SigningItem, useSigningItems } from './signing-items';
import {
  itemFailureMessages,
  sessionFailureMessages,
  spentCodeMessages,
  unreachableMessage,
} from './signing-messages';

// The API sends one signing code per account a minute.
const resendDelayMs = 60_000;
const codeLength = { min: 6, max: 6 };

type Step =
  | { kind: 'choose' }
  | {
      kind: 'code';
      session: SigningSessionResponse;
      items: SigningItem[];
      sentAt: number;
      resent: boolean;
    }
  | { kind: 'result'; items: SigningItem[]; result: SignSessionResponse };

const reasonOf = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? ((cause.body as Partial<ApiErrorResponse> | null)?.reason ?? null)
    : null;

const messageOf = (cause: unknown) =>
  cause instanceof ApiHttpError
    ? ((cause.body as Partial<ApiErrorResponse> | null)?.message ?? '')
    : '';

type SessionFailure = { message: MessageDescriptor; rateLimited: boolean };

function sessionFailureOf(cause: unknown): SessionFailure {
  const reason = reasonOf(cause);
  if (reason === 'code_rate_limited') {
    return { message: msg`Ai cerut un cod acum mai puțin de un minut.`, rateLimited: true };
  }
  if (reason && reason in sessionFailureMessages) {
    return {
      message: sessionFailureMessages[reason as keyof typeof sessionFailureMessages],
      rateLimited: false,
    };
  }
  return { message: unreachableMessage, rateLimited: false };
}

function useCountdown(initialUntil = 0) {
  const [clock, setClock] = useState(() => ({ until: initialUntil, now: Date.now() }));
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

function sessionBody(items: SigningItem[]) {
  const requestIds = items.flatMap((item) => (item.kind === 'request' ? [item.request.id] : []));
  const agreementEmployeeIds = items.flatMap((item) =>
    item.kind === 'agreement' ? [item.employeeId] : []
  );
  return agreementEmployeeIds.length > 0 ? { requestIds, agreementEmployeeIds } : { requestIds };
}

export function SigningPage({ agreementOnly }: { agreementOnly?: string }) {
  const participation = useParticipation();
  const [step, setStep] = useState<Step>({ kind: 'choose' });

  return (
    <Page testId="signing-page" className="max-w-[44rem]">
      <StepHeader step={step.kind} />
      {step.kind === 'choose' && (
        <ChooseStep
          participation={participation}
          agreementOnly={agreementOnly}
          onSent={(session, items) =>
            setStep({ kind: 'code', session, items, sentAt: Date.now(), resent: false })
          }
        />
      )}
      {step.kind === 'code' && (
        <CodeStep
          key={step.session.sessionId}
          participation={participation}
          session={step.session}
          items={step.items}
          sentAt={step.sentAt}
          resent={step.resent}
          onResent={(session) => setStep({ ...step, session, sentAt: Date.now(), resent: true })}
          onBack={() => setStep({ kind: 'choose' })}
          onSigned={(result) => setStep({ kind: 'result', items: step.items, result })}
        />
      )}
      {step.kind === 'result' && (
        <ResultStep
          participation={participation}
          items={step.items}
          result={step.result}
          onAgain={() => setStep({ kind: 'choose' })}
        />
      )}
    </Page>
  );
}

function StepHeader({ step }: { step: Step['kind'] }) {
  const { t } = useLingui();
  const steps: { kind: Step['kind']; label: string }[] = [
    { kind: 'choose', label: t`Alegi` },
    { kind: 'code', label: t`Codul` },
    { kind: 'result', label: t`Gata` },
  ];
  const current = steps.findIndex((each) => each.kind === step);
  const titles: Record<Step['kind'], string> = {
    choose: t`Ce semnezi`,
    code: t`Scrie codul`,
    result: t`Rezultatul`,
  };
  return (
    <div className="grid gap-4">
      <ol className="flex gap-1.5" aria-label={t`Pașii semnării`} data-testid="signing-steps">
        {steps.map((each, index) => (
          <li
            key={each.kind}
            aria-current={index === current ? 'step' : undefined}
            className={cn(
              'flex flex-1 flex-col gap-1.5 text-xs font-medium text-muted-foreground',
              index <= current && 'text-foreground'
            )}
          >
            <span
              className={cn(
                'h-1 rounded-full bg-muted',
                index < current && 'bg-primary',
                index === current && 'bg-brand-lime'
              )}
            />
            {each.label}
          </li>
        ))}
      </ol>
      <PageHeader title={titles[step]} />
    </div>
  );
}

function ChooseStep({
  participation,
  agreementOnly,
  onSent,
}: {
  participation: Participation;
  agreementOnly?: string;
  onSent: (session: SigningSessionResponse, items: SigningItem[]) => void;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const { items, isPending, isError, refetch } = useSigningItems(participation);
  const [choice, setChoice] = useState<Set<string> | null>(null);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<SessionFailure | null>(null);
  const { secondsLeft, restart } = useCountdown();

  if (isPending) return <PageLoading />;
  if (isError) return <PageFailed onRetry={refetch} />;
  if (items.length === 0) {
    return (
      <div data-testid="signing-nothing" className="grid gap-4">
        <p className="text-[0.9375rem] leading-relaxed text-foreground/80">
          <Trans>Nimic nu mai așteaptă semnătura ta.</Trans>
        </p>
        <Button asChild variant="outline" className="h-12 sm:w-fit">
          <Link to="/">
            <Trans>Înapoi la Acasă</Trans>
          </Link>
        </Button>
      </div>
    );
  }

  const defaultChoice = agreementOnly
    ? new Set([agreementKey(agreementOnly)])
    : new Set(items.map((item) => item.key));
  const chosen = choice ?? defaultChoice;
  const selected = items.filter((item) => chosen.has(item.key));
  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setChoice(next);
  };
  const agreementsSigned = new Set(
    selected.flatMap((item) => (item.kind === 'agreement' ? [item.employeeId] : []))
  );
  const ownAgreementItem = items.find(
    (item) => item.kind === 'agreement' && item.party === 'employee'
  );
  const ownRecordsWithoutAgreement =
    ownAgreementItem !== undefined &&
    !chosen.has(ownAgreementItem.key) &&
    selected.some(
      (item) =>
        item.kind === 'request' && item.request.record.employee.id === participation.employeeId
    );

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending || selected.length === 0) return;
    setSending(true);
    setFailure(null);
    try {
      const session = await createPortalSigningSession(
        participation.participantId,
        sessionBody(selected),
        apiRequest
      );
      onSent(session, selected);
    } catch (cause) {
      const next = sessionFailureOf(cause);
      setFailure(next);
      if (next.rateLimited) restart();
      if (reasonOf(cause) === 'signing_item_not_found') {
        setChoice(null);
        void queryClient.invalidateQueries();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <form className="grid gap-5" noValidate onSubmit={(event) => void send(event)}>
      <p className="text-[0.9375rem] leading-relaxed text-foreground/80">
        <Trans>
          Bifează ce vrei să semnezi. Îți trimitem un cod, iar codul semnează doar ce ai bifat.
        </Trans>
      </p>
      <ul className={cn(cardClass, 'divide-y overflow-hidden')} data-testid="signing-items">
        {items.map((item) => (
          <ChooseRow
            key={item.key}
            item={item}
            participation={participation}
            checked={chosen.has(item.key)}
            onToggle={() => toggle(item.key)}
            agreementsSigned={agreementsSigned}
          />
        ))}
      </ul>
      {ownRecordsWithoutAgreement && (
        <Notice variant="warning" data-testid="signing-agreement-warning">
          <Trans>
            Poți semna instruirile și fără acordul de semnare electronică, dar specialistul le va
            vedea cu mențiunea „act adițional nesemnat” până îl semnezi.
          </Trans>
        </Notice>
      )}
      {failure && (
        <Notice variant="destructive" data-testid="signing-send-error">
          {i18n._(failure.message)}
          {secondsLeft > 0 && ' '}
          {secondsLeft > 0 && t`Poți cere altul în ${secondsLeft} s.`}
        </Notice>
      )}
      <div className="grid gap-2">
        <Button
          type="submit"
          data-testid="signing-send"
          className="h-12 w-full text-base sm:w-fit sm:px-8"
          disabled={sending || selected.length === 0 || secondsLeft > 0}
        >
          {sending && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {sending ? t`Se trimite…` : t`Trimite codul`}
        </Button>
        <p className="text-sm text-muted-foreground" data-testid="signing-selected-count">
          {selected.length === 0
            ? t`Nu ai bifat nimic.`
            : t`Ai bifat ${selected.length} din ${items.length}.`}
        </p>
      </div>
    </form>
  );
}

function ChooseRow({
  item,
  participation,
  checked,
  onToggle,
  agreementsSigned,
}: {
  item: SigningItem;
  participation: Participation;
  checked: boolean;
  onToggle: () => void;
  agreementsSigned: ReadonlySet<string>;
}) {
  const { t } = useLingui();
  const formatDuration = useFormatDuration();
  const id = useId();
  const record = item.kind === 'request' ? item.request.record : null;
  return (
    <li
      data-testid="signing-item"
      data-kind={item.kind}
      className={cn('grid gap-2 px-4 py-3.5 sm:px-5', checked && 'bg-accent/40')}
    >
      <div className="flex items-start gap-3.5">
        <Checkbox
          id={id}
          data-testid="signing-item-check"
          checked={checked}
          onCheckedChange={onToggle}
          className="mt-0.5 size-6 rounded-md [&_svg]:size-4.5"
        />
        <Label htmlFor={id} className="block min-w-0 flex-1 cursor-pointer font-normal">
          <SigningItemText
            item={item}
            ownEmployeeId={participation.employeeId}
            agreementsSigned={agreementsSigned}
          />
        </Label>
      </div>
      <div className="grid gap-1.5 pl-9.5">
        {record && (
          <>
            <p className="text-[0.8125rem] text-muted-foreground">
              {record.trainer.jobTitle
                ? t`${formatDuration(record.durationMinutes)}. Instructor ${record.trainer.name}, ${record.trainer.jobTitle}.`
                : t`${formatDuration(record.durationMinutes)}. Instructor ${record.trainer.name}.`}
            </p>
            <TrainingMaterial text={record.material} />
          </>
        )}
        {item.kind === 'agreement' && (
          <AgreementPdfButton participation={participation} employeeId={item.employeeId} />
        )}
      </div>
    </li>
  );
}

type CodeError =
  | { kind: 'invalid'; attemptsLeft: number | null }
  | { kind: 'spent'; message: MessageDescriptor }
  | { kind: 'other'; message: MessageDescriptor };

function attemptsLeftIn(message: string) {
  if (/no attempt/i.test(message)) return 0;
  if (/one attempt/i.test(message)) return 1;
  const count = /(\d+) attempts/i.exec(message);
  return count ? Number(count[1]) : null;
}

function codeErrorOf(cause: unknown): CodeError {
  const reason = reasonOf(cause);
  if (reason === 'code_invalid') {
    const attemptsLeft = attemptsLeftIn(messageOf(cause));
    return attemptsLeft === 0
      ? { kind: 'spent', message: spentCodeMessages.code_attempts_exceeded }
      : { kind: 'invalid', attemptsLeft };
  }
  if (reason && reason in spentCodeMessages) {
    return { kind: 'spent', message: spentCodeMessages[reason as keyof typeof spentCodeMessages] };
  }
  if (reason === 'signing_unavailable') {
    return { kind: 'other', message: sessionFailureMessages.signing_unavailable };
  }
  return { kind: 'other', message: unreachableMessage };
}

function CodeStep({
  participation,
  session,
  items,
  sentAt,
  resent,
  onResent,
  onBack,
  onSigned,
}: {
  participation: Participation;
  session: SigningSessionResponse;
  items: SigningItem[];
  sentAt: number;
  resent: boolean;
  onResent: (session: SigningSessionResponse) => void;
  onBack: () => void;
  onSigned: (result: SignSessionResponse) => void;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const [code, setCode] = useState('');
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<CodeError | null>(null);
  const [resend, setResend] = useState<{ busy: boolean; failure: SessionFailure | null }>({
    busy: false,
    failure: null,
  });
  const codeInput = useRef<HTMLInputElement>(null);
  const { secondsLeft, restart } = useCountdown(sentAt + resendDelayMs);

  useEffect(() => codeInput.current?.focus(), []);

  async function sign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (signing) return;
    if (code.length < codeLength.min) {
      setError({ kind: 'other', message: msg`Scrie toate cele 6 cifre din cod.` });
      return;
    }
    setSigning(true);
    setError(null);
    try {
      onSigned(
        await signPortalSigningSession(
          participation.participantId,
          session.sessionId,
          { code },
          apiRequest
        )
      );
    } catch (cause) {
      setSigning(false);
      setError(codeErrorOf(cause));
      codeInput.current?.select();
    }
  }

  async function requestAgain() {
    setResend({ busy: true, failure: null });
    try {
      onResent(
        await createPortalSigningSession(
          participation.participantId,
          sessionBody(items),
          apiRequest
        )
      );
    } catch (cause) {
      const failure = sessionFailureOf(cause);
      setResend({ busy: false, failure });
      if (failure.rateLimited) restart();
    }
  }

  const spent = error?.kind === 'spent';
  const count = items.length;
  const hint = session.addressHint;

  return (
    <div className="grid gap-5">
      <div
        className="grid gap-1.5 text-[0.9375rem] leading-relaxed"
        data-testid="signing-code-sent"
      >
        <p>
          {session.channel === 'sms' ? (
            <Trans>
              Am trimis un cod prin SMS la{' '}
              <span data-testid="signing-address-hint" className="font-semibold wrap-anywhere">
                {hint}
              </span>
              .
            </Trans>
          ) : (
            <Trans>
              Am trimis un cod la{' '}
              <span data-testid="signing-address-hint" className="font-semibold wrap-anywhere">
                {hint}
              </span>
              .
            </Trans>
          )}
        </p>
        <p className="text-foreground/80">
          {t({
            message: plural(count, {
              one: 'Codul e valabil 10 minute și semnează documentul ales.',
              few: 'Codul e valabil 10 minute și semnează cele # documente alese.',
              other: 'Codul e valabil 10 minute și semnează cele # de documente alese.',
            }),
          })}
        </p>
      </div>
      {resent && (
        <Notice variant="info" data-testid="signing-code-resent">
          <Trans>Am trimis un cod nou. Folosește-l pe cel mai recent.</Trans>
        </Notice>
      )}
      <form className="grid gap-5" noValidate onSubmit={(event) => void sign(event)}>
        <div className="grid gap-2">
          <Label htmlFor="signing-code">
            <Trans>Codul de semnare</Trans>
          </Label>
          <CodeInput
            ref={codeInput}
            id="signing-code"
            data-testid="signing-code"
            value={code}
            onValueChange={setCode}
            length={codeLength}
            disabled={signing || spent}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'signing-code-error' : undefined}
          />
          {error && (
            <p
              id="signing-code-error"
              data-testid="signing-code-error"
              data-kind={error.kind}
              role="alert"
              className="text-sm text-destructive"
            >
              {error.kind === 'invalid'
                ? error.attemptsLeft === null
                  ? t`Codul nu este corect. Verifică-l și scrie-l din nou.`
                  : t({
                      message: plural(error.attemptsLeft, {
                        one: 'Codul nu este corect. Mai ai o încercare.',
                        few: 'Codul nu este corect. Mai ai # încercări.',
                        other: 'Codul nu este corect. Mai ai # de încercări.',
                      }),
                    })
                : i18n._(error.message)}
            </p>
          )}
        </div>
        {!spent && (
          <Button
            type="submit"
            data-testid="signing-sign"
            className="h-12 w-full text-base"
            disabled={signing}
          >
            {signing && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {signing ? t`Se semnează…` : t`Semnează`}
          </Button>
        )}
        {signing && (
          <p role="status" className="text-sm text-muted-foreground">
            <Trans>Fiecare document se semnează pe rând; poate dura câteva secunde.</Trans>
          </p>
        )}
      </form>
      {resend.failure && (
        <Notice variant="destructive" data-testid="signing-resend-error">
          {i18n._(resend.failure.message)}
        </Notice>
      )}
      <div className="grid gap-1">
        <Button
          type="button"
          variant={spent ? 'default' : 'outline'}
          data-testid="signing-resend"
          className={cn('h-12 w-full', spent && 'text-base')}
          disabled={secondsLeft > 0 || resend.busy || signing}
          onClick={() => void requestAgain()}
        >
          {resend.busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {secondsLeft > 0 ? t`Cere un cod nou în ${secondsLeft} s` : t`Cere un cod nou`}
        </Button>
        <Button
          type="button"
          variant="ghost"
          data-testid="signing-back"
          className="h-12 w-full"
          disabled={signing}
          onClick={onBack}
        >
          <Trans>Schimbă ce semnezi</Trans>
        </Button>
      </div>
    </div>
  );
}

type Outcome = { item: SigningItem; signed: boolean; reason: MessageDescriptor | null };

function outcomesOf(items: SigningItem[], result: SignSessionResponse): Outcome[] {
  return items.map((item) => {
    if (item.kind === 'agreement') {
      const answer = result.agreements.find((each) => each.employeeId === item.employeeId);
      return {
        item,
        signed: answer?.signed === true,
        reason: answer?.reason ? itemFailureMessages[answer.reason] : null,
      };
    }
    const failed = result.failed.find((each) => each.requestId === item.request.id);
    return {
      item,
      signed: result.signed.some((each) => each.requestId === item.request.id),
      reason: failed ? itemFailureMessages[failed.reason] : null,
    };
  });
}

function ResultStep({
  participation,
  items,
  result,
  onAgain,
}: {
  participation: Participation;
  items: SigningItem[];
  result: SignSessionResponse;
  onAgain: () => void;
}) {
  const { t, i18n } = useLingui();
  const queryClient = useQueryClient();
  const outcomes = outcomesOf(items, result);
  const signed = outcomes.filter((outcome) => outcome.signed).length;
  const failed = outcomes.length - signed;

  useEffect(() => {
    void queryClient.invalidateQueries();
  }, [queryClient]);

  return (
    <div className="grid gap-5" data-testid="signing-result">
      {failed === 0 ? (
        <Notice variant="success" data-testid="signing-result-summary" data-outcome="signed">
          {t({
            message: plural(signed, {
              one: 'Ai semnat documentul. Semnătura e pe fișa ta.',
              few: 'Ai semnat cele # documente.',
              other: 'Ai semnat cele # de documente.',
            }),
          })}
        </Notice>
      ) : (
        <Notice
          variant={signed === 0 ? 'destructive' : 'warning'}
          data-testid="signing-result-summary"
          data-outcome={signed === 0 ? 'failed' : 'partial'}
        >
          {signed === 0
            ? t`Nu s-a semnat nimic. Vezi mai jos de ce.`
            : t`S-au semnat ${signed} din ${outcomes.length}. Vezi mai jos ce a rămas nesemnat și de ce.`}
        </Notice>
      )}
      <ul className={cn(cardClass, 'divide-y overflow-hidden')}>
        {outcomes.map(({ item, signed: isSigned, reason }) => (
          <li
            key={item.key}
            data-testid="signing-outcome"
            data-signed={isSigned}
            className="flex items-start gap-3 px-4 py-3.5 sm:px-5"
          >
            {isSigned ? (
              <CircleCheck
                aria-label={t`Semnat`}
                className="mt-0.5 size-5 shrink-0 text-success-foreground"
              />
            ) : (
              <CircleAlert
                aria-label={t`Nesemnat`}
                className="mt-0.5 size-5 shrink-0 text-destructive"
              />
            )}
            <span className="grid min-w-0 gap-1">
              <SigningItemText
                item={item}
                ownEmployeeId={participation.employeeId}
                warnings={false}
              />
              {!isSigned && (
                <span data-testid="signing-outcome-reason" className="text-sm text-destructive">
                  {i18n._(reason ?? itemFailureMessages.signing_failed)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:flex">
        <Button asChild className="h-12 text-base sm:px-6">
          <Link to="/" data-testid="signing-home">
            <Trans>Înapoi la Acasă</Trans>
          </Link>
        </Button>
        {failed > 0 ? (
          <Button
            type="button"
            variant="outline"
            data-testid="signing-again"
            className="h-12"
            onClick={onAgain}
          >
            <Trans>Încearcă din nou</Trans>
          </Button>
        ) : (
          participation.employeeId !== null && (
            <Button asChild variant="outline" className="h-12">
              <Link to="/instruiri" data-testid="signing-trainings">
                <Trans>Vezi instruirile</Trans>
              </Link>
            </Button>
          )
        )}
      </div>
    </div>
  );
}
