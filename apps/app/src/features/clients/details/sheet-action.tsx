import { Button } from '@ssm-usor/ui/components/button';
import { Pencil, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

// A screen reader lists the sheet's buttons out of their sections, so `subject` completes the
// name: „Modifică reprezentantul legal”, not one more „Modifică”. It is a label, not hidden
// text, because hidden text is joined to the visible word without a space.
export function SheetAction({
  adding = false,
  subject,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & {
  adding?: boolean;
  subject?: string;
}) {
  const verb = adding ? 'Adaugă' : 'Modifică';
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={subject ? `${verb} ${subject}` : undefined}
      {...props}
    >
      {adding ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      {children ?? verb}
    </Button>
  );
}
