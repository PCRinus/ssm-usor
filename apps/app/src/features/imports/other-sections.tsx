import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ArrowRight, ListChecks } from 'lucide-react';

import { StatusDot } from './library/decision-row';
import {
  type Changes,
  type FieldState,
  type Proposal,
  type SectionId,
  sectionIds,
  sectionLabels,
  type SectionStatus,
  spellingCorrection,
} from './review-model';
import { SpellingPill } from './review-parts';
import { sectionCorrections } from './review-summary';
import { spellingDiff } from './spelling-diff';

const asked = (status: SectionStatus) => {
  switch (status.kind) {
    case 'choice':
      return 'o alegere de făcut';
    case 'missing':
      return status.count === 1 ? 'o dată lipsă' : `${status.count} date lipsă`;
    case 'invalid':
      return status.count === 1 ? 'o valoare de corectat' : `${status.count} valori de corectat`;
    default:
      return null;
  }
};

const joined = (parts: string[]) =>
  parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} și ${parts.at(-1)}`;

export function OtherSections({
  importId,
  proposal,
  changes,
  states,
  statuses,
}: {
  importId: string;
  proposal: Proposal;
  changes: Changes;
  states: Record<string, FieldState>;
  statuses: Record<SectionId, SectionStatus>;
}) {
  const rows = sectionIds
    .filter((section) => section !== 'identity')
    .map((section) => ({
      section,
      corrections: sectionCorrections(section, proposal, changes, states),
      asked: asked(statuses[section]),
    }))
    .filter((row) => row.corrections.length > 0 || row.asked !== null);
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="review-other-sections-title"
      data-testid="review-other-sections"
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <h2
        id="review-other-sections-title"
        className="flex items-center gap-2.5 px-4 py-3.5 text-[15px] font-semibold sm:px-5"
      >
        <ListChecks className="size-4" aria-hidden="true" />
        Găsite în alte secțiuni
      </h2>
      <ul>
        {rows.map(({ section, corrections, asked }) => {
          const only = corrections.length === 1 && asked === null ? corrections[0]! : null;
          const parts = [
            ...(asked ? [asked] : []),
            ...(corrections.length > 0
              ? [
                  corrections.length === 1
                    ? 'o corectură de scriere'
                    : `${corrections.length} corecturi de scriere`,
                ]
              : []),
          ];
          const summary = joined(parts);
          const diff = only ? spellingDiff(only.corrected, only.written) : null;
          return (
            <li
              key={section}
              data-testid="review-other-section"
              className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-border/70 px-4 py-3 sm:grid-cols-[1.25rem_16rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5"
            >
              <StatusDot tone={asked ? 'todo' : 'spelling'} />
              <span className="grid">
                <span className="text-sm font-semibold">{sectionLabels[section]}</span>
                <span className="text-[13px] text-muted-foreground">
                  {only
                    ? `${only.where} · ${only.field}`
                    : `Secțiunea ${sectionIds.indexOf(section) + 1}`}
                </span>
              </span>
              <span className="col-start-2 grid min-w-0 gap-1.5 text-sm sm:col-start-auto">
                {only && diff ? (
                  <>
                    <span className="text-[13px] text-muted-foreground">
                      Scrierea corectată: {spellingCorrection(only.corrected, only.written)}
                    </span>
                    <SpellingPill runs={diff.value} written={false} />
                    <SpellingPill runs={diff.written} written />
                  </>
                ) : (
                  `${summary[0]!.toUpperCase()}${summary.slice(1)}`
                )}
              </span>
              <Button
                asChild
                variant="outline"
                className="col-start-2 mt-1 sm:col-start-auto sm:mt-0"
              >
                <Link
                  to="/clienti/import/$importId/$section"
                  params={{ importId, section }}
                  hash={only?.anchor}
                  data-testid="review-other-section-open"
                >
                  Deschide secțiunea
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
