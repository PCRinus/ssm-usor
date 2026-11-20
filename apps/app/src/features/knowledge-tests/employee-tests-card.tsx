import {
  type KnowledgeTest,
  knowledgeTestCodeOf,
  testGradeLabels,
  testResultSourceLabels,
  type TestStatus,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useIsPhone } from '@ssm-usor/ui/hooks/use-mobile';
import { FilePen, Pencil } from 'lucide-react';
import { useState } from 'react';

import {
  type EmployeeTestsResponse,
  getGetEmployeeTestsQueryKey,
  useGetEmployeeTests,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import { TodoLine } from '@/components/todo-line';
import {
  SummaryList,
  SummaryNote,
  summaryQuiet,
  SummaryRow,
} from '@/features/clients/details/summary-list';
import { notOnSheet } from '@/features/trainings/training-format';
import { formatDate, formatDay } from '@/lib/dates';

import { type TestResult, TestResultDialog, type TestResultTarget } from './test-result-dialog';
import { TestSheetLine } from './test-sheet-line';
import { TestStateBadge } from './test-state-badge';

// Once the examiner has signed the sheet the API keeps the result's examiner (examiner_signed).
const examinerSigned = (result: TestResult) =>
  result.sheet.signed.examiner === 'signed' || result.sheet.signed.examiner === 'paper';

type Attempt = EmployeeTestsResponse['ssm']['attempts'][number];

const hiringTrainingOf: Record<TrainingDomain, string> = {
  ssm: 'instruirea introductiv-generală',
  su: 'instruirea la locul de muncă',
};

function awaitingLine(domain: TrainingDomain, status: TestStatus) {
  switch (status.state) {
    case null:
      return 'Nu mai lucrează la client';
    case 'none':
      return `Testul la angajare apare după ${hiringTrainingOf[domain]}`;
    case 'pending':
      return 'Testul la angajare îl așteaptă în portal';
    case 'unverified':
      return 'Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau lipsește.';
    case 'annual_due':
      return status.dueOn
        ? `Testul anual este scadent din ${formatDate(status.dueOn)}`
        : 'Testul anual este scadent';
    case 'passed':
      return status.dueOn
        ? `Testul anual urmează la ${formatDate(status.dueOn)}`
        : 'Niciun test de susținut';
  }
}

// The API refuses a hiring result once passed or before its training (test_not_awaiting) and
// takes any annual one (ADR 032). An annual result is offered after a pass, or to a history from
// paper, whose sheet may record annual tests where the hiring one could not be read.
function recordableTests(domain: TrainingDomain, status: TestStatus): KnowledgeTest[] {
  const hiring = status.state === 'pending' || status.state === 'unverified';
  const annual = domain === 'su' && (status.lastPassedOn !== null || status.state === 'unverified');
  return [...(hiring ? (['hiring'] as const) : []), ...(annual ? (['annual'] as const) : [])];
}

export function EmployeeTestsCard({
  clientId,
  employeeId,
  domain,
  readOnly,
}: {
  clientId: string;
  employeeId: string;
  domain: TrainingDomain;
  readOnly: boolean;
}) {
  const { request, ready, key } = useApi();
  const tests = useGetEmployeeTests(clientId, employeeId, {
    request,
    query: {
      queryKey: key(getGetEmployeeTestsQueryKey(clientId, employeeId)),
      enabled: ready,
    },
  });
  const [target, setTarget] = useState<TestResultTarget>(null);
  const phone = useIsPhone();
  const domainTests = tests.data?.[domain];
  const recordable = domainTests ? recordableTests(domain, domainTests.status) : [];
  const recordPaper = !readOnly && recordable.length > 0 && (
    <Button
      variant="secondary"
      size="sm"
      className="max-sm:w-full"
      data-testid="tests-record-paper"
      onClick={() => setTarget({ kind: 'paper', tests: recordable })}
    >
      <FilePen aria-hidden="true" />
      Înregistrează un rezultat de pe hârtie
    </Button>
  );

  return (
    <SectionCard
      data-testid="employee-tests"
      data-domain={domain}
      className="gap-4"
      title="Testare"
      help="angajati.testare"
      action={!phone && recordPaper}
    >
      {tests.isError ? (
        <LoadFailed
          error={tests.error}
          testId="tests-error"
          busy={tests.isFetching}
          onRetry={() => void tests.refetch()}
        >
          Nu am putut încărca testele lucrătorului.
        </LoadFailed>
      ) : !domainTests ? (
        <Skeleton className="h-24 w-full" aria-busy="true" />
      ) : (
        <TestsBody
          clientId={clientId}
          employeeId={employeeId}
          domain={domain}
          tests={domainTests}
          readOnly={readOnly}
          onEditExaminer={(result) => setTarget({ kind: 'examiner', result })}
        />
      )}
      {phone && recordPaper}
      <TestResultDialog
        clientId={clientId}
        employeeId={employeeId}
        domain={domain}
        target={target}
        onClose={() => setTarget(null)}
      />
    </SectionCard>
  );
}

function TestsBody({
  clientId,
  employeeId,
  domain,
  tests,
  readOnly,
  onEditExaminer,
}: {
  domain: TrainingDomain;
  tests: EmployeeTestsResponse[TrainingDomain];
  readOnly: boolean;
  clientId: string;
  employeeId: string;
  onEditExaminer: (result: TestResult) => void;
}) {
  const { status, results, attempts } = tests;
  return (
    <>
      {status.state === 'pending' && status.awaitingTest === 'hiring' && (
        <TodoLine data-testid="tests-gap">
          Testul la angajare ({knowledgeTestCodeOf(domain, 'hiring')}) nu este promovat încă. Legea
          nu admite la lucru un lucrător netestat; aplicația doar semnalează lipsa.
        </TodoLine>
      )}
      <SummaryList>
        <SummaryRow label="Starea testării">
          {status.state ? (
            <TestStateBadge state={status.state} testId="tests-state" />
          ) : (
            <span className="text-muted-foreground" data-testid="tests-state">
              —
            </span>
          )}
        </SummaryRow>
        <SummaryRow label="Ce urmează">
          <span data-testid="tests-awaiting">{awaitingLine(domain, status)}</span>
        </SummaryRow>
        <SummaryRow label="Rezultate">
          {results.length === 0 ? (
            <p data-testid="tests-results-empty">
              Niciun test promovat încă. Un rezultat apare aici după promovarea în portal sau după
              ce îl înregistrezi de pe hârtie.
            </p>
          ) : (
            <ul className="grid divide-y divide-border/70">
              {results.map((result) => (
                <li
                  key={result.id}
                  data-testid="tests-result"
                  data-source={result.source}
                  className="grid gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="grid min-w-0 gap-0.5">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium tabular-nums">
                          {formatDate(result.takenOn)}
                        </span>
                        <span>{testGradeLabels[result.grade]}</span>
                        <Badge variant="outline" data-testid="tests-result-source">
                          {testResultSourceLabels[result.source]}
                        </Badge>
                      </p>
                      <SummaryNote className="mt-0">{result.material}</SummaryNote>
                      <p data-testid="tests-result-examiner">
                        <span className={summaryQuiet}>Examinator: </span>
                        {result.examiner ? (
                          <>
                            <Masked>{result.examiner.name}</Masked>, {result.examiner.jobTitle}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            {result.source === 'paper' ? notOnSheet.name : 'nenumit încă'}
                          </span>
                        )}
                      </p>
                    </div>
                    {!readOnly && !examinerSigned(result) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="max-sm:w-full"
                        data-testid="tests-result-examiner-edit"
                        onClick={() => onEditExaminer(result)}
                      >
                        <Pencil aria-hidden="true" />
                        {result.examiner ? 'Modifică examinatorul' : 'Numește examinatorul'}
                      </Button>
                    )}
                  </div>
                  {result.source === 'portal' && (
                    <TestSheetLine
                      clientId={clientId}
                      employeeId={employeeId}
                      result={result}
                      readOnly={readOnly}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SummaryRow>
        <SummaryRow label="Încercări în portal">
          {attempts.length === 0 ? (
            <p data-testid="tests-attempts-empty">Nicio încercare în portal.</p>
          ) : (
            <ul className="grid gap-2">
              {attempts.map((attempt) => (
                <AttemptRow key={attempt.id} attempt={attempt} />
              ))}
            </ul>
          )}
        </SummaryRow>
      </SummaryList>
    </>
  );
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  return (
    <li data-testid="tests-attempt" className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="tabular-nums">{formatDay(attempt.finishedAt ?? attempt.startedAt)}</span>
      {attempt.score === null ? (
        <Badge variant="outline" data-testid="tests-attempt-outcome">
          În curs
        </Badge>
      ) : (
        <>
          <span data-testid="tests-attempt-score" className="font-medium tabular-nums">
            {attempt.score}/{attempt.total}
          </span>
          <Badge
            variant="outline"
            data-testid="tests-attempt-outcome"
            className={
              attempt.passed
                ? 'border-success-border bg-success text-success-foreground'
                : 'text-muted-foreground'
            }
          >
            {attempt.passed ? 'Promovat' : 'Nepromovat'}
          </Badge>
        </>
      )}
    </li>
  );
}
