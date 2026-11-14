import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { Clock, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { roCount } from '@/features/employees/employee-format';

import { AbandonImportDialog } from '../abandon-import-dialog';
import { ImportActionBar } from '../import-action-bar';
import { usageLine } from '../import-format';
import { ImportIssueBadge } from '../import-review-issues';
import { ReportImportButton } from '../report-import-button';
import { Fact, Facts, StatusTag } from '../review-parts';
import { EarlierInstructionsSection } from './earlier-instructions-section';
import { EmployeeConfirmDialog } from './employee-confirm-dialog';
import { firstToCheck, hubCounts, peopleViews } from './employee-review-model';
import { PeopleList, peopleSectionId } from './people-list';
import { sheetFilesLabel } from './review-format';
import { postsSectionId, TitleGroups, WorkplaceGroups, workplacesSectionId } from './review-groups';
import { UnplacedPages, unplacedSectionId } from './unplaced-pages';
import { useReviewContext } from './use-review-context';

type Issue = { section: string; tone: 'destructive' | 'warning'; count: string; rest: string };

const dayMonth = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });

export function EmployeeHub({
  detail,
  clientId,
  clientName,
}: {
  detail: ImportDetail;
  clientId: string;
  clientName: string;
}) {
  const navigate = useNavigate();
  const { review, context, positions, workplaces } = useReviewContext(detail, clientId);
  const [abandoning, setAbandoning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const views = useMemo(() => peopleViews(context), [context]);
  const counts = hubCounts(context, views);
  const nextView = firstToCheck(views);
  const fileIds = new Set(context.proposal.pages.map((page) => page.fileId));
  const files = detail.files.filter((file) => fileIds.has(file.id));

  const reveal = (headingId: string) => {
    const heading = document.getElementById(headingId);
    if (!heading) return;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    (heading.closest('section') ?? heading).scrollIntoView({
      block: 'start',
      behavior: calm ? 'auto' : 'smooth',
    });
    heading.focus({ preventScroll: true });
  };
  const postsOpen = counts.posts.decide + counts.posts.confirm;
  const workplacesOpen = counts.workplaces.decide + counts.workplaces.confirm;
  const issues: Issue[] = [
    postsOpen > 0 && {
      section: postsSectionId,
      tone: counts.posts.decide > 0 ? 'destructive' : 'warning',
      count: roCount(postsOpen, 'post', 'posturi'),
      rest: counts.posts.decide > 0 ? 'de hotărât' : 'de confirmat',
    },
    workplacesOpen > 0 && {
      section: workplacesSectionId,
      tone: counts.workplaces.decide > 0 ? 'destructive' : 'warning',
      count: roCount(workplacesOpen, 'loc de muncă', 'locuri de muncă'),
      rest: 'de ales',
    },
    counts.people.deciding > 0 && {
      section: peopleSectionId,
      tone: 'destructive',
      count: roCount(counts.people.deciding, 'persoană', 'persoane'),
      rest: 'cu ceva de hotărât',
    },
    counts.photos.toAssign > 0 && {
      section: unplacedSectionId,
      tone: 'warning',
      count: roCount(counts.photos.toAssign, 'fotografie', 'fotografii'),
      rest: 'de atribuit',
    },
  ].filter((issue): issue is Issue => issue !== false);
  const [nextFirst, ...nextRest] = nextView?.name.split(' ') ?? [];

  return (
    <div className="grid gap-5" data-testid="employee-hub">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Verifică lucrătorii propuși</h1>
        <div className="flex flex-wrap gap-1 max-sm:-ml-2.5">
          <Button variant="ghost" size="sm" onClick={() => setAbandoning(true)}>
            Renunță la import
          </Button>
          <ReportImportButton importId={detail.id} />
        </div>
      </div>
      <TitleGroups
        context={context}
        positions={positions}
        clientId={clientId}
        onChange={review.update}
      />
      <WorkplaceGroups context={context} workplaces={workplaces} onChange={review.update} />
      <PeopleList
        detail={detail}
        clientId={clientId}
        context={context}
        views={views}
        positions={positions}
        photos={sheetFilesLabel(files)}
        toCheck={counts.people.toCheck}
        onChange={review.update}
      />
      <UnplacedPages detail={detail} context={context} onChange={review.update} />
      <EarlierInstructionsSection clientId={clientId} context={context} views={views} />
      {detail.usage && (
        <p className="text-xs text-muted-foreground tabular-nums" data-testid="import-usage">
          {usageLine(detail.usage)}
        </p>
      )}
      <ImportActionBar
        label="Crearea lucrătorilor"
        save={review}
        testId="employee-hub-bar"
        summary={
          issues.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[13px] font-normal text-muted-foreground sm:hidden">
                De hotărât:
              </span>
              {issues.map((issue) => (
                <ImportIssueBadge
                  key={issue.section}
                  tone={issue.tone}
                  onClick={() => reveal(issue.section)}
                >
                  {issue.count} <span className="max-sm:sr-only">{issue.rest}</span>
                </ImportIssueBadge>
              ))}
            </div>
          ) : (
            <StatusTag status={{ kind: 'done' }} />
          )
        }
        note={
          <Facts>
            <Fact icon={UserCheck}>
              {counts.people.checked} din {counts.people.included} verificate
            </Fact>
            {detail.expiresAt && (
              <Fact icon={Clock}>
                Se păstrează până pe {dayMonth.format(new Date(detail.expiresAt))}
              </Fact>
            )}
          </Facts>
        }
      >
        <Button
          variant={nextView ? 'outline' : 'default'}
          data-testid="employee-hub-confirm"
          className={cn(nextView && 'max-sm:flex-none!')}
          disabled={counts.people.checked === 0 || review.conflict}
          onClick={() => setConfirming(true)}
        >
          <span>
            Creează<span className="max-sm:sr-only"> lucrătorii</span>…
          </span>
        </Button>
        {nextView && (
          <Button asChild data-testid="employee-hub-continue">
            <Link
              to="/clienti/$clientId/angajati/import/$importId/$personId"
              params={{ clientId, importId: detail.id, personId: nextView.person.id }}
            >
              <span className="truncate">
                Continuă cu {nextFirst} <span className="max-sm:hidden">{nextRest.join(' ')}</span>
              </span>
            </Link>
          </Button>
        )}
      </ImportActionBar>
      <EmployeeConfirmDialog
        open={confirming}
        detail={detail}
        clientId={clientId}
        clientName={clientName}
        context={context}
        review={review}
        onClose={() => setConfirming(false)}
      />
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={false}
        employees
        onClose={() => setAbandoning(false)}
        onAbandoned={() =>
          void navigate({ to: '/clienti/$clientId/angajati', params: { clientId } })
        }
      />
    </div>
  );
}
