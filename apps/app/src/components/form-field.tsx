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
}: {
  id: string;
  error?: FieldError;
  help?: HelpTopic;
}) {
  if (!error) return null;
  return (
    <p id={id} data-testid={id} role="alert" className="text-sm text-destructive">
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
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-2', className)}>
      <div className="flex items-center gap-1">
        {/* The label names the control for assistive technology but does not act for it: a click
            beside a picker opened its list, and the row is as wide as the field. The help link
            stays outside it, or the label would cancel its click. */}
        <Label htmlFor={id} className="w-fit gap-1" onClick={(event) => event.preventDefault()}>
          {label}
          {mark === 'required' && (
            <>
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
              <span className="sr-only">(obligatoriu)</span>
            </>
          )}
          {mark === 'optional' && (
            <span className="font-normal text-muted-foreground">(opțional)</span>
          )}
        </Label>
        {help && <HelpLink topic={help} label={`Ajutor: ${label}`} />}
      </div>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldMessage id={`${id}-error`} error={error} help={errorHelp} />
    </div>
  );
}
