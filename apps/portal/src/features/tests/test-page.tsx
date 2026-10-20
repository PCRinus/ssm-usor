import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  isKnowledgeTestOf,
  type KnowledgeTest,
  knowledgeTestSchema,
  testErrorReasons,
  type TrainingDomain,
  trainingDomainSchema,
} from '@ssm-usor/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Link, Navigate } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useState } from 'react';

import {
  getGetPortalTestsQueryKey,
  getGetPortalTrainingSheetsQueryKey,
  startPortalTestAttempt,
  type TestAttemptOutcome,
  useGetPortalTests,
  useGetPortalTestStudyCard,
} from '@/api/generated/api';
import { Page, PageFailed, PageHeader, PageLoading } from '@/components/page';
import { useParticipation } from '@/features/participation/participation-context';
import { testTitleMessage } from '@/lib/labels';
import { useApiRequest } from '@/lib/request';

import { type Attempt, resumeIndexOf } from './attempt';
import { StudyCard } from './study-card';
import { reasonOf } from './test-errors';
import { TestResult } from './test-result';
import { TestSitting } from './test-sitting';

type Screen =
  | { kind: 'card' }
  | { kind: 'sitting'; attempt: Attempt; index: number }
  | { kind: 'result'; outcome: TestAttemptOutcome };

function testOf(domain: string, test: string) {
  const parsedDomain = trainingDomainSchema.safeParse(domain);
  const parsedTest = knowledgeTestSchema.safeParse(test);
  if (!parsedDomain.success || !parsedTest.success) return null;
  if (!isKnowledgeTestOf(parsedDomain.data, parsedTest.data)) return null;
  return { domain: parsedDomain.data, test: parsedTest.data };
}

export function TestPage(params: { domain: string; test: string }) {
  const participation = useParticipation();
  if (participation.employeeId === null) return <Navigate to="/" replace />;
  const knowledgeTest = testOf(params.domain, params.test);
  if (!knowledgeTest) return <Navigate to="/instruiri" replace />;
  return (
    <Page testId="test-page" className="max-w-[44rem]">
      <KnowledgeTestFlow
        key={`${knowledgeTest.domain}-${knowledgeTest.test}`}
        participantId={participation.participantId}
        domain={knowledgeTest.domain}
        test={knowledgeTest.test}
      />
    </Page>
  );
}

function KnowledgeTestFlow({
  participantId,
  domain,
  test: knowledgeTest,
}: {
  participantId: string;
  domain: TrainingDomain;
  test: KnowledgeTest;
}) {
  const { t, i18n } = useLingui();
  const apiRequest = useApiRequest();
  const queryClient = useQueryClient();
  const tests = useGetPortalTests(participantId, { request: apiRequest });
  const card = useGetPortalTestStudyCard(participantId, domain, knowledgeTest, {
    request: apiRequest,
  });
  const [screen, setScreen] = useState<Screen>({ kind: 'card' });
  const [starting, setStarting] = useState(false);
  const [startFailure, setStartFailure] = useState<string | null>(null);
  const title = i18n._(testTitleMessage(domain, knowledgeTest));

  const invalidateTests = () =>
    void queryClient.invalidateQueries({ queryKey: getGetPortalTestsQueryKey(participantId) });

  async function start() {
    if (starting) return;
    setStarting(true);
    setStartFailure(null);
    try {
      const { attempt } = await startPortalTestAttempt(
        participantId,
        domain,
        knowledgeTest,
        apiRequest
      );
      setScreen({ kind: 'sitting', attempt, index: resumeIndexOf(attempt) });
      invalidateTests();
    } catch (cause) {
      const notAwaiting = reasonOf(cause) === testErrorReasons.notAwaiting;
      setStartFailure(
        i18n._(
          notAwaiting
            ? msg`Testul nu te mai așteaptă.`
            : msg`Nu am putut porni testul. Verifică conexiunea la internet și încearcă din nou.`
        )
      );
      if (notAwaiting) invalidateTests();
    } finally {
      setStarting(false);
    }
  }

  function finished(outcome: TestAttemptOutcome) {
    setScreen({ kind: 'result', outcome });
    invalidateTests();
    if (outcome.passed) {
      void queryClient.invalidateQueries({
        queryKey: getGetPortalTrainingSheetsQueryKey(participantId),
      });
    }
  }

  if (screen.kind === 'sitting') {
    return (
      <TestSitting
        key={screen.attempt.id}
        participantId={participantId}
        title={title}
        attempt={screen.attempt}
        initialIndex={screen.index}
        onLeave={() => {
          setScreen({ kind: 'card' });
          invalidateTests();
        }}
        onFinished={finished}
      />
    );
  }

  if (screen.kind === 'result') {
    return (
      <TestResult
        title={title}
        outcome={screen.outcome}
        retaking={starting}
        retakeFailure={startFailure}
        onRetake={() => void start()}
        onStudy={() => setScreen({ kind: 'card' })}
      />
    );
  }

  const domainTests = tests.data?.[domain];
  return (
    <>
      <div className="grid gap-3">
        <Link
          to="/instruiri"
          data-testid="test-page-trainings"
          className="-ml-1 inline-flex min-h-10 w-fit items-center gap-1 rounded-md px-1 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <Trans>Instruiri</Trans>
        </Link>
        <PageHeader
          title={title}
          description={t`Citește ce trebuie să știi, apoi răspunde la întrebări, câte una pe ecran.`}
        />
      </div>
      {card.isPending || tests.isPending ? (
        <PageLoading />
      ) : card.isError || tests.isError || !card.data || !domainTests ? (
        <PageFailed
          onRetry={() => {
            void card.refetch();
            void tests.refetch();
          }}
        />
      ) : (
        <StudyCard
          participantId={participantId}
          domain={domain}
          card={card.data}
          awaiting={
            domainTests.status.awaitingTest === knowledgeTest ||
            domainTests.inProgress?.test === knowledgeTest
          }
          inProgress={domainTests.inProgress?.test === knowledgeTest}
          starting={starting}
          startFailure={startFailure}
          onStart={() => void start()}
        />
      )}
    </>
  );
}
