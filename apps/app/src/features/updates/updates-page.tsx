import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';

import type { Release } from '@/api/generated/api';
import { openedHere } from '@/app/opener';
import { EmptyState } from '@/components/empty-state';
import { HelpLink } from '@/components/help-link';

import { InlineMarkdown } from './inline-markdown';
import {
  fixCount,
  formatReleaseDay,
  formatReleaseMonth,
  formatReleaseWeekday,
  improvementCount,
  newCount,
  releaseMonthKey,
  unreadCount as unreadLabel,
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

type MonthGroup = { key: string; month: string; releases: Release[]; unread: number };

function byMonth(releases: Release[]) {
  const groups: MonthGroup[] = [];
  for (const release of releases) {
    const key = releaseMonthKey(release.publishedAt);
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, month: formatReleaseMonth(release.publishedAt), releases: [], unread: 0 };
      groups.push(group);
    }
    group.releases.push(release);
    if (release.unread) group.unread += 1;
  }
  return groups;
}

function UnreadPill({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-full bg-brand-lime px-2 py-0.5 text-xs font-semibold text-foreground">
      {unreadLabel(count)}
    </span>
  );
}

function MonthPicker({ months, shown }: { months: MonthGroup[]; shown: MonthGroup }) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="updates-month-picker"
          variant="outline"
          className="h-10 rounded-[10px] max-sm:h-11"
        >
          {shown.month}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuRadioGroup
          value={shown.key}
          onValueChange={(key) => void navigate({ to: '/actualizari', search: { luna: key } })}
        >
          {months.map((group) => (
            <DropdownMenuRadioItem
              key={group.key}
              value={group.key}
              data-testid="updates-month-option"
              className="justify-between gap-4 py-2"
            >
              {group.month}
              {group.unread > 0 && <UnreadPill count={group.unread} />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MonthLink({ group, direction }: { group: MonthGroup; direction: 'newer' | 'older' }) {
  return (
    <Button variant="outline" asChild className="h-10 rounded-[10px] max-sm:h-11">
      <Link
        to="/actualizari"
        search={{ luna: group.key }}
        data-testid={direction === 'newer' ? 'updates-newer-month' : 'updates-older-month'}
        className={direction === 'older' ? 'ml-auto' : undefined}
      >
        {direction === 'newer' && <ChevronLeft aria-hidden="true" />}
        {group.month}
        {group.unread > 0 && <UnreadPill count={group.unread} />}
        {direction === 'older' && <ChevronRight aria-hidden="true" />}
      </Link>
    </Button>
  );
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
          state={openedHere}
          params={{ tag: release.tag }}
          data-testid="release-card"
          data-unread={release.unread || undefined}
          className="flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-card px-4 py-3.5 outline-none transition-shadow hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 data-unread:border-foreground sm:px-5 sm:py-[18px]"
        >
          <span className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
            <span className="text-base leading-[1.35] font-semibold sm:text-[17px] sm:leading-[1.3]">
              <InlineMarkdown text={release.headline} />
            </span>
            {release.unread && (
              <span className="shrink-0 rounded-full bg-brand-lime px-2 py-0.5 text-xs font-semibold">
                Necitită
              </span>
            )}
          </span>
          {release.lead && (
            <span className="text-sm leading-[1.55] text-release-body">
              <InlineMarkdown text={release.lead} />
            </span>
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

export function UpdatesPage({ month }: { month?: string }) {
  const { releases, unreadCount } = useReleases();
  const { acknowledge, pending } = useAcknowledgeReleases();
  const months = byMonth(releases);
  const index = Math.max(
    0,
    months.findIndex((group) => group.key === month)
  );
  const shown = months[index];
  const newer = months[index - 1];
  const older = months[index + 1];
  const oldest = releases.at(-1);

  return (
    <div data-testid="updates-page" className="mx-auto grid w-full max-w-[860px] gap-5 sm:gap-7">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-1.5">
          <h1 className="text-[26px] font-bold tracking-[-0.02em] sm:text-[28px]">Actualizări</h1>
          <HelpLink topic="actualizari.lista" label="Ajutor: Actualizări" />
        </div>
        {shown && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {unreadCount > 0 && (
              <Button
                data-testid="updates-acknowledge-all"
                variant="outline"
                disabled={pending}
                onClick={() => acknowledge()}
                className="h-10 rounded-[10px] max-sm:order-last max-sm:h-11 max-sm:border-0 max-sm:bg-transparent max-sm:px-0 max-sm:font-semibold max-sm:underline max-sm:underline-offset-[3px] max-sm:shadow-none"
              >
                Marchează toate ca citite
              </Button>
            )}
            <MonthPicker months={months} shown={shown} />
          </div>
        )}
      </div>

      {!shown ? (
        <EmptyState icon={Megaphone} className="py-10" data-testid="updates-empty">
          Nicio actualizare încă.
        </EmptyState>
      ) : (
        <>
          <section data-testid="release-month">
            <h2 className="mb-3 text-[15px] font-semibold text-release-body">{shown.month}</h2>
            <ol>
              {shown.releases.map((release) => (
                <ReleaseRow
                  key={release.tag}
                  release={release}
                  last={release === shown.releases.at(-1)}
                />
              ))}
            </ol>
          </section>
          {(newer || older) && (
            <nav aria-label="Alte luni" className="flex flex-wrap gap-3">
              {newer && <MonthLink group={newer} direction="newer" />}
              {older && <MonthLink group={older} direction="older" />}
            </nav>
          )}
          {!older && oldest && (
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
