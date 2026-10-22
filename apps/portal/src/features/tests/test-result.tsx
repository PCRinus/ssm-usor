import { Trans, useLingui } from '@lingui/react/macro';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { LoaderCircle } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { TestAttemptOutcome } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { cardClass, PageHeader, SectionLabel } from '@/components/page';

export function TestResult({
  title,
  outcome,
  retaking,
  retakeFailure,
  onRetake,
  onStudy,
}: {
  title: string;
  outcome: TestAttemptOutcome;
  retaking: boolean;
  retakeFailure: string | null;
  onRetake: () => void;
  onStudy: () => void;
}) {
  const { t } = useLingui();
  const resultRef = useRef<HTMLDivElement>(null);
  const { score: correct, total } = outcome;
  const score = t`${correct} din ${total} răspunsuri corecte`;

  useEffect(() => {
    resultRef.current?.focus();
  }, [outcome.id]);

  if (outcome.passed) {
    return (
      <div
        ref={resultRef}
        tabIndex={-1}
        className="grid gap-6 outline-none"
        data-testid="test-result"
        data-passed="true"
      >
        <PageHeader
          eyebrow={title}
          title={t`Ai promovat testul`}
          description={<span data-testid="test-score">{score}</span>}
        />
        <p className="text-[0.9375rem] leading-relaxed text-foreground/80">
          <Trans>Rezultatul este înregistrat și apare în fișa ta individuală.</Trans>
        </p>
        <p
          data-testid="test-result-sheet"
          className="text-[0.9375rem] leading-relaxed text-foreground/80"
        >
          <Trans>
            Fișa de test, cu întrebările și răspunsurile tale, așteaptă semnătura ta la{' '}
            <Link to="/semneaza" className="font-medium underline underline-offset-4">
              Semnături
            </Link>
            .
          </Trans>
        </p>
        <Button asChild className="h-12 w-full text-base sm:w-fit sm:px-8">
          <Link to="/instruiri" data-testid="test-result-trainings">
            <Trans>Înapoi la Instruiri</Trans>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div
      ref={resultRef}
      tabIndex={-1}
      className="grid gap-6 outline-none"
      data-testid="test-result"
      data-passed="false"
    >
      <PageHeader
        eyebrow={title}
        title={t`Nu ai promovat de data aceasta`}
        description={<span data-testid="test-score">{score}</span>}
      />
      <p className="text-[0.9375rem] leading-relaxed text-foreground/80">
        <Trans>
          Recitește întrebările de mai jos și reia testul. Întrebările și ordinea răspunsurilor se
          schimbă la fiecare încercare.
        </Trans>
      </p>
      {outcome.mistakes.length > 0 && (
        <section aria-labelledby="test-mistakes-title" className="grid gap-2.5">
          <SectionLabel id="test-mistakes-title">{t`Unde ai greșit`}</SectionLabel>
          <ul className={cn(cardClass, 'divide-y overflow-hidden')}>
            {outcome.mistakes.map((mistake) => {
              const number = mistake.index + 1;
              return (
                <li
                  key={mistake.index}
                  data-testid="test-mistake"
                  className="grid gap-1.5 px-4 py-3.5 sm:px-5"
                >
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {t`Întrebarea ${number}`}
                  </p>
                  <p className="text-[0.9375rem] leading-snug font-medium">{mistake.text}</p>
                  {mistake.explanation && (
                    <p
                      data-testid="test-mistake-explanation"
                      className="text-sm leading-relaxed text-foreground/80"
                    >
                      {mistake.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {retakeFailure && (
        <Notice variant="destructive" data-testid="test-start-error">
          {retakeFailure}
        </Notice>
      )}
      <div className="grid gap-3 sm:flex sm:items-center sm:gap-5">
        <Button
          data-testid="test-retake"
          className="h-12 w-full text-base sm:w-fit sm:px-8"
          disabled={retaking}
          onClick={onRetake}
        >
          {retaking && <LoaderCircle aria-hidden="true" className="animate-spin" />}
          <Trans>Reia testul</Trans>
        </Button>
        <Button
          variant="link"
          data-testid="test-study"
          className="h-11 px-0 text-[0.9375rem]"
          onClick={onStudy}
        >
          <Trans>Recitește ce trebuie să știi</Trans>
        </Button>
      </div>
    </div>
  );
}
