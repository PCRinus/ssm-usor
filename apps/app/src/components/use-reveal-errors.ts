import { useEffect, useRef } from 'react';
import type { FieldValues, UseFormReturn } from 'react-hook-form';

// React Hook Form focuses a field only when its own validation fails, only one it can focus
// (not a combobox behind a Controller), and never for an error the server sends back, which
// is often far above the submit button. The middle of the view keeps it clear of the sticky
// header.
export function useRevealErrors<Values extends FieldValues>(form: UseFormReturn<Values>) {
  const formRef = useRef<HTMLFormElement>(null);
  const { isSubmitting, errors } = form.formState;
  const wasSubmitting = useRef(false);

  useEffect(() => {
    const finished = wasSubmitting.current && !isSubmitting;
    wasSubmitting.current = isSubmitting;
    if (finished && Object.keys(errors).length > 0) revealFirstError(formRef.current);
  }, [isSubmitting, errors]);

  return formRef;
}

function revealFirstError(form: HTMLFormElement | null) {
  const target =
    form?.querySelector<HTMLElement>('[aria-invalid="true"]') ??
    form?.querySelector<HTMLElement>('[role="alert"]');
  if (target) revealField(target);
}

export function revealField(target: HTMLElement) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  target.focus({ preventScroll: true });
}
