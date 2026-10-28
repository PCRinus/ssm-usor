import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { AbandonImportDialog } from './abandon-import-dialog';
import { ConfirmImportDialog } from './confirm-import-dialog';
import { filesLabel, uploadSummary } from './import-format';
import { anchorOf, type Blocker, sectionIds, sectionLabels, sectionOf } from './review-model';
import { StatusTag } from './review-parts';
import {
  blockerHeading,
  blockerLinks,
  fieldStates,
  keptPaths,
  reviewName,
  sectionDescription,
  sectionIcons,
  sectionStatuses,
} from './review-summary';
import { type ImportReview, useExistingValues, useImportReview } from './use-import-review';

export function ConflictNotice({ review }: { review: ImportReview }) {
  if (review.conflict) {
    return (
      <Notice
        variant="destructive"
        data-testid="import-review-conflict"
        action={
          <Button variant="outline" size="sm" onClick={() => void review.reload()}>
            Reîncarcă propunerea
          </Button>
        }
      >
        Altcineva a modificat propunerea între timp, așa că schimbarea ta nu a fost salvată.
        Reîncarcă propunerea și fă-o din nou.
      </Notice>
    );
  }
  if (review.error) {
    return (
      <Notice variant="destructive" data-testid="import-review-error">
        {review.error}
      </Notice>
    );
  }
  return null;
}

export function ReviewHub({ detail }: { detail: ImportDetail }) {
  const proposal = detail.proposal!;
  const review = useImportReview(detail);
  const existing = useExistingValues(detail);
  const navigate = useNavigate();
  const [abandoning, setAbandoning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const blockers = detail.blockers as Blocker[];
  const states = fieldStates(proposal, review.changes, existing.valueAt);
  const statuses = sectionStatuses(
    proposal,
    review.changes,
    blockers,
    states,
    detail.registeredCompany
  );
  const links = blockerLinks(proposal, review.changes, blockers);
  const kept = keptPaths(states);
  const done = sectionIds.filter((section) => statuses[section].kind === 'done').length;
  const name = reviewName(detail, proposal, review);
  const read = detail.files.filter((file) => file.state === 'read').length;
  const summary = uploadSummary(detail.files);
  const intoExisting = detail.intoExistingClient;
  const blocked = blockers.length > 0;
  const { heading, resolve } = blockerHeading(blockers);

  return (
    <div data-testid="import-review-hub" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid max-w-3xl gap-1">
          {intoExisting && (
            <span className="text-sm text-muted-foreground">Completezi clientul existent</span>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{name}</h1>
          <p className="text-sm text-muted-foreground">
            Propunere din {filesLabel(read)} citite{summary ? ` din ${summary}` : ''}.{' '}
            {intoExisting
              ? 'Nu schimbăm nimic la client până nu confirmi.'
              : 'Nu salvăm nimic până nu creezi clientul.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/clients/import/$importId/files"
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
        </div>
      </div>
      <ConflictNotice review={review} />
      {blocked && (
        <Notice variant="destructive" title={heading} data-testid="import-blockers">
          <ul className="mt-1 grid gap-1">
            {links.map((link) => (
              <li key={`${link.anchor}-${link.code}`}>
                <Link
                  to="/clients/import/$importId/$section"
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
                  to="/clients/import/$importId/$section"
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
            return (
              <li key={section}>
                <Link
                  to="/clients/import/$importId/$section"
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
                      {sectionDescription(section, detail, proposal, review.changes, states)}
                    </span>
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
      <section
        aria-label={intoExisting ? 'Completarea clientului' : 'Crearea clientului'}
        className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-5 py-4 shadow-xs"
      >
        <p className="text-sm">
          {blocked ? (
            <>
              <span className="font-medium">{resolve}</span>{' '}
              <span className="text-muted-foreground">
                ca să poți {intoExisting ? 'completa' : 'crea'} clientul.
              </span>
            </>
          ) : (
            <span className="font-medium">
              Totul e verificat. Poți {intoExisting ? 'completa' : 'crea'} clientul.
            </span>
          )}
        </p>
        <Button
          data-testid="import-confirm"
          aria-disabled={blocked || undefined}
          className={cn(blocked && 'opacity-50')}
          onClick={() => {
            if (!blocked) setConfirming(true);
          }}
        >
          {intoExisting ? 'Completează clientul' : 'Creează clientul'}
        </Button>
      </section>
      <ConfirmImportDialog
        open={confirming}
        detail={detail}
        proposal={proposal}
        review={review}
        states={states}
        name={name}
        onClose={() => setConfirming(false)}
      />
      <AbandonImportDialog
        importId={abandoning ? detail.id : null}
        running={false}
        onClose={() => setAbandoning(false)}
        onAbandoned={() => void navigate({ to: '/clients' })}
      />
    </div>
  );
}
