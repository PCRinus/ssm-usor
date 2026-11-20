import { Button } from '@ssm-usor/ui/components/button';
import { TableOfContents } from 'lucide-react';

export function NavigationButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      data-testid="editor-navigation"
      aria-expanded={open}
      onClick={onToggle}
    >
      <TableOfContents aria-hidden="true" />
      <span>
        Cuprins<span className="max-sm:hidden"> și căutare</span>
      </span>
    </Button>
  );
}
