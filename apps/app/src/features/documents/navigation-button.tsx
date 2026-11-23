import { Button } from '@ssm-usor/ui/components/button';
import { TableOfContents } from 'lucide-react';

export function NavigationButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="secondary"
      size="sm"
      data-testid="editor-navigation"
      aria-expanded={open}
      aria-controls="docx-nav-panel-headings docx-nav-panel-find docx-nav-panel-goto"
      onClick={onToggle}
    >
      <TableOfContents aria-hidden="true" />
      {/* Beside a long title the label gives way, so the title is not squeezed. */}
      <span className="sm:@max-[80rem]:sr-only">Navigare</span>
    </Button>
  );
}
