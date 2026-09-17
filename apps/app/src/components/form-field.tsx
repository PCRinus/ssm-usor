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

// A labelled form control with an optional hint and its validation message.
// Describe the control with `${id}-error` when invalid, otherwise `${id}-hint`.
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: FieldError;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
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
