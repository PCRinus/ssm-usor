import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Sparkles } from 'lucide-react';

import type { Release } from '@/api/generated/api';
import { EmptyState } from '@/components/empty-state';

import {
  fixCount,
  formatReleaseDay,
  formatReleaseMonth,
  formatReleaseWeekday,
  improvementCount,
  newCount,
} from './release-format';
import { useAcknowledgeReleases, useReleases } from './use-releases';

const chipKinds = {
  new: 'border-success-border bg-success text-success-foreground',
  improvement: 'border-info-border bg-info text-info-foreground',
  fix: 'border-warning-border bg-warning text-warning-foreground',
};

function chipsOf(release: Release) {
  return [
    { kind: 'new' as const, count: release.features.length, label: newCount },
    { kind: 'improvement' as const, count: release.improvements.length, label: improvementCount },
    { kind: 'fix' as const, count: release.fixes.length, label: fixCount },
  ].filter((chip) => chip.count > 0);
}

function byMonth(releases: Release[]) {
  const groups: { month: string; releases: Release[] }[] = [];
  for (const release of releases) {
    const month = formatReleaseMonth(release.publishedAt);
    const last = groups.at(-1);
    if (last?.month === month) last.releases.push(release);
    else groups.push({ month, releases: [release] });
  }
  return groups;
}

function ReleaseRow({ release, last }: { release: Release; last: boolean }) {
  return (
    <li data-testid="release-row" className="flex gap-3 sm:gap-3.5">
      <div aria-hidden="true" className="flex w-3 shrink-0 flex-col items-center pt-1 sm:w-3.5">
        <span
          className={cn(
            'size-3 shrink-0 rounded-full border-2 border-foreground',
            release.unread ? 'bg-brand-lime' : 'bg-card'
          )}
        />
        {!last && <span className="mt-1 w-0.5 flex-1 bg-border" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-5 sm:flex-row sm:gap-6">
        <div className="flex flex-wrap items-baseline gap-x-2 sm:w-36 sm:shrink-0 sm:flex-col sm:gap-0.5">
          <span className="text-[15px] leading-[1.3] font-bold tracking-[-0.01em] tabular-nums">
            {release.tag}
          </span>
          <span className="text-[13px] text-muted-foreground">
            {formatReleaseWeekday(release.publishedAt)}
          </span>
        </div>
        <Link
          to="/actualizari/$tag"
          params={{ tag: release.tag }}
          data-testid="release-card"
          data-unread={release.unread || undefined}
          className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-card px-4 py-3.5 outline-none transition-shadow hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 data-unread:border-foreground sm:px-5 sm:py-[18px]"
        >
          <span className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="text-base leading-[1.35] font-semibold sm:text-[17px] sm:leading-[1.3]">
              {release.headline}
            </span>
            {release.unread && (
              <span className="shrink-0 rounded-full bg-brand-lime px-2 py-0.5 text-xs font-semibold">
                Necitită
              </span>
            )}
          </span>
          {release.lead && (
            <span className="text-sm leading-[1.55] text-release-body">{release.lead}</span>
          )}
          <span className="flex flex-wrap gap-1.5 pt-0.5 sm:pt-1">
            {chipsOf(release).map((chip) => (
              <span
                key={chip.kind}
                data-testid="release-chip"
                className={cn(
                  'rounded-full border px-[9px] py-[3px] text-xs font-medium',
                  chipKinds[chip.kind]
                )}
              >
                {chip.label(chip.count)}
              </span>
            ))}
          </span>
        </Link>
      </div>
    </li>
  );
}

export function UpdatesPage() {
  const { releases, unreadCount } = useReleases();
  const { acknowledge, pending } = useAcknowledgeReleases();
  const oldest = releases.at(-1);

  return (
    <div data-testid="updates-page" className="mx-auto grid w-full max-w-[860px] gap-5 sm:gap-7">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1.5">
        <div className="grid max-w-[560px] gap-1.5">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] sm:text-[28px]">Actualizări</h1>
          <p className="text-[15px] leading-[1.55] text-release-body">
            Ce s-a schimbat în SSM Ușor, de la cea mai nouă versiune la prima.
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            data-testid="updates-acknowledge-all"
            variant="outline"
            disabled={pending}
            onClick={() => acknowledge()}
            className="h-10 rounded-[10px] max-sm:h-11 max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:font-semibold max-sm:underline max-sm:underline-offset-[3px] max-sm:shadow-none"
          >
            Marchează toate ca citite
          </Button>
        )}
      </div>

      {releases.length === 0 ? (
        <EmptyState icon={Sparkles} className="py-10" data-testid="updates-empty">
          Nicio actualizare încă.
        </EmptyState>
      ) : (
        <>
          {byMonth(releases).map((group) => (
            <section key={group.month} data-testid="release-month">
              <h2 className="mb-3 text-[15px] font-semibold text-release-body">{group.month}</h2>
              <ol>
                {group.releases.map((release) => (
                  <ReleaseRow key={release.tag} release={release} last={release === oldest} />
                ))}
              </ol>
            </section>
          ))}
          {oldest && (
            <p className="text-sm leading-normal text-muted-foreground">
              Acestea sunt toate versiunile. Prima a fost publicată pe{' '}
              {formatReleaseDay(oldest.publishedAt)}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
