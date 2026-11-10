import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { AbandonImportDialog } from './abandon-import-dialog';
import { ConfirmImportDialog } from './confirm-import-dialog';
import { ImportActionBar } from './import-action-bar';
import { filesLabel, uploadSummary, usageLine } from './import-format';
import { ImportReviewIssues } from './import-review-issues';
import { LibraryGroup, RisksGroup } from './library/library-group';
import { ReportImportButton } from './report-import-button';
import { anchorOf, type Blocker, sectionIds, sectionLabels, sectionOf } from './review-model';
import { StatusTag } from './review-parts';
import {
  blockerHeading,
  blockerLinks,
  type ExistingScope,
  fieldStates,
  keptPaths,
  reviewName,
  sectionDescription,
  sectionIcons,
  sectionReviewHints,
  sectionStatuses,
} from './review-summary';
import { keptPosts, withoutAbsentCategories } from './training-category';
import { useExistingValues, useImportReview } from './use-import-review';

export function ReviewHub({ detail }: { detail: ImportDetail }) {
  const proposal = detail.proposal!;
  const review = useImportReview(detail);
  const existing = useExistingValues(detail);
  const navigate = useNavigate();
  const [abandoning, setAbandoning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const blockers = detail.blockers as Blocker[];
  const states = fieldStates(
    proposal,
    review.changes,
    existing.valueAt,
    detail.intoExistingClient ? null : detail.registeredCompany
  );
  const applying = withoutAbsentCategories(
    states,
    keptPosts(proposal, review.changes, existing.positions)
  );
  const statuses = sectionStatuses(
    proposal,
    review.changes,
    blockers,
    applying,
    detail.registeredCompany
  );
  const links = blockerLinks(proposal, review.changes, blockers);
  const kept = keptPaths(applying);
  const done = sectionIds.filter((section) => statuses[section].kind === 'done').length;
  const name = reviewName(detail, proposal, review.changes);
  const read = detail.files.filter((file) => file.state === 'read').length;
  const summary = uploadSummary(detail.files);
  const intoExisting = detail.intoExistingClient;
  const blocked = blockers.length > 0;
  const { heading } = blockerHeading(blockers);
  const scope: ExistingScope = {
    blockers,
    existingClient: intoExisting,
    existingWorkplaces: existing.workplaces,
    existingSubstances: intoExisting ? existing.substanceNames : null,
  };

  return (
    <div data-testid="import-review-hub" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          {intoExisting && (
            <span className="text-sm text-muted-foreground">Completezi clientul existent</span>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted-foreground">
            Propunere {read === 1 ? 'dintr-un fișier citit' : `din ${filesLabel(read)} citite`}
            {summary ? ` din ${summary}` : ''}.{' '}
            {intoExisting
              ? 'Alegerile se salvează în propunere. Clientul se completează când confirmi.'
              : 'Alegerile se salvează în propunere. Clientul se creează când confirmi.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/clienti/import/$importId/fisiere"
              params={{ importId: detail.id }}
              data-testid="import-review-files"
            >
              <FileText aria-hidden="true" />
              Fișierele importului
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAbandoning(true)}>
            Renunță la import
          </Button>
          <ReportImportButton importId={detail.id} />
        </div>
      </div>
      {blocked && (
        <Notice variant="destructive" title={heading} data-testid="import-blockers">
          <ul className="mt-1 grid gap-1">
            {links.map((link) => (
              <li key={`${link.anchor}-${link.code}`}>
                <Link
                  to="/clienti/import/$importId/$section"
                  params={{ importId: detail.id, section: link.section }}
                  hash={link.anchor}
                  className="font-medium underline underline-offset-4"
                  data-testid="import-blocker-link"
                >
                  {link.text}
                </Link>{' '}
                <span className="max-sm:hidden">în {sectionLabels[link.section]}</span>
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {kept.length > 0 && (
        <Notice variant="info" title="De verificat" data-testid="import-kept">
          <ul className="mt-1 grid gap-1">
            {kept.map((path) => (
              <li key={path}>
                <Link
                  to="/clienti/import/$importId/$section"
                  params={{ importId: detail.id, section: sectionOf(path) }}
                  hash={anchorOf(path)}
                  className="font-medium underline underline-offset-4"
                >
                  {states[path]!.label}
                </Link>{' '}
                <span>
                  în {sectionLabels[sectionOf(path)]}: diferă de aplicație, păstrăm valoarea ta
                </span>
              </li>
            ))}
          </ul>
        </Notice>
      )}
      <section aria-labelledby="import-sections-heading" className="grid gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="import-sections-heading" className="text-lg font-semibold">
            Secțiunile propunerii
          </h2>
          <span className="text-sm text-muted-foreground tabular-nums">
            {done} din {sectionIds.length} gata
          </span>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {sectionIds.map((section) => {
            const Icon = sectionIcons[section];
            const hint =
              statuses[section].kind === 'check'
                ? sectionReviewHints(section, proposal, review.changes)[0]
                : undefined;
            return (
              <li key={section}>
                <Link
                  to="/clienti/import/$importId/$section"
                  params={{ importId: detail.id, section }}
                  data-testid="import-section-link"
                  data-section={section}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-1 px-4 py-3.5 transition-colors hover:bg-muted/50 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_1rem] sm:px-5"
                >
                  <span
                    className="grid size-10 place-items-center rounded-lg bg-secondary"
                    aria-hidden="true"
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className="grid min-w-0 gap-0.5">
                    <span className="font-semibold">{sectionLabels[section]}</span>
                    <span className="text-sm text-muted-foreground max-sm:hidden">
                      {sectionDescription(
                        section,
                        detail,
                        proposal,
                        review.changes,
                        applying,
                        scope
                      )}
                    </span>
                    {hint && (
                      <span
                        className={cn(
                          'text-[13px] text-info-foreground',
                          section === 'job-positions' && 'sm:hidden'
                        )}
                      >
                        {hint.summary}
                      </span>
                    )}
                  </span>
                  <span className="justify-self-end">
                    <StatusTag status={statuses[section]} />
                  </span>
                  <ChevronRight
                    className="size-4 text-muted-foreground max-sm:hidden"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      <LibraryGroup detail={detail} />
      <RisksGroup detail={detail} />
      {detail.usage && (
        <p className="text-xs text-muted-foreground tabular-nums" data-testid="import-usage">
          {usageLine(detail.usage)}
        </p>
      )}
      <ImportActionBar
        label={intoExisting ? 'Completarea clientului' : 'Crearea clientului'}
        save={review}
        summary={
          blocked ? (
            <ImportReviewIssues
              links={links}
              onReveal={(matching) => {
                const first = [...matching].sort(
                  (left, right) =>
                    sectionIds.indexOf(left.section) - sectionIds.indexOf(right.section)
                )[0];
                if (first)
                  void navigate({
                    to: '/clienti/import/$importId/$section',
                    params: { importId: detail.id, section: first.section },
                    hash: first.anchor,
                  });
              }}
            />
          ) : (
            <StatusTag status={{ kind: 'done' }} />
          )
        }
      >
        <Button
          data-testid="import-confirm"
          aria-disabled={blocked || review.conflict || Boolean(review.error) || undefined}
          className={cn((blocked || review.conflict || review.error) && 'opacity-50')}
          onClick={() => {
            if (!blocked && !review.conflict && !review.error) setConfirming(true);
          }}
        >
          {intoExisting ? 'Completează clientul' : 'Creează clientul'}
        </Button>
      </ImportActionBar>
      <ConfirmImportDialog
        open={confirming}
        detail={detail}
        proposal={proposal}
        review={review}
        states={applying}
        scope={scope}
        name={name}
        onClose={() => setConfirming(false)}
      />
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={false}
        onClose={() => setAbandoning(false)}
        onAbandoned={() => void navigate({ to: '/clienti' })}
      />
    </div>
  );
}
