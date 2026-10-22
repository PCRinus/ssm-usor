import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { testErrorReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Check, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  answerPortalTestAttempt,
  finishPortalTestAttempt,
  type TestAttemptOutcome,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { useApiRequest } from '@/lib/request';

import type { Attempt } from './attempt';
import { reasonOf } from './test-errors';

const sameChoice = (a: number[], b: number[]) =>
  a.length === b.length && a.every((option) => b.includes(option));

function failureOf(cause: unknown, finishing: boolean): MessageDescriptor {
  if (reasonOf(cause) === testErrorReasons.attemptFinished) {
    return msg`Testul acesta a fost deja trimis. Întoarce-te la Instruiri pentru rezultat.`;
  }
  return finishing
    ? msg`Nu am putut trimite testul. Verifică conexiunea la internet și încearcă din nou; răspunsurile sunt păstrate.`
    : msg`Nu am putut salva răspunsul. Verifică conexiunea la internet și încearcă din nou.`;
}

export function TestSitting({
  participantId,
  title,
  attempt: startedAttempt,
  initialIndex,
  onLeave,
  onFinished,
}: {
  participantId: string;
  title: string;
  attempt: Attempt;
  initialIndex: number;
  onLeave: () => void;
  onFinished: (outcome: TestAttemptOutcome) => void;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const [saved, setSaved] = useState(startedAttempt);
  const [answers, setAnswers] = useState(() =>
    startedAttempt.questions.map((question) => question.chosen)
  );
  const [index, setIndex] = useState(initialIndex);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MessageDescriptor | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const questionId = useId();

  useEffect(() => {
    headingRef.current?.focus();
  }, [index]);

  const total = saved.questions.length;
  const question = saved.questions[index]!;
  const chosen = answers[index] ?? [];
  const last = index === total - 1;
  const position = index + 1;

  const toggle = (option: number) => {
    if (busy) return;
    const next = chosen.includes(option)
      ? chosen.filter((each) => each !== option)
      : [...chosen, option].sort((a, b) => a - b);
    setAnswers(answers.map((each, at) => (at === index ? next : each)));
    setFailure(null);
  };

  async function next() {
    if (busy || chosen.length === 0) return;
    setBusy(true);
    setFailure(null);
    let finishing = false;
    try {
      if (!sameChoice(chosen, question.chosen)) {
        const { attempt } = await answerPortalTestAttempt(
          participantId,
          saved.id,
          String(index),
          { chosen },
          apiRequest
        );
        setSaved(attempt);
      }
      if (last) {
        finishing = true;
        onFinished(await finishPortalTestAttempt(participantId, saved.id, apiRequest));
      } else {
        setIndex(index + 1);
      }
    } catch (cause) {
      setFailure(failureOf(cause, finishing));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6" data-testid="test-sitting" data-index={index}>
      <div className="grid gap-3">
        <h1 className="text-sm font-medium text-muted-foreground">{title}</h1>
        <div className="grid gap-2">
          <p
            data-testid="test-counter"
            className="text-[0.9375rem] font-semibold tabular-nums"
            aria-live="polite"
          >
            {t`${position} din ${total}`}
          </p>
          <ol className="flex gap-1" aria-hidden="true">
            {saved.questions.map((each, at) => (
              <li
                key={each.questionId}
                className={cn(
                  'h-1.5 flex-1 rounded-full bg-muted',
                  (answers[at]?.length ?? 0) > 0 && 'bg-primary',
                  at === index && 'bg-brand-lime'
                )}
              />
            ))}
          </ol>
        </div>
      </div>

      <div role="group" aria-labelledby={questionId} className="grid gap-4">
        <div className="grid gap-1.5">
          <h2
            id={questionId}
            ref={headingRef}
            tabIndex={-1}
            data-testid="test-question"
            className="text-[1.1875rem] leading-snug font-semibold tracking-tight break-words outline-none sm:text-xl"
          >
            {question.text}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans>Pot fi corecte unul sau mai multe răspunsuri.</Trans>
          </p>
        </div>
        <ul className="grid gap-2.5">
          {question.options.map((option, at) => {
            const checked = chosen.includes(at);
            return (
              <li key={`${question.questionId}-${at}`}>
                <label
                  data-testid="test-option"
                  data-checked={checked}
                  className={cn(
                    'flex min-h-14 cursor-pointer items-start gap-3.5 rounded-xl border bg-card px-4 py-3.5 transition-colors has-[:disabled]:cursor-default has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 sm:px-5',
                    checked ? 'border-primary bg-accent/60' : 'hover:bg-muted/50'
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={busy}
                    onChange={() => toggle(at)}
                  />
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border border-input bg-card',
                      checked && 'border-primary bg-primary text-primary-foreground'
                    )}
                  >
                    {checked && <Check className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1 text-[0.9375rem] leading-relaxed break-words">
                    {option.text}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {failure && (
        <Notice variant="destructive" data-testid="test-sitting-error">
          {i18n._(failure)}
        </Notice>
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 sm:flex sm:justify-between">
        <Button
          variant="outline"
          data-testid="test-back"
          className="h-12 px-5 text-base"
          disabled={busy}
          onClick={() => (index === 0 ? onLeave() : setIndex(index - 1))}
        >
          <Trans>Înapoi</Trans>
        </Button>
        <Button
          data-testid={last ? 'test-submit' : 'test-next'}
          className="h-12 text-base sm:px-8"
          disabled={busy || chosen.length === 0}
          onClick={() => void next()}
        >
          {busy && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          {last ? t`Trimite testul` : t`Continuă`}
        </Button>
      </div>
    </div>
  );
}
