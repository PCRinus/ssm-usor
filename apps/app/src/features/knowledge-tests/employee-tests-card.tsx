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
import { useRouteContext } from '@tanstack/react-router';
import { FilePen, Pencil } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  type EmployeeTestsResponse,
  getGetEmployeeTestsQueryKey,
  useGetEmployeeTests,
} from '@/api/generated/api';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { formatDate } from '@/features/employees/employee-format';
import { formatDay } from '@/features/participants/participant-format';

import { type TestResult, TestResultDialog, type TestResultTarget } from './test-result-dialog';
import { TestStateBadge } from './test-state-badge';

type Attempt = EmployeeTestsResponse['ssm']['attempts'][number];

const hiringTrainingOf: Record<TrainingDomain, string> = {
  ssm: 'instruirea introductiv-generală',
  psi: 'instruirea la locul de muncă',
};

function awaitingLine(domain: TrainingDomain, status: TestStatus) {
  switch (status.state) {
    case null:
      return 'Nu mai lucrează la client';
    case 'none':
      return `Testul la angajare apare după ${hiringTrainingOf[domain]}`;
    case 'pending':
      return 'Testul la angajare îl așteaptă în portal';
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

// What the API accepts; any other paper result is refused with test_not_awaiting.
function recordableTests(domain: TrainingDomain, status: TestStatus): KnowledgeTest[] {
  if (status.state === 'pending' && status.awaitingTest === 'hiring') return ['hiring'];
  if (domain === 'psi' && status.lastPassedOn !== null) return ['annual'];
  return [];
}

export function EmployeeTestsCard({
  clientId,
  employeeId,
  userId,
  domain,
  readOnly,
}: {
  clientId: string;
  employeeId: string;
  userId: string;
  domain: TrainingDomain;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const tests = useGetEmployeeTests(clientId, employeeId, {
    request: apiRequest,
    query: {
      queryKey: [...getGetEmployeeTestsQueryKey(clientId, employeeId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const [target, setTarget] = useState<TestResultTarget>(null);
  const domainTests = tests.data?.[domain];
  const recordable = domainTests ? recordableTests(domain, domainTests.status) : [];

  return (
    <SectionCard
      data-testid="employee-tests"
      data-domain={domain}
      headingLevel={3}
      title="Testare"
      action={
        !readOnly &&
        recordable.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            data-testid="tests-record-paper"
            onClick={() => setTarget({ kind: 'paper', tests: recordable })}
          >
            <FilePen aria-hidden="true" />
            Înregistrează un rezultat de pe hârtie
          </Button>
        )
      }
    >
      {tests.isError ? (
        <Notice
          variant="destructive"
          data-testid="tests-error"
          action={
            <Button
              variant="outline"
              disabled={tests.isFetching}
              onClick={() => void tests.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca testele angajatului.
        </Notice>
      ) : !domainTests ? (
        <Skeleton className="h-24 w-full" aria-busy="true" />
      ) : (
        <TestsBody
          domain={domain}
          tests={domainTests}
          readOnly={readOnly}
          onEditExaminer={(result) => setTarget({ kind: 'examiner', result })}
        />
      )}
      <TestResultDialog
        clientId={clientId}
        employeeId={employeeId}
        userId={userId}
        domain={domain}
        target={target}
        onClose={() => setTarget(null)}
      />
    </SectionCard>
  );
}

function TestsBody({
  domain,
  tests,
  readOnly,
  onEditExaminer,
}: {
  domain: TrainingDomain;
  tests: EmployeeTestsResponse[TrainingDomain];
  readOnly: boolean;
  onEditExaminer: (result: TestResult) => void;
}) {
  const { status, results, attempts } = tests;
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Fact label="Starea testării">
          {status.state ? (
            <TestStateBadge state={status.state} testId="tests-state" />
          ) : (
            <span className="font-normal text-muted-foreground" data-testid="tests-state">
              —
            </span>
          )}
        </Fact>
        <Fact label="Ce urmează">
          <span data-testid="tests-awaiting" className="font-normal">
            {awaitingLine(domain, status)}
          </span>
        </Fact>
      </dl>
      {status.state === 'pending' && status.awaitingTest === 'hiring' && (
        <Notice variant="warning" data-testid="tests-gap">
          Testul la angajare ({knowledgeTestCodeOf(domain, 'hiring')}) nu este promovat încă. Legea
          nu admite la lucru un angajat netestat; aplicația doar semnalează lipsa.
        </Notice>
      )}

      <section aria-labelledby={`tests-results-${domain}`} className="grid gap-2">
        <h4 id={`tests-results-${domain}`} className="text-sm font-medium">
          Rezultate
        </h4>
        {results.length === 0 ? (
          <p data-testid="tests-results-empty" className="text-sm text-muted-foreground">
            Niciun test promovat încă. Un rezultat apare aici după promovarea în portal sau după ce
            îl înregistrezi de pe hârtie.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {results.map((result) => (
              <li
                key={result.id}
                data-testid="tests-result"
                data-source={result.source}
                className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="grid min-w-0 gap-0.5 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium tabular-nums">{formatDate(result.takenOn)}</span>
                    <span>{testGradeLabels[result.grade]}</span>
                    <Badge variant="outline" data-testid="tests-result-source">
                      {testResultSourceLabels[result.source]}
                    </Badge>
                  </p>
                  <p className="text-muted-foreground">{result.material}</p>
                  <p data-testid="tests-result-examiner">
                    <span className="text-muted-foreground">Examinator: </span>
                    {result.examiner ? (
                      `${result.examiner.name}, ${result.examiner.jobTitle}`
                    ) : (
                      <span className="text-muted-foreground">nenumit încă</span>
                    )}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="tests-result-examiner-edit"
                    onClick={() => onEditExaminer(result)}
                  >
                    <Pencil aria-hidden="true" />
                    {result.examiner ? 'Modifică examinatorul' : 'Numește examinatorul'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby={`tests-attempts-${domain}`} className="grid gap-2">
        <h4 id={`tests-attempts-${domain}`} className="text-sm font-medium">
          Încercări în portal
        </h4>
        {attempts.length === 0 ? (
          <p data-testid="tests-attempts-empty" className="text-sm text-muted-foreground">
            Nicio încercare în portal.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {attempts.map((attempt) => (
              <AttemptRow key={attempt.id} attempt={attempt} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function AttemptRow({ attempt }: { attempt: Attempt }) {
  return (
    <li
      data-testid="tests-attempt"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm"
    >
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

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
