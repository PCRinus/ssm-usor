import { Trans, useLingui } from '@lingui/react/macro';
import { type TrainingDomain, trainingDomains } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';

import { type PortalTestsResponse, useGetPortalTests } from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { cardClass, SectionLabel } from '@/components/page';
import { useFormatDate } from '@/lib/format';
import {
  portalTestState,
  testAwaitingMessage,
  testGradeMessages,
  testTitleMessage,
  trainingDomainMessages,
} from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

import { TestSheetLine } from './test-sheet-line';
import { TestStateBadge } from './test-state-badge';

export function TestsSection({
  participantId,
  className,
}: {
  participantId: string;
  className?: string;
}) {
  const { t } = useLingui();
  const apiRequest = useApiRequest();
  const tests = useGetPortalTests(participantId, { request: apiRequest });
  return (
    <section
      aria-labelledby="training-tests-title"
      data-testid="training-tests"
      className={cn('grid gap-2.5 lg:gap-3.5', className)}
    >
      <SectionLabel id="training-tests-title">{t`Testele tale`}</SectionLabel>
      {tests.isError ? (
        <Notice variant="destructive" data-testid="training-tests-error">
          <Trans>Nu am putut verifica testele. Reîncarcă pagina.</Trans>
        </Notice>
      ) : !tests.data ? (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Se verifică…</Trans>
        </p>
      ) : (
        trainingDomains.map((domain) => (
          <DomainTests
            key={domain}
            participantId={participantId}
            domain={domain}
            tests={tests.data[domain]}
          />
        ))
      )}
    </section>
  );
}

function DomainTests({
  participantId,
  domain,
  tests,
}: {
  participantId: string;
  domain: TrainingDomain;
  tests: PortalTestsResponse[TrainingDomain];
}) {
  const { t, i18n } = useLingui();
  const formatDate = useFormatDate();
  const label = i18n._(trainingDomainMessages[domain]);
  const { status, results, inProgress } = tests;
  const awaiting = status.awaitingTest;
  const state = portalTestState(status.state);
  const nextAnnual = status.dueOn && formatDate(status.dueOn, 'short');

  return (
    <article
      data-testid={`training-tests-${domain}`}
      className={cn(cardClass, 'grid gap-3 px-4 py-3.5 lg:px-5 lg:py-4.5')}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold">{t`Testare ${label}`}</h3>
        {state && <TestStateBadge state={state} testId={`training-test-state-${domain}`} />}
      </div>
      {status.state === 'none' && (
        <p className="text-sm leading-relaxed text-foreground/80">
          {domain === 'ssm'
            ? t`Testul la angajare apare după ce este înregistrată instruirea introductiv-generală.`
            : t`Testul la angajare apare după ce este înregistrată instruirea la locul de muncă.`}
        </p>
      )}
      {results.length > 0 && (
        <ul data-testid={`training-test-results-${domain}`} className="grid gap-3 text-sm">
          {results.map((result) => {
            const grade = i18n._(testGradeMessages[result.grade]);
            const day = formatDate(result.takenOn, 'short');
            return (
              <li key={result.id} data-testid="training-test-result" className="grid gap-2">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>{i18n._(testTitleMessage(result.domain, result.test))}</span>
                  <span className="text-muted-foreground tabular-nums">{t`${grade}, ${day}`}</span>
                </span>
                {result.source === 'portal' && (
                  <TestSheetLine participantId={participantId} result={result} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      {domain === 'psi' && status.state === 'passed' && nextAnnual && (
        <p className="text-sm text-muted-foreground" data-testid="training-test-due-psi">
          {t`Următorul test anual: ${nextAnnual}`}
        </p>
      )}
      {awaiting && (
        <p className="text-sm leading-relaxed text-foreground/80">
          {i18n._(testAwaitingMessage(domain, awaiting))}.
        </p>
      )}
      {awaiting && (
        <Button asChild className="h-11 w-full">
          <Link
            to="/instruiri/test/$domain/$test"
            params={{ domain, test: awaiting }}
            data-testid={`training-test-open-${domain}`}
          >
            {inProgress?.test === awaiting ? t`Continuă testul` : t`Susține testul`}
          </Link>
        </Button>
      )}
    </article>
  );
}
