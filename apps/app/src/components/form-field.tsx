import type { HelpTopic } from '@ssm-usor/help-topics/topics';
import { Label } from '@ssm-usor/ui/components/label';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';

import { HelpLink } from './help-link';

export function FieldMessage({
  id,
  error,
  help,
  className,
}: {
  id: string;
  error?: Partial<FieldError>;
  help?: HelpTopic;
  className?: string;
}) {
  if (!error) return null;
  return (
    <p id={id} data-testid={id} role="alert" className={cn('text-sm text-destructive', className)}>
      {error.message}
      {help && (
        <>
          {' '}
          <HelpLink topic={help} className="text-destructive">
            De ce?
          </HelpLink>
        </>
      )}
    </p>
  );
}

// Describe the control with `${id}-error` when invalid, otherwise `${id}-hint`.
export function Field({
  id,
  label,
  mark,
  hint,
  help,
  error,
  errorHelp,
  subgrid,
  className,
  children,
}: {
  id: string;
  label: string;
  // Left out where the distinction says nothing: a read-only value, a sign-in form.
  mark?: 'required' | 'optional';
  hint?: ReactNode;
  help?: HelpTopic;
  error?: FieldError;
  // The topic of the rule `error` breaks, when it is not plain to see.
  errorHelp?: HelpTopic;
  // Shares the label, control and message rows of the parent grid with the field beside it, so
  // both controls stay level when one label wraps or one message shows.
  subgrid?: 'always' | 'sm';
  className?: string;
  children: ReactNode;
}) {
  // Spaced by padding rather than gap: a gap would stay under an empty message row.
  const rowed = subgrid !== undefined;
  return (
    <div
      className={cn(
        'grid min-w-0 content-start',
        rowed ? 'gap-y-0' : 'gap-2',
        subgrid === 'always' && 'row-span-3 grid-rows-subgrid',
        subgrid === 'sm' && 'sm:row-span-3 sm:grid-rows-subgrid',
        className
      )}
    >
      {/* Inline, so a label too long for its line wraps word by word; the help link never
          goes to a line of its own. */}
      <div className={cn('text-sm leading-none whitespace-nowrap', rowed && 'self-end pb-2')}>
        {/* The label names the control for assistive technology but does not act for it: a click
            beside a picker opened its list, and the row is as wide as the field. The help link
            stays outside it, or the label would cancel its click. */}
        <Label
          htmlFor={id}
          className="inline whitespace-normal"
          onClick={(event) => event.preventDefault()}
        >
          {label}
          {mark === 'required' && (
            <>
              <span aria-hidden="true" className="ml-1 text-destructive">
                *
              </span>
              <span className="sr-only">(obligatoriu)</span>
            </>
          )}
          {mark === 'optional' && (
            <span className="ml-1 font-normal text-muted-foreground">(opțional)</span>
          )}
        </Label>
        {help && <HelpLink topic={help} label={`Ajutor: ${label}`} className="ml-1 align-middle" />}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className={cn('text-xs text-muted-foreground', rowed && 'pt-2')}>
          {hint}
        </p>
      )}
      <FieldMessage
        id={`${id}-error`}
        error={error}
        help={errorHelp}
        className={rowed ? 'pt-2' : undefined}
      />
    </div>
  );
}
