import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Link } from '@tanstack/react-router';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { openedHere } from '@/app/opener';
import { HelpLink } from '@/components/help-link';

import { shortDayOf } from './legislation-labels';

export function ChangePanel({
  title,
  count,
  icon: Icon,
  help,
  testId,
  children,
}: {
  title: string;
  count?: number;
  icon?: LucideIcon;
  help: { topic: HelpTopic; label: string };
  testId: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className="overflow-hidden rounded-xl border bg-card shadow-sm"
    >
      <div className="flex items-center gap-2.5 border-b px-6 pt-5 pb-3.5 max-sm:px-4 max-sm:pt-4 max-sm:pb-2.5">
        {Icon && (
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning text-warning-foreground">
            <Icon className="size-[18px]" aria-hidden="true" />
          </span>
        )}
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {count !== undefined && (
          <span data-testid={`${testId}-count`} className="text-sm text-muted-foreground">
            {count}
          </span>
        )}
        <HelpLink topic={help.topic} label={help.label} className="-ml-1" />
      </div>
      {children}
    </section>
  );
}

export function ChangeRows({ children }: { children: ReactNode }) {
  return <ul className="divide-y">{children}</ul>;
}

export function ChangeRow({
  changeId,
  date,
  act,
  sentence,
  line,
  aside,
  testId,
}: {
  changeId: string;
  date: string;
  act: { name: string; subject: string | null };
  sentence: string | null;
  line: ReactNode;
  aside?: ReactNode;
  testId: string;
}) {
  const { day, year } = shortDayOf(date);
  return (
    <li
      data-testid={testId}
      className="relative grid grid-cols-[minmax(0,1fr)_1.25rem] gap-x-4 gap-y-1.5 px-4 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[6rem_minmax(0,1fr)_auto_1.25rem] sm:gap-x-6 sm:px-6 sm:py-[18px]"
    >
      <p
        data-testid="legal-change-date"
        className="col-span-2 flex gap-1.5 text-[13px] font-medium text-muted-foreground tabular-nums sm:col-span-1 sm:row-start-1 sm:-my-[18px] sm:grid sm:content-start sm:gap-0.5 sm:self-stretch sm:border-r sm:py-[19px] sm:font-normal"
      >
        <span className="sm:text-sm sm:font-semibold sm:text-foreground">{day}</span>
        <span>{year}</span>
      </p>
      <div className="col-start-1 grid min-w-0 gap-1 sm:col-start-2 sm:row-start-1">
        <p className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
          <Link
            to="/legislatie/modificari/$changeId"
            params={{ changeId }}
            state={openedHere}
            data-testid="legal-change-act"
            className="w-fit text-base font-semibold underline-offset-[3px] outline-none hover:underline after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            {act.name}
          </Link>
          {act.subject && <span className="text-sm text-muted-foreground">{act.subject}</span>}
        </p>
        {sentence && (
          <p data-testid="legal-change-sentence" className="max-w-[72ch] text-sm leading-relaxed">
            {sentence}
          </p>
        )}
        {line && (
          <p
            data-testid="legal-change-line"
            className="text-[13px] leading-normal text-muted-foreground"
          >
            {line}
          </p>
        )}
      </div>
      {aside && (
        <div className="col-start-1 row-start-3 sm:col-start-3 sm:row-start-1 sm:pt-0.5 sm:whitespace-nowrap">
          {aside}
        </div>
      )}
      <ChevronRight
        aria-hidden="true"
        className="col-start-2 row-start-2 mt-0.5 size-5 text-muted-foreground sm:col-start-4 sm:row-start-1"
      />
    </li>
  );
}
