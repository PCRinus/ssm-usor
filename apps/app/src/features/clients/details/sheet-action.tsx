import { Button } from '@ssm-usor/ui/components/button';
import { Pencil, Plus } from 'lucide-react';
import type { ComponentProps } from 'react';

export function SheetAction({
  adding = false,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'variant' | 'size'> & { adding?: boolean }) {
  return (
    <Button variant="secondary" size="sm" {...props}>
      {adding ? <Plus aria-hidden="true" /> : <Pencil aria-hidden="true" />}
      {children ?? (adding ? 'Adaugă' : 'Modifică')}
    </Button>
  );
}
