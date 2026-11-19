import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { ScanText } from 'lucide-react';

import { importTabOf } from './list/import-sections';
import { tabWithWaiting } from './open-imports';
import { useMyImports } from './use-my-imports';

// Below lg the header also holds the plan badge and the setup guide's pill, which leave a tablet
// no room for the label: the link stays round there, as on a phone.
export function ImportsHeaderLink() {
  const { waiting } = useMyImports();
  if (!waiting || waiting.total === 0) return null;
  return (
    <Link
      to={importTabOf(tabWithWaiting(waiting))}
      data-testid="imports-link"
      aria-label={`Importuri AI: ${waiting.total} de verificat`}
      className="relative grid size-10 shrink-0 place-items-center rounded-full border border-input bg-card text-[13px] font-semibold whitespace-nowrap text-foreground outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:inline-flex lg:h-8 lg:w-auto lg:gap-2 lg:pr-1.5 lg:pl-2.5"
    >
      <ScanText aria-hidden="true" className="size-[18px] lg:size-4" />
      <span aria-hidden="true" className="hidden lg:inline">
        Importuri AI
      </span>
      <span
        aria-hidden="true"
        data-testid="imports-link-count"
        className={cn(
          'grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-lime px-1 text-[11px] leading-none font-bold tabular-nums',
          'absolute -top-0.5 -right-0.5 border-2 border-card',
          'lg:static lg:h-[22px] lg:min-w-[22px] lg:border-0 lg:px-1.5 lg:text-xs lg:font-semibold'
        )}
      >
        {waiting.total}
      </span>
    </Link>
  );
}
