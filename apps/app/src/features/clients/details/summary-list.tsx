import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ComponentProps, ReactNode } from 'react';

import { HelpLink } from '@/components/help-link';

export const summaryQuiet = 'text-section-tab-foreground';

export function SummaryList({ className, ...props }: ComponentProps<'dl'>) {
  return <dl className={cn('grid text-sm', className)} {...props} />;
}

// The action lives in the value's dd because a row of a dl may hold only dt and dd; `contents`
// still gives it a grid column of its own, beside the label on a phone.
export function SummaryRow({
  label,
  help,
  action,
  form,
  testId,
  children,
}: {
  label: string;
  help?: HelpTopic;
  action?: ReactNode;
  form?: ReactNode;
  testId?: string;
  children?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 border-t border-border/70 py-3 first:border-t-0 first:pt-1 sm:grid-cols-[12.5rem_minmax(0,1fr)_auto]"
    >
      <dt
        className={cn(
          'flex items-center sm:block sm:pt-px',
          action && 'min-h-8 sm:min-h-0',
          summaryQuiet
        )}
      >
        <span className="whitespace-nowrap">
          {label}
          {help && (
            <HelpLink topic={help} label={`Ajutor: ${label}`} className="ml-1 align-middle" />
          )}
        </span>
      </dt>
      {form ? (
        <dd className="col-span-full pt-2">{form}</dd>
      ) : (
        <dd className="contents">
          <div className="col-span-full row-start-2 min-w-0 wrap-anywhere sm:col-span-1 sm:col-start-2 sm:row-start-1">
            {children === undefined ||
            children === null ||
            children === false ||
            children === '' ? (
              <SummaryEmpty />
            ) : (
              children
            )}
          </div>
          {action && (
            <div className="col-start-2 row-start-1 flex justify-end sm:col-start-3">{action}</div>
          )}
        </dd>
      )}
    </div>
  );
}

export function SummaryNote({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn('mt-0.5 block text-[0.8125rem] leading-5', summaryQuiet, className)}
      {...props}
    />
  );
}

export function SummaryEmpty(props: ComponentProps<'span'>) {
  return (
    <span className="text-muted-foreground" {...props}>
      —
    </span>
  );
}
