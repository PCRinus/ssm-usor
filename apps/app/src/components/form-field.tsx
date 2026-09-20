import { Label } from '@ssm-usor/ui/components/label';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';
import type { FieldError } from 'react-hook-form';

export function FieldMessage({ id, error }: { id: string; error?: FieldError }) {
  if (!error) return null;
  return (
    <p id={id} data-testid={id} role="alert" className="text-sm text-destructive">
      {error.message}
    </p>
  );
}

// Describe the control with `${id}-error` when invalid, otherwise `${id}-hint`.
export function Field({
  id,
  label,
  mark,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  // Left out where the distinction says nothing: a read-only value, a sign-in form.
  mark?: 'required' | 'optional';
  hint?: string;
  error?: FieldError;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-2', className)}>
      {/* The label names the control for assistive technology but does not act for it: a click
          beside a picker opened its list, and the row is as wide as the field. */}
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
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      <FieldMessage id={`${id}-error`} error={error} />
    </div>
  );
}
